import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { ensure } from "@/server/errors";
import { isTestAuthEnabled } from "@/server/config";
export type LearningContext = Omit<ServiceContext, "db"> & {
  db: PrismaClient | Prisma.TransactionClient;
};
export type LearningAccess = {
  role: "student" | "guardian" | "instructor";
  academyId: string;
  offeringId: string;
  userId: string;
  studentId?: string;
  enrollmentId?: string;
};
export type LearningOptions = { studentId?: string; sessionId?: string };
export function learningEnabled() {
  return (
    process.env.LEARNING_ENABLED === "true" ||
    process.env.NODE_ENV === "test" ||
    isTestAuthEnabled()
  );
}
async function actor(ctx: LearningContext) {
  ensure(learningEnabled(), "UNAVAILABLE");
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.actor.userId },
  });
  ensure(user && !user.disabledAt, "UNAUTHENTICATED");
  return user;
}
async function offering(
  ctx: LearningContext,
  offeringId: string,
  sessionId?: string,
) {
  z.uuid().parse(offeringId);
  if (sessionId) z.uuid().parse(sessionId);
  const found = await ctx.db.offering.findUnique({
    where: { id: offeringId },
    include: { academy: true },
  });
  ensure(found, "FORBIDDEN");
  if (sessionId)
    ensure(
      await ctx.db.session.findFirst({
        where: { id: sessionId, offeringId, academyId: found.academyId },
      }),
      "FORBIDDEN",
    );
  return found;
}
export async function requireTeachingAccess(
  ctx: LearningContext,
  offeringId: string,
) {
  await actor(ctx);
  const o = await offering(ctx, offeringId);
  const member = await ctx.db.academyMembership.findUnique({
    where: {
      academyId_userId: { academyId: o.academyId, userId: ctx.actor.userId },
    },
  });
  const assigned = await ctx.db.instructorAssignment.findUnique({
    where: { offeringId_userId: { offeringId, userId: ctx.actor.userId } },
  });
  ensure(
    member?.active && ["instructor", "owner"].includes(member.role) && assigned,
    "FORBIDDEN",
  );
  return {
    role: "instructor" as const,
    offeringId,
    academyId: o.academyId,
    userId: ctx.actor.userId,
  };
}
export async function requireEnrollmentAccess(
  ctx: LearningContext,
  offeringId: string,
  studentId: string,
  options: { sessionId?: string; historical?: boolean } = {},
) {
  const o = await offering(ctx, offeringId, options.sessionId);
  const enrollment = await ctx.db.enrollment.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
    include: {
      order: { include: { payment: true } },
      student: { include: { account: true } },
      sessions: true,
    },
  });
  ensure(
    enrollment &&
      (enrollment.status === "active" ||
        (options.historical && enrollment.status === "completed")),
    "FORBIDDEN",
  );
  const order = enrollment.order;
  ensure(
    order &&
      ["paid", "partially_refunded"].includes(order.status) &&
      order.payment?.verifiedAt &&
      ["paid", "partially_refunded"].includes(order.payment.status),
    "FORBIDDEN",
  );
  ensure(!enrollment.student.account?.disabledAt, "FORBIDDEN");
  ensure(
    options.sessionId
      ? enrollment.sessions.some(
          (s) => s.sessionId === options.sessionId && s.status === "allowed",
        )
      : enrollment.sessions.some((s) => s.status === "allowed"),
    "FORBIDDEN",
  );
  if (!options.historical)
    ensure(
      o.academy.status === "approved" &&
        ["published", "closed", "completed"].includes(o.status),
      "FORBIDDEN",
    );
  return { enrollment, offering: o };
}
export async function requireStudentAccess(
  ctx: LearningContext,
  offeringId: string,
  options: { sessionId?: string; historical?: boolean } = {},
) {
  await actor(ctx);
  const student = await ctx.db.studentProfile.findUnique({
    where: { accountUserId: ctx.actor.userId },
  });
  ensure(student, "FORBIDDEN");
  const { enrollment, offering: o } = await requireEnrollmentAccess(
    ctx,
    offeringId,
    student.id,
    options,
  );
  ensure(
    o.academy.status === "approved" &&
      ["published", "closed", "completed"].includes(o.status),
    "FORBIDDEN",
  );
  return {
    role: "student" as const,
    studentId: student.id,
    enrollmentId: enrollment.id,
    offeringId,
    academyId: o.academyId,
    userId: ctx.actor.userId,
  };
}
export async function requireLearningRead(
  ctx: LearningContext,
  offeringId: string,
  options: LearningOptions = {},
): Promise<LearningAccess> {
  const user = await actor(ctx);
  const o = await offering(ctx, offeringId, options.sessionId);
  const student = options.studentId
    ? await ctx.db.studentProfile.findUnique({
        where: { id: options.studentId },
      })
    : await ctx.db.studentProfile.findUnique({
        where: { accountUserId: user.id },
      });
  if (student?.accountUserId === user.id) {
    const { enrollment } = await requireEnrollmentAccess(
      ctx,
      offeringId,
      student.id,
      { ...options, historical: true },
    );
    return {
      role: "student",
      offeringId,
      academyId: o.academyId,
      userId: user.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
    };
  }
  if (student && user.guardianVerifiedAt) {
    const link = await ctx.db.guardianLink.findUnique({
      where: {
        guardianId_studentId: { guardianId: user.id, studentId: student.id },
      },
    });
    if (link?.verifiedAt && !link.revokedAt) {
      const { enrollment } = await requireEnrollmentAccess(
        ctx,
        offeringId,
        student.id,
        { ...options, historical: true },
      );
      return {
        role: "guardian",
        offeringId,
        academyId: o.academyId,
        userId: user.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
      };
    }
  }
  const teacher = await requireTeachingAccess(ctx, offeringId);
  if (options.studentId)
    await requireEnrollmentAccess(ctx, offeringId, options.studentId, {
      ...options,
      historical: true,
    });
  return { ...teacher, studentId: options.studentId };
}
