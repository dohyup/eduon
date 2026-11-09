import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { lockAcademy } from "@/modules/academies/service";
import {
  requireTeachingAccess,
  requireStudentAccess,
  requireLearningRead,
} from "./access";
import type { LearningAccess } from "./access";
const assignmentInput = z
  .object({
    offeringId: z.uuid(),
    sessionId: z.uuid().optional(),
    title: z.string().trim().min(1).max(160),
    instructions: z.string().max(10000),
    dueAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const submissionInput = z
  .object({
    assignmentId: z.uuid(),
    text: z.string().max(10000),
    fileIds: z.array(z.uuid()).max(5),
  })
  .strict()
  .refine(
    (d) =>
      new Set(d.fileIds).size === d.fileIds.length &&
      (d.text.trim().length > 0 || d.fileIds.length > 0),
  );
const pageInput = z
  .object({
    offeringId: z.uuid(),
    studentId: z.uuid().optional(),
    cursor: z.uuid().optional(),
  })
  .strict();
export const learningTransactionContext = (
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): ServiceContext => ({ ...ctx, db: tx as ServiceContext["db"] });
export async function validateLearningSession(
  ctx: ServiceContext,
  offeringId: string,
  sessionId?: string | null,
) {
  if (sessionId)
    ensure(
      await ctx.db.session.findFirst({
        where: { id: sessionId, offeringId },
        select: { id: true },
      }),
      "FORBIDDEN",
    );
}
/** Apply rights before take/cursor: revoked newer rows must not hide a page. */
export function learningSessionFilter(access: LearningAccess) {
  if (!access.studentId) return {};
  return {
    OR: [
      { sessionId: null },
      {
        session: {
          enrollmentSessions: {
            some: {
              status: "allowed",
              enrollment: {
                offeringId: access.offeringId,
                studentId: access.studentId,
              },
            },
          },
        },
      },
    ],
  };
}
/** Match checkout/refund locking: student, academy, offering. */
export async function lockLearningWrite(
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
  scope: { academyId: string; offeringId: string; studentId?: string },
) {
  if (scope.studentId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${scope.studentId}`}))`;
  await lockAcademy(tx, scope.academyId);
  await tx.$executeRaw`SELECT set_config('eduon.now', ${ctx.now().toISOString()}, true)`;
  await tx.offering.update({
    where: { id: scope.offeringId },
    data: { capacity: { increment: 0 } },
  });
}
export function createAssignment(
  ctx: ServiceContext,
  input: z.input<typeof assignmentInput>,
) {
  return attempt(async () => {
    const data = assignmentInput.parse(input);
    const initial = await requireTeachingAccess(ctx, data.offeringId);
    return ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, initial);
      const current = learningTransactionContext(ctx, tx);
      const access = await requireTeachingAccess(current, data.offeringId);
      await validateLearningSession(current, data.offeringId, data.sessionId);
      const row = await tx.assignment.create({
        data: {
          ...data,
          dueAt: new Date(data.dueAt),
          academyId: access.academyId,
          createdById: ctx.actor.userId,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "assignment.created",
          targetId: row.id,
          createdAt: ctx.now(),
        },
      });
      return { assignmentId: row.id };
    });
  });
}
export function submitAssignment(
  ctx: ServiceContext,
  input: z.input<typeof submissionInput>,
) {
  return attempt(async () => {
    const data = submissionInput.parse(input);
    const assignment = await ctx.db.assignment.findUnique({
      where: { id: data.assignmentId },
    });
    ensure(assignment, "NOT_FOUND");
    const initial = await requireStudentAccess(ctx, assignment.offeringId, {
      sessionId: assignment.sessionId ?? undefined,
      historical: true,
    });
    return ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, initial);
      const current = learningTransactionContext(ctx, tx);
      const resource = await tx.assignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      ensure(
        resource.academyId === initial.academyId &&
          resource.offeringId === initial.offeringId,
        "FORBIDDEN",
      );
      const access = await requireStudentAccess(current, resource.offeringId, {
        sessionId: resource.sessionId ?? undefined,
        historical: true,
      });
      const files = await tx.material.findMany({
        where: {
          id: { in: data.fileIds },
          academyId: access.academyId,
          offeringId: access.offeringId,
          ownerStudentId: access.studentId,
          uploaderId: ctx.actor.userId,
          purpose: "submission",
          scanStatus: "clean",
          deletedAt: null,
        },
      });
      ensure(files.length === data.fileIds.length, "FORBIDDEN");
      for (const file of files) {
        ensure(
          !file.sessionId || file.sessionId === resource.sessionId,
          "FORBIDDEN",
        );
        if (file.sessionId)
          await requireStudentAccess(current, resource.offeringId, {
            sessionId: file.sessionId,
            historical: true,
          });
      }
      const latest = await tx.submission.findFirst({
        where: { assignmentId: resource.id, studentId: access.studentId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      const late = ctx.now().getTime() > resource.dueAt.getTime();
      const row = await tx.submission.create({
        data: {
          academyId: access.academyId,
          offeringId: access.offeringId,
          assignmentId: resource.id,
          studentId: access.studentId,
          text: data.text,
          version,
          late,
          submittedAt: ctx.now(),
          files: {
            create: files.map((file) => ({
              academyId: access.academyId,
              offeringId: access.offeringId,
              studentId: access.studentId,
              materialId: file.id,
            })),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action:
            version === 1 ? "assignment.submitted" : "assignment.resubmitted",
          targetId: row.id,
          reason: `version:${version}`,
          createdAt: ctx.now(),
        },
      });
      return { submissionId: row.id, version, late };
    });
  });
}
export function saveFeedback(
  ctx: ServiceContext,
  input: { submissionId: string; text: string },
) {
  return attempt(async () => {
    const data = z
      .object({
        submissionId: z.uuid(),
        text: z.string().trim().min(1).max(10000),
      })
      .strict()
      .parse(input);
    const resource = await ctx.db.submission.findUnique({
      where: { id: data.submissionId },
    });
    ensure(resource, "NOT_FOUND");
    const initial = await requireTeachingAccess(ctx, resource.offeringId);
    await ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, {
        ...initial,
        studentId: resource.studentId,
      });
      await requireTeachingAccess(
        learningTransactionContext(ctx, tx),
        resource.offeringId,
      );
      const row = await tx.submission.findUniqueOrThrow({
        where: { id: resource.id },
        include: { assignment: true },
      });
      ensure(
        row.academyId === initial.academyId &&
          row.assignment.academyId === initial.academyId &&
          row.offeringId === row.assignment.offeringId,
        "FORBIDDEN",
      );
      const latest = await tx.feedback.findFirst({
        where: { submissionId: row.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await tx.feedback.create({
        data: {
          ...data,
          academyId: row.academyId,
          offeringId: row.offeringId,
          version: (latest?.version ?? 0) + 1,
          authorId: ctx.actor.userId,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "submission.feedback",
          targetId: row.id,
          createdAt: ctx.now(),
        },
      });
    });
  });
}
export function listAssignments(
  ctx: ServiceContext,
  input: z.input<typeof pageInput>,
) {
  return attempt(async () => {
    const data = pageInput.parse(input);
    const access = await requireLearningRead(ctx, data.offeringId, {
      studentId: data.studentId,
    });
    const rows = await ctx.db.assignment.findMany({
      ...(data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
      where: { offeringId: data.offeringId, ...learningSessionFilter(access) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        offeringId: true,
        sessionId: true,
        title: true,
        instructions: true,
        dueAt: true,
        createdAt: true,
      },
    });
    return rows;
  });
}
export function listSubmissions(
  ctx: ServiceContext,
  input: { assignmentId: string; studentId?: string; cursor?: string },
) {
  return attempt(async () => {
    const data = z
      .object({
        assignmentId: z.uuid(),
        studentId: z.uuid().optional(),
        cursor: z.uuid().optional(),
      })
      .strict()
      .parse(input);
    const assignment = await ctx.db.assignment.findUnique({
      where: { id: data.assignmentId },
    });
    ensure(assignment, "NOT_FOUND");
    const access = await requireLearningRead(ctx, assignment.offeringId, {
      studentId: data.studentId,
      sessionId: assignment.sessionId ?? undefined,
    });
    const studentId =
      access.role === "instructor" ? data.studentId : access.studentId;
    ensure(access.role === "instructor" || !!studentId, "FORBIDDEN");
    const rows = await ctx.db.submission.findMany({
      ...(data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
      where: {
        assignmentId: assignment.id,
        academyId: access.academyId,
        ...(studentId ? { studentId } : {}),
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        studentId: true,
        version: true,
        text: true,
        late: true,
        submittedAt: true,
        feedback: {
          orderBy: { version: "desc" },
          take: 20,
          select: {
            id: true,
            version: true,
            text: true,
            authorId: true,
            createdAt: true,
          },
        },
        files: {
          select: {
            materialId: true,
            material: { select: { filename: true, mime: true, bytes: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...row,
      feedback: row.feedback.reverse(),
      files: row.files.map((file) => ({
        materialId: file.materialId,
        ...file.material,
      })),
    }));
  });
}
