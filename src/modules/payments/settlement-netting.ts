import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

/** Called under the academy lock. Carry paid-order refund debts into new dues,
 * with paired append-only allocations preserving every original transaction. */
export async function netAcademyBalances(
  tx: Prisma.TransactionClient,
  academyId: string,
  now: Date,
) {
  const kinds = ["academy_due", "adjustment", "payout"];
  const debts = await tx.settlementEntry.groupBy({
    by: ["orderId"],
    where: { academyId, kind: { in: kinds } },
    _sum: { amountWon: true },
    having: { amountWon: { _sum: { lt: 0 } } },
    orderBy: { orderId: "asc" },
    take: 100,
  });
  if (!debts.length) return;
  const credits = await tx.settlementEntry.groupBy({
    by: ["orderId"],
    where: { academyId, kind: { in: kinds } },
    _sum: { amountWon: true },
    having: { amountWon: { _sum: { gt: 0 } } },
    orderBy: { orderId: "asc" },
    take: 100,
  });
  let ci = 0;
  for (const debt of debts) {
    let remaining = -(debt._sum.amountWon || 0);
    while (remaining > 0 && ci < credits.length) {
      const credit = credits[ci];
      const available = credit._sum.amountWon || 0;
      if (available <= 0) {
        ci++;
        continue;
      }
      const amount = Math.min(remaining, available),
        key = `net:${randomUUID()}`;
      const original = await tx.settlementEntry.findFirst({
        where: {
          academyId,
          orderId: debt.orderId,
          kind: "adjustment",
          amountWon: { lt: 0 },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      await tx.settlementEntry.createMany({
        data: [
          {
            academyId,
            orderId: debt.orderId,
            kind: "adjustment",
            amountWon: amount,
            idempotencyKey: `${key}:debt`,
            originalEntryId: original?.id,
            createdAt: now,
          },
          {
            academyId,
            orderId: credit.orderId,
            kind: "adjustment",
            amountWon: -amount,
            idempotencyKey: `${key}:credit`,
            originalEntryId: original?.id,
            createdAt: now,
          },
        ],
      });
      remaining -= amount;
      credit._sum.amountWon = available - amount;
    }
  }
}
