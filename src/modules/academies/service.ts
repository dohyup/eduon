import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";

export async function lockAcademy(
  db: Prisma.TransactionClient,
  academyId: string,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academy:${academyId}`}))`;
}

export async function requireAcademyOwner(
  db: Prisma.TransactionClient,
  userId: string,
  academyId: string,
) {
  const membership = await db.academyMembership.findUnique({
    where: { academyId_userId: { academyId, userId } },
    include: { user: { select: { disabledAt: true } } },
  });
  ensure(
    membership?.active &&
      membership.role === "owner" &&
      !membership.user.disabledAt,
    "FORBIDDEN",
  );
}

export function submitAcademy(
  ctx: ServiceContext,
  input: { name: string; region: string; academyId?: string },
) {
  return attempt(async () => {
    await requireActor(ctx);
    const data = z
      .object({
        name: z.string().trim().min(1).max(120),
        region: z.string().trim().min(1).max(120),
        academyId: z.uuid().optional(),
      })
      .parse(input);
    return ctx.db.$transaction(async (tx) => {
      let academyId: string;
      if (data.academyId) {
        academyId = data.academyId;
        await lockAcademy(tx, academyId);
        await requireAcademyOwner(tx, ctx.actor.userId, academyId);
        const academy = await tx.academy.findUniqueOrThrow({
          where: { id: academyId },
        });
        ensure(["draft", "rejected"].includes(academy.status), "CONFLICT");
        await tx.academy.update({
          where: { id: academyId },
          data: {
            name: data.name,
            region: data.region,
            status: "submitted",
            decisionReason: null,
          },
        });
      } else {
        const academy = await tx.academy.create({
          data: {
            name: data.name,
            region: data.region,
            status: "submitted",
            memberships: {
              create: { userId: ctx.actor.userId, role: "owner" },
            },
          },
        });
        academyId = academy.id;
      }
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "academy.submitted",
          targetId: academyId,
          createdAt: ctx.now(),
        },
      });
      return { academyId };
    });
  });
}

export function decideAcademy(
  ctx: ServiceContext,
  input: {
    academyId: string;
    decision: "approved" | "rejected" | "suspended";
    reason: string;
  },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");
    const data = z
      .object({
        academyId: z.uuid(),
        decision: z.enum(["approved", "rejected", "suspended"]),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input);
    await ctx.db.$transaction(async (tx) => {
      await lockAcademy(tx, data.academyId);
      const admin = await tx.user.findUnique({
        where: { id: ctx.actor.userId },
      });
      ensure(admin?.platformAdmin && !admin.disabledAt, "FORBIDDEN");
      const academy = await tx.academy.findUnique({
        where: { id: data.academyId },
      });
      ensure(academy, "NOT_FOUND");
      const allowed =
        data.decision === "approved"
          ? ["submitted", "suspended"]
          : data.decision === "rejected"
            ? ["submitted"]
            : ["approved"];
      ensure(allowed.includes(academy.status), "CONFLICT");
      await tx.academy.update({
        where: { id: academy.id },
        data: { status: data.decision, decisionReason: data.reason },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: `academy.${data.decision}`,
          targetId: academy.id,
          reason: data.reason,
          createdAt: ctx.now(),
        },
      });
    });
  });
}

export function listManagedAcademies(ctx: ServiceContext, cursor?: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().optional().parse(cursor);
    return ctx.db.academy.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: actor.platformAdmin
        ? {}
        : { memberships: { some: { userId: actor.id, active: true } } },
      select: {
        id: true,
        name: true,
        region: true,
        status: true,
        decisionReason: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
  });
}
