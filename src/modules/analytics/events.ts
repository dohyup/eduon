import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { learningEnabled } from "@/modules/learning/access";
export type ConversionStage =
  | "search"
  | "detail"
  | "application"
  | "paid"
  | "first_participation"
  | "reenrollment";
export async function recordConversion(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    stage: ConversionStage;
    academyId: string;
    offeringId: string;
    orderId?: string;
    enrollmentId?: string;
    actorId?: string;
    dedupeKey: string;
    now: Date;
  },
) {
  if (!learningEnabled()) return;
  const { now, ...data } = input;
  await db.analyticsEvent.upsert({
    where: { dedupeKey: data.dedupeKey },
    create: { ...data, createdAt: now },
    update: {},
  });
}
export function trackDiscovery(
  ctx: ServiceContext,
  input: { offeringId: string; stage: "search" | "detail"; requestKey: string },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx),
      data = z
        .object({
          offeringId: z.uuid(),
          stage: z.enum(["search", "detail"]),
          requestKey: z.string().min(1).max(120),
        })
        .strict()
        .parse(input);
    const offering = await ctx.db.offering.findFirst({
      where: {
        id: data.offeringId,
        status: "published",
        academy: { status: "approved" },
      },
      select: { id: true, academyId: true },
    });
    ensure(offering, "NOT_FOUND");
    const key = createHash("sha256")
      .update(`${actor.id}:${data.stage}:${data.offeringId}:${data.requestKey}`)
      .digest("hex");
    await recordConversion(ctx.db, {
      stage: data.stage,
      offeringId: offering.id,
      academyId: offering.academyId,
      actorId: actor.id,
      dedupeKey: `discovery:${key}`,
      now: ctx.now(),
    });
  });
}
export function getAnalytics(ctx: ServiceContext, academyId?: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().optional().parse(academyId);
    if (!actor.platformAdmin) {
      ensure(academyId, "FORBIDDEN");
      const m = await ctx.db.academyMembership.findUnique({
        where: { academyId_userId: { academyId, userId: actor.id } },
      });
      ensure(m?.active && m.role === "owner", "FORBIDDEN");
    }
    const rows = await ctx.db.analyticsEvent.groupBy({
      by: ["stage"],
      where: academyId ? { academyId } : {},
      _count: { _all: true },
    });
    return {
      scope: academyId || "platform",
      counts: rows.map((r) => ({ stage: r.stage, count: r._count._all })),
    };
  });
}
