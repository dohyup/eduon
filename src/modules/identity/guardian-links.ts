import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "./access";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function createChild(
  ctx: ServiceContext,
  input: { name: string; grade: number },
) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    ensure(user.guardianVerifiedAt, "FORBIDDEN");
    const child = z
      .object({
        name: z.string().trim().min(1).max(60),
        grade: z.number().int().min(1).max(12),
      })
      .strict()
      .parse(input);
    return ctx.db.$transaction(async (db) => {
      const row = await db.studentProfile.create({
        data: {
          ...child,
          guardians: { create: { guardianId: user.id, verifiedAt: ctx.now() } },
        },
      });
      await db.auditEvent.create({
        data: { actorId: user.id, action: "child.created", targetId: row.id },
      });
      return row;
    });
  });
}
export function issueStudentInvitation(
  ctx: ServiceContext,
  studentId: string,
  email: string,
) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    ensure(user.guardianVerifiedAt, "FORBIDDEN");
    z.uuid().parse(studentId);
    const recipientEmail = z.email().max(254).parse(email.trim().toLowerCase());
    ensure(recipientEmail !== user.email, "VALIDATION");
    const token = randomBytes(32).toString("base64url");
    return ctx.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${studentId}`}))`;
      const link = await db.guardianLink.findFirst({
        where: { guardianId: user.id, studentId, revokedAt: null },
      });
      ensure(link, "FORBIDDEN");
      const student = await db.studentProfile.findUniqueOrThrow({
        where: { id: studentId },
      });
      ensure(!student.accountUserId, "CONFLICT");
      await db.studentInvitation.updateMany({
        where: { studentId, consumedAt: null, revokedAt: null },
        data: { revokedAt: ctx.now() },
      });
      const row = await db.studentInvitation.create({
        data: {
          studentId,
          issuedById: user.id,
          recipientEmail,
          tokenHash: digest(token),
          expiresAt: new Date(ctx.now().getTime() + 86400000),
        },
      });
      await db.auditEvent.create({
        data: {
          actorId: user.id,
          action: "student.invitation.issued",
          targetId: studentId,
        },
      });
      return { token, invitationId: row.id, expiresAt: row.expiresAt };
    });
  });
}
export function acceptStudentInvitation(ctx: ServiceContext, token: string) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    z.string().min(40).max(100).parse(token);
    return ctx.db.$transaction(async (db) => {
      const row = await db.studentInvitation.findUnique({
        where: { tokenHash: digest(token) },
      });
      ensure(row, "NOT_FOUND");
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${row.studentId}`}))`;
      const current = await db.studentInvitation.findUniqueOrThrow({
        where: { id: row.id },
      });
      ensure(!current.consumedAt && !current.revokedAt, "CONFLICT");
      ensure(current.expiresAt > ctx.now(), "EXPIRED");
      ensure(
        current.recipientEmail === user.email && current.issuedById !== user.id,
        "FORBIDDEN",
      );
      const issuer = await db.user.findUnique({
        where: { id: current.issuedById },
      });
      const link = await db.guardianLink.findFirst({
        where: {
          guardianId: current.issuedById,
          studentId: current.studentId,
          revokedAt: null,
        },
      });
      ensure(
        issuer?.guardianVerifiedAt && !issuer.disabledAt && link,
        "FORBIDDEN",
      );
      const consumed = await db.studentInvitation.updateMany({
        where: {
          id: current.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: ctx.now() },
        },
        data: { consumedAt: ctx.now() },
      });
      ensure(consumed.count === 1, "CONFLICT");
      const bound = await db.studentProfile.updateMany({
        where: { id: current.studentId, accountUserId: null },
        data: { accountUserId: user.id },
      });
      ensure(bound.count === 1, "CONFLICT");
      await db.auditEvent.create({
        data: {
          actorId: user.id,
          action: "student.invitation.accepted",
          targetId: current.studentId,
        },
      });
      return { studentId: current.studentId };
    });
  });
}
export function revokeStudentInvitation(
  ctx: ServiceContext,
  invitationId: string,
) {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(invitationId);
    return ctx.db.$transaction(async (db) => {
      const row = await db.studentInvitation.findUnique({
        where: { id: invitationId },
      });
      ensure(row, "FORBIDDEN");
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${row.studentId}`}))`;
      const link = await db.guardianLink.findFirst({
        where: {
          guardianId: ctx.actor.userId,
          studentId: row.studentId,
          revokedAt: null,
        },
      });
      ensure(link, "FORBIDDEN");
      await db.studentInvitation.update({
        where: { id: row.id },
        data: { revokedAt: ctx.now() },
      });
      await db.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "student.invitation.revoked",
          targetId: row.studentId,
        },
      });
    });
  });
}
export function verifyGuardian(
  ctx: ServiceContext,
  input: { userId: string; reason: string },
) {
  return attempt(async () => {
    const operator = await requireActor(ctx);
    ensure(operator.platformAdmin, "FORBIDDEN");
    const data = z
      .object({ userId: z.uuid(), reason: z.string().trim().min(10).max(500) })
      .strict()
      .parse(input);
    return ctx.db.$transaction(async (db) => {
      await db.user.update({
        where: { id: data.userId },
        data: { guardianVerifiedAt: ctx.now() },
      });
      await db.auditEvent.create({
        data: {
          actorId: operator.id,
          action: "guardian.verified",
          targetId: data.userId,
          reason: data.reason,
        },
      });
    });
  });
}
