import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { SystemContext } from "@/server/context";
import { lockOrder } from "@/modules/payments/locking";
import { learningEnabled } from "./access";
const graceMs = 600_000;
const paidEnrollment: Prisma.EnrollmentWhereInput = {
  status: "active",
  orderId: { not: null },
  order: {
    status: { in: ["paid", "partially_refunded"] },
    payment: {
      verifiedAt: { not: null },
      status: { in: ["paid", "partially_refunded"] },
    },
  },
};
/** Durable keyset scan: late verification and >100 offerings are revisited. */
export async function scheduleOfferingCompletions(sys: SystemContext) {
  if (!learningEnabled()) return { scheduled: 0 };
  return sys.db.$transaction(
    async (tx) => {
      const now = sys.now();
      const dedupeKey = "scan:complete_offering";
      const marker = await tx.job.upsert({
        where: { dedupeKey },
        create: {
          type: "reconciliation_cursor",
          status: "succeeded",
          dedupeKey,
          payloadJson: {},
          runAt: now,
        },
        update: { updatedAt: now },
      });
      const state = z
        .object({ cursorId: z.uuid().optional() })
        .strict()
        .parse(marker.payloadJson);
      const read = (cursor?: string) =>
        tx.offering.findMany({
          where: {
            ...(cursor ? { id: { gt: cursor } } : {}),
            sessions: {
              some: {},
              none: { endsAt: { gte: new Date(now.getTime() - graceMs) } },
            },
            enrollments: { some: paidEnrollment },
          },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 100,
        });
      let rows = await read(state.cursorId);
      if (!rows.length && state.cursorId) rows = await read();
      for (const row of rows) {
        const key = `complete_offering:${row.id}`;
        await tx.job.upsert({
          where: { dedupeKey: key },
          create: {
            type: "complete_offering",
            dedupeKey: key,
            payloadJson: { offeringId: row.id },
            runAt: now,
          },
          update: {},
        });
        // Completed scans can be reopened when later provider verification creates
        // another eligible enrollment. Failed work remains an explicit admin retry.
        await tx.job.updateMany({
          where: { dedupeKey: key, status: "succeeded" },
          data: {
            status: "pending",
            attempts: 0,
            lastError: null,
            payloadJson: { offeringId: row.id },
            runAt: now,
            updatedAt: now,
          },
        });
      }
      await tx.job.update({
        where: { id: marker.id },
        data: {
          payloadJson: rows.length ? { cursorId: rows.at(-1)!.id } : {},
          updatedAt: now,
        },
      });
      return { scheduled: rows.length };
    },
    { timeout: 15_000 },
  );
}
export async function completeOffering(
  sys: SystemContext,
  offeringId: string,
  options: { cursorStudentId?: string; limit?: number } = {},
) {
  const page = z
    .object({
      cursorStudentId: z.uuid().optional(),
      limit: z.number().int().min(1).max(100).default(100),
    })
    .strict()
    .parse(options);
  if (!learningEnabled()) return { checked: 0, completed: 0, nextCursor: null };
  z.uuid().parse(offeringId);
  const lastSession = await sys.db.session.findFirst({
    where: { offeringId },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true },
  });
  if (
    !lastSession ||
    lastSession.endsAt.getTime() + graceMs >= sys.now().getTime()
  )
    return { checked: 0, completed: 0, nextCursor: null };
  const refs = await sys.db.enrollment.findMany({
    where: {
      offeringId,
      ...paidEnrollment,
      ...(page.cursorStudentId
        ? { studentId: { gt: page.cursorStudentId } }
        : {}),
    },
    select: { id: true, orderId: true, studentId: true },
    orderBy: { studentId: "asc" },
    take: page.limit + 1,
  });
  let completed = 0;
  for (const ref of refs.slice(0, page.limit))
    completed += await sys.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, ref.orderId!, sys.now());
      if (
        order.enrollment?.status !== "active" ||
        !["paid", "partially_refunded"].includes(order.status) ||
        !order.payment?.verifiedAt ||
        !["paid", "partially_refunded"].includes(order.payment.status)
      )
        return 0;
      const latest = await tx.session.findFirst({
        where: { offeringId },
        orderBy: { endsAt: "desc" },
        select: { endsAt: true },
      });
      if (!latest || latest.endsAt.getTime() + graceMs >= sys.now().getTime())
        return 0;
      const attended = await tx.attendance.findMany({
        where: { enrollmentId: ref.id, status: { in: ["present", "late"] } },
        select: { sessionId: true },
      });
      await tx.enrollmentSession.updateMany({
        where: {
          enrollmentId: ref.id,
          status: "allowed",
          endsAt: { lte: sys.now() },
          completedAt: null,
          sessionId: { in: attended.map((row) => row.sessionId) },
        },
        data: { completedAt: sys.now() },
      });
      const changed = await tx.enrollment.updateMany({
        where: { id: ref.id, status: "active" },
        data: { status: "completed" },
      });
      return changed.count;
    });
  return {
    checked: Math.min(refs.length, page.limit),
    completed,
    nextCursor:
      refs.length > page.limit ? refs[page.limit - 1].studentId : null,
  };
}
