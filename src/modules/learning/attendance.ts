import "server-only";
import { recordConversion } from "@/modules/analytics/events";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireEnrollmentAccess, requireTeachingAccess } from "./access";
import { lockOrder } from "@/modules/payments/locking";
const schema = z.object({
  sessionId: z.uuid(),
  studentId: z.uuid(),
  status: z.enum(["present", "absent", "late"]),
  reason: z.string().trim().min(1).max(2000),
});
export function recordAttendance(
  ctx: ServiceContext,
  input: z.input<typeof schema>,
) {
  return attempt(async () => {
    const p = schema.parse(input);
    await ctx.db.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: p.sessionId },
      });
      ensure(session, "FORBIDDEN");
      const enrollment = await tx.enrollment.findUnique({
        where: {
          offeringId_studentId: {
            offeringId: session.offeringId,
            studentId: p.studentId,
          },
        },
      });
      ensure(enrollment?.orderId, "FORBIDDEN");
      await lockOrder(tx, enrollment.orderId, ctx.now());
      const scoped = { ...ctx, db: tx };
      const teacher = await requireTeachingAccess(scoped, session.offeringId);
      const rights = await requireEnrollmentAccess(
        scoped,
        session.offeringId,
        p.studentId,
        {
          sessionId: p.sessionId,
          historical: true,
        },
      );
      ensure(
        rights.offering.academy.status === "approved" &&
          ["published", "closed", "completed"].includes(rights.offering.status),
        "FORBIDDEN",
      );
      ensure(ctx.now() >= session.startsAt, "VALIDATION");
      const data = {
        status: p.status,
        reason: p.reason,
        authorId: ctx.actor.userId,
        recordedAt: ctx.now(),
      };
      const row = await tx.attendance.upsert({
        where: {
          sessionId_studentId: {
            sessionId: p.sessionId,
            studentId: p.studentId,
          },
        },
        create: {
          ...data,
          sessionId: p.sessionId,
          studentId: p.studentId,
          enrollmentId: enrollment.id,
          offeringId: session.offeringId,
          academyId: teacher.academyId,
        },
        update: data,
      });
      await tx.attendanceRevision.create({
        data: {
          attendanceId: row.id,
          status: p.status,
          reason: p.reason,
          authorId: ctx.actor.userId,
          createdAt: ctx.now(),
        },
      });
      if (p.status !== "absent")
        await recordConversion(tx, {
          stage: "first_participation",
          academyId: teacher.academyId,
          offeringId: session.offeringId,
          enrollmentId: enrollment.id,
          dedupeKey: `first-participation:${enrollment.id}`,
          now: ctx.now(),
        });
      if (session.endsAt <= ctx.now())
        await tx.enrollmentSession.update({
          where: {
            enrollmentId_sessionId: {
              enrollmentId: enrollment.id,
              sessionId: p.sessionId,
            },
          },
          data: { completedAt: p.status === "absent" ? null : ctx.now() },
        });
    });
  });
}
