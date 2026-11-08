import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockAcademy, requireAcademyOwner } from "./service";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function issueInstructorInvitation(
  ctx: ServiceContext,
  input: { academyId: string; email: string },
) {
  return attempt(async () => {
    await requireActor(ctx);
    const data = z
      .object({
        academyId: z.uuid(),
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
      })
      .parse(input);
    return ctx.db.$transaction(async (tx) => {
      await lockAcademy(tx, data.academyId);
      await requireAcademyOwner(tx, ctx.actor.userId, data.academyId);
      const academy = await tx.academy.findUniqueOrThrow({
        where: { id: data.academyId },
      });
      ensure(academy.status !== "suspended", "CONFLICT");
      await tx.instructorInvitation.updateMany({
        where: {
          academyId: data.academyId,
          recipientEmail: data.email,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: ctx.now() },
      });
      const token = randomBytes(32).toString("base64url");
      const invitation = await tx.instructorInvitation.create({
        data: {
          academyId: data.academyId,
          issuedById: ctx.actor.userId,
          recipientEmail: data.email,
          tokenHash: hashToken(token),
          expiresAt: new Date(ctx.now().getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "instructor.invited",
          targetId: invitation.id,
          createdAt: ctx.now(),
        },
      });
      return { token };
    });
  });
}

export function acceptInstructorInvitation(ctx: ServiceContext, token: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(
      typeof token === "string" && token.length >= 32 && token.length <= 256,
      "VALIDATION",
    );
    return ctx.db.$transaction(async (tx) => {
      const invitation = await tx.instructorInvitation.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      ensure(invitation, "NOT_FOUND");
      await lockAcademy(tx, invitation.academyId);
      ensure(
        invitation.recipientEmail === actor.email.toLowerCase(),
        "FORBIDDEN",
      );
      ensure(!invitation.consumedAt && !invitation.revokedAt, "CONFLICT");
      ensure(invitation.expiresAt > ctx.now(), "EXPIRED");
      await requireAcademyOwner(
        tx,
        invitation.issuedById,
        invitation.academyId,
      );
      const academy = await tx.academy.findUniqueOrThrow({
        where: { id: invitation.academyId },
      });
      ensure(academy.status !== "suspended", "CONFLICT");
      const consumed = await tx.instructorInvitation.updateMany({
        where: {
          id: invitation.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: ctx.now() },
        },
        data: { consumedAt: ctx.now() },
      });
      ensure(consumed.count === 1, "CONFLICT");
      // An owner can explicitly teach without losing their owner membership.
      await tx.academyMembership.upsert({
        where: {
          academyId_userId: {
            academyId: invitation.academyId,
            userId: actor.id,
          },
        },
        create: {
          academyId: invitation.academyId,
          userId: actor.id,
          role: "instructor",
        },
        update: { active: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "instructor.accepted",
          targetId: invitation.id,
          createdAt: ctx.now(),
        },
      });
      return { academyId: invitation.academyId };
    });
  });
}
