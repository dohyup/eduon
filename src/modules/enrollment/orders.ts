import "server-only";
import { recordConversion } from "@/modules/analytics/events";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import type { Outcome } from "@/server/errors";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import {
  commercePolicy,
  readSessionSnapshots,
  snapshotSessions,
  type CommercePolicySnapshot,
} from "@/modules/payments/policy";
import {
  expireStudentReservations,
  lockCommerceResources,
  occupiedSeats,
} from "./reservations";
import type { CreateOrderInput, OrderView } from "./types";
export type { OrderView, CreateOrderInput } from "./types";
const inputSchema = z
  .object({
    studentId: z.uuid(),
    offeringId: z.uuid(),
    requestKey: z.string().trim().min(1).max(120),
    consent: z.literal(true).optional(),
  })
  .strict();

export function createOrder(
  ctx: ServiceContext,
  input: CreateOrderInput,
): Promise<Outcome<{ orderId: string; amountWon: number; expiresAt: string }>> {
  return attempt(async () => {
    await requireActor(ctx);
    const data = inputSchema.parse(input);
    const existing = await ctx.db.order.findUnique({
      where: {
        parentId_requestKey: {
          parentId: ctx.actor.userId,
          requestKey: data.requestKey,
        },
      },
      select: { studentId: true, offeringId: true },
    });
    ensure(
      !existing ||
        (existing.studentId === data.studentId &&
          existing.offeringId === data.offeringId),
      "CONFLICT",
    );
    const resource = await ctx.db.offering.findUnique({
      where: { id: data.offeringId },
      select: { academyId: true },
    });
    ensure(resource, "NOT_FOUND");
    const now = ctx.now();
    return ctx.db.$transaction(async (tx) => {
      await lockCommerceResources(
        tx,
        data.studentId,
        data.offeringId,
        resource.academyId,
        now,
      );
      const actor = await tx.user.findUnique({
        where: { id: ctx.actor.userId },
      });
      ensure(actor && !actor.disabledAt, "UNAUTHENTICATED");
      const previous = await tx.order.findUnique({
        where: {
          parentId_requestKey: {
            parentId: actor.id,
            requestKey: data.requestKey,
          },
        },
      });
      if (previous) {
        ensure(
          previous.studentId === data.studentId &&
            previous.offeringId === data.offeringId,
          "CONFLICT",
        );
        if (data.consent && !previous.consentedAt)
          await tx.order.update({
            where: { id: previous.id },
            data: { consentedAt: now, updatedAt: now },
          });
        return {
          orderId: previous.id,
          amountWon: previous.amountWon,
          expiresAt: previous.expiresAt.toISOString(),
        };
      }
      ensure(actor.guardianVerifiedAt, "FORBIDDEN");
      const link = await tx.guardianLink.findFirst({
        where: {
          guardianId: actor.id,
          studentId: data.studentId,
          revokedAt: null,
          verifiedAt: { lte: now },
        },
        include: { student: { include: { account: true } } },
      });
      ensure(link && !link.student.account?.disabledAt, "FORBIDDEN");
      const offering = await tx.offering.findUniqueOrThrow({
        where: { id: data.offeringId },
        include: { academy: true, course: true, sessions: true },
      });
      ensure(
        offering.academyId === resource.academyId &&
          offering.academy.status === "approved" &&
          offering.status === "published",
        "UNAVAILABLE",
      );
      ensure(
        offering.enrollmentOpensAt <= now &&
          offering.enrollmentClosesAt > now &&
          offering.sessions.length > 0 &&
          offering.sessions.every(
            (s) => s.startsAt > now && s.endsAt > s.startsAt,
          ),
        "UNAVAILABLE",
      );
      ensure(
        link.student.grade >= offering.course.gradeMin &&
          link.student.grade <= offering.course.gradeMax,
        "VALIDATION",
      );
      // A zero-price cohort needs a separate free-admission contract, not a PG hold.
      ensure(offering.priceWon > 0, "VALIDATION");
      await expireStudentReservations(tx, data.studentId, now);
      const duplicate = await tx.enrollment.findFirst({
        where: {
          studentId: data.studentId,
          offeringId: data.offeringId,
        },
      });
      const pending = await tx.order.findFirst({
        where: {
          studentId: data.studentId,
          offeringId: data.offeringId,
          status: { in: ["pending_payment", "paid", "partially_refunded"] },
        },
      });
      ensure(!duplicate && !pending, "CONFLICT");
      const overlaps = offering.sessions.map((s) => ({
        startsAt: { lt: s.endsAt },
        endsAt: { gt: s.startsAt },
      }));
      const activeConflict = await tx.enrollment.findFirst({
        where: {
          studentId: data.studentId,
          status: { in: ["active", "pending_payment"] },
          OR: [
            {
              sessions: {
                some: {
                  status: { in: ["allowed", "refund_pending"] },
                  OR: overlaps,
                },
              },
            },
            // Legacy enrollments predate per-session access records.
            {
              sessions: { none: {} },
              offering: { sessions: { some: { OR: overlaps } } },
            },
          ],
        },
      });
      const heldOrders = await tx.order.findMany({
        where: {
          studentId: data.studentId,
          status: "pending_payment",
          reservation: { status: "held", expiresAt: { gt: now } },
        },
        select: { sessionsSnapshot: true },
      });
      const heldConflict = heldOrders.some((o) =>
        readSessionSnapshots(o.sessionsSnapshot).some((s) =>
          offering.sessions.some(
            (other) =>
              new Date(s.startsAt) < other.endsAt &&
              new Date(s.endsAt) > other.startsAt,
          ),
        ),
      );
      ensure(!activeConflict && !heldConflict, "CONFLICT");
      ensure(
        (await occupiedSeats(tx, offering.id, now)) < offering.capacity,
        "SOLD_OUT",
      );
      const policy = commercePolicy(offering.academyId);
      const expiresAt = new Date(
        Math.min(
          now.getTime() + policy.reservationMinutes * 60_000,
          offering.enrollmentClosesAt.getTime(),
          ...offering.sessions.map((s) => s.startsAt.getTime()),
        ),
      );
      // Zero commission belongs exclusively to the synthetic policy snapshot.
      const feeWon = Math.floor(
        (offering.priceWon * policy.fee.basisPoints) / 10_000,
      );
      const order = await tx.order.create({
        data: {
          parentId: actor.id,
          studentId: data.studentId,
          offeringId: offering.id,
          academyId: offering.academyId,
          requestKey: data.requestKey,
          amountWon: offering.priceWon,
          feeWon,
          policyVersion: policy.version,
          policySnapshot: policy,
          sessionsSnapshot: snapshotSessions(
            offering.sessions,
            offering.priceWon,
          ),
          consentedAt: data.consent ? now : null,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.seatReservation.create({
        data: {
          orderId: order.id,
          studentId: data.studentId,
          offeringId: offering.id,
          academyId: offering.academyId,
          expiresAt,
          createdAt: now,
        },
      });
      if (!offering.purchaseLockedAt)
        await tx.offering.update({
          where: { id: offering.id },
          data: { purchaseLockedAt: now },
        });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "order.created",
          targetId: order.id,
          createdAt: now,
        },
      });
      await recordConversion(tx, {
        stage: "application",
        academyId: order.academyId,
        offeringId: order.offeringId,
        orderId: order.id,
        actorId: actor.id,
        dedupeKey: `application:${order.id}`,
        now,
      });
      return {
        orderId: order.id,
        amountWon: order.amountWon,
        expiresAt: expiresAt.toISOString(),
      };
    });
  });
}
const viewInclude = {
  student: { select: { name: true } },
  offering: { select: { course: { select: { title: true } } } },
  academy: { select: { name: true } },
  enrollment: {
    include: { sessions: { orderBy: { startsAt: "asc" as const }, take: 100 } },
  },
  refunds: { orderBy: { createdAt: "desc" as const }, take: 100 },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof viewInclude }>;
function orderView(o: OrderRow): OrderView {
  return {
    id: o.id,
    studentId: o.studentId,
    studentName: o.student.name,
    offeringId: o.offeringId,
    courseTitle: o.offering.course.title,
    academyId: o.academyId,
    academyName: o.academy.name,
    amountWon: o.amountWon,
    currency: "KRW",
    status: o.status,
    policyVersion: o.policyVersion,
    policySnapshot: o.policySnapshot as CommercePolicySnapshot,
    sessions: readSessionSnapshots(o.sessionsSnapshot),
    expiresAt: o.expiresAt.toISOString(),
    consentedAt: o.consentedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    exceptionReason: o.exceptionReason,
    enrollment: o.enrollment && {
      id: o.enrollment.id,
      status: o.enrollment.status,
      sessions: o.enrollment.sessions.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        status: s.status,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        amountWon: s.amountWon,
      })),
    },
    refunds: o.refunds.map((r) => ({
      id: r.id,
      status: r.status,
      amountWon: r.amountWon,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
export function getOrder(
  ctx: ServiceContext,
  orderId: string,
): Promise<Outcome<OrderView>> {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(orderId);
    const order = await ctx.db.order.findFirst({
      where: { id: orderId, parentId: ctx.actor.userId },
      include: viewInclude,
    });
    ensure(order, "NOT_FOUND");
    return orderView(order);
  });
}
export function listOrders(
  ctx: ServiceContext,
  cursor?: string,
): Promise<Outcome<OrderView[]>> {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().optional().parse(cursor);
    const rows = await ctx.db.order.findMany({
      where: { parentId: ctx.actor.userId },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      include: viewInclude,
    });
    return rows.map(orderView);
  });
}
export function getEnrollmentForOrder(
  sys: { db: PrismaClient },
  orderId: string,
): Promise<{ status: string } | null> {
  z.uuid().parse(orderId);
  return sys.db.enrollment.findUnique({
    where: { orderId },
    select: { status: true },
  });
}
