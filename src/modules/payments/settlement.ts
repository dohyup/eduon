import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import type { Prisma } from "@/generated/prisma/client";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockOrder } from "./locking";
import { netAcademyBalances } from "./settlement-netting";

async function payable(
  db: Prisma.TransactionClient | ServiceContext["db"],
  orderId: string,
  academyId: string,
) {
  const sum = await db.settlementEntry.aggregate({
    where: { orderId, kind: { in: ["academy_due", "adjustment", "payout"] } },
    _sum: { amountWon: true },
  });
  const academy = await db.settlementEntry.aggregate({
    where: { academyId, kind: { in: ["academy_due", "adjustment", "payout"] } },
    _sum: { amountWon: true },
  });
  return Math.max(
    0,
    Math.min(sum._sum.amountWon || 0, academy._sum.amountWon || 0),
  );
}
export function listSettlements(
  ctx: ServiceContext,
  input: { academyId?: string; cursor?: string } = {},
) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    z.uuid().optional().parse(input.academyId);
    z.uuid().optional().parse(input.cursor);
    if (!user.platformAdmin) {
      ensure(input.academyId, "FORBIDDEN");
      const m = await ctx.db.academyMembership.findUnique({
        where: {
          academyId_userId: { academyId: input.academyId, userId: user.id },
        },
      });
      ensure(m?.active && m.role === "owner", "FORBIDDEN");
    }
    const rows = await ctx.db.settlementEntry.findMany({
      where: {
        ...(input.academyId ? { academyId: input.academyId } : {}),
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: 21,
      include: { academy: { select: { name: true } } },
    });
    const items = await Promise.all(
      rows.slice(0, 20).map(async (r) => {
        const amount =
          r.kind === "academy_due"
            ? await payable(ctx.db, r.orderId, r.academyId)
            : 0;
        const pending =
          amount > 0
            ? await ctx.db.refund.count({
                where: {
                  orderId: r.orderId,
                  status: { in: ["requested", "processing", "pending"] },
                },
              })
            : 0;
        const payouts =
          r.kind === "academy_due"
            ? await ctx.db.settlementEntry.count({
                where: { originalEntryId: r.id, kind: "payout" },
              })
            : 0;
        return {
          ...r,
          academy: undefined,
          academyName: r.academy.name,
          createdAt: r.createdAt.toISOString(),
          payoutAmountWon: amount,
          canPay:
            user.platformAdmin &&
            r.kind === "academy_due" &&
            amount > 0 &&
            !pending &&
            !payouts,
        };
      }),
    );
    return { items, nextCursor: rows.length > 20 ? items[19].id : null };
  });
}
export function recordSettlementPaid(
  ctx: ServiceContext,
  input: { settlementId: string; externalReference: string },
) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    ensure(user.platformAdmin, "FORBIDDEN");
    z.uuid().parse(input.settlementId);
    const reference = z
      .string()
      .trim()
      .min(4)
      .max(200)
      .parse(input.externalReference);
    const entry = await ctx.db.settlementEntry.findUnique({
      where: { id: input.settlementId },
    });
    ensure(entry?.kind === "academy_due", "NOT_FOUND");
    return ctx.db.$transaction(async (tx) => {
      // Serialize reused external references across academies, then use standard order locks.
      const hash = createHash("sha256").update(reference).digest("hex");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${hash}`}))`;
      const order = await lockOrder(tx, entry.orderId, ctx.now());
      await netAcademyBalances(tx, entry.academyId, ctx.now());
      const key = `payout:${entry.id}`;
      const previous = await tx.settlementEntry.findUnique({
        where: { idempotencyKey: key },
      });
      if (previous) {
        ensure(previous.externalReference === reference, "CONFLICT");
        return { settlementId: previous.id };
      }
      ensure(
        !(await tx.settlementEntry.findFirst({
          where: { kind: "payout", externalReference: reference },
        })),
        "CONFLICT",
      );
      const pending = await tx.refund.count({
        where: {
          orderId: entry.orderId,
          status: { in: ["requested", "processing", "pending"] },
        },
      });
      ensure(!pending, "CONFLICT");
      ensure(order.status !== "payment_exception", "CONFLICT");
      const amount = await payable(tx, entry.orderId, entry.academyId);
      ensure(amount > 0, "CONFLICT");
      const payout = await tx.settlementEntry.create({
        data: {
          academyId: entry.academyId,
          orderId: entry.orderId,
          paymentId: entry.paymentId,
          kind: "payout",
          amountWon: -amount,
          idempotencyKey: key,
          originalEntryId: entry.id,
          externalReference: reference,
          recordedById: user.id,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "settlement.external_payout_recorded",
          targetId: payout.id,
          reason: "외부 지급 참조 기록",
          createdAt: ctx.now(),
        },
      });
      return { settlementId: payout.id };
    });
  });
}
