import "server-only";
import type { SystemContext } from "@/server/context";
import { lockOrder } from "@/modules/payments/locking";

/** Each order gets the same student/academy/offering locks as confirmation. */
export async function expireReservations(sys: SystemContext) {
  const now = sys.now();
  const candidates = await sys.db.order.findMany({
    where: { status: "pending_payment", expiresAt: { lte: now } },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  let expired = 0;
  for (const { id } of candidates) {
    expired += await sys.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, now);
      if (order.status !== "pending_payment" || order.expiresAt > now) return 0;
      await tx.seatReservation.updateMany({
        where: { orderId: id, status: "held" },
        data: { status: "expired" },
      });
      await tx.order.update({
        where: { id },
        data: { status: "expired", updatedAt: now },
      });
      return 1;
    });
  }
  return { expired };
}
