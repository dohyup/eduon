import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lockAcademy } from "@/modules/academies/service";

// All commerce writers acquire student -> academy -> offering -> order locks.
// An ORM no-op UPDATE qualifies the table with the adapter's selected schema.
export async function lockCommerceResources(
  tx: Prisma.TransactionClient,
  studentId: string,
  offeringId: string,
  academyId: string,
  now: Date,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${studentId}`}))`;
  await lockAcademy(tx, academyId);
  await tx.$executeRaw`SELECT set_config('eduon.now', ${now.toISOString()}, true)`;
  await tx.offering.update({
    where: { id: offeringId },
    data: { capacity: { increment: 0 } },
  });
}
export async function expireStudentReservations(
  tx: Prisma.TransactionClient,
  studentId: string,
  now: Date,
) {
  const expired = await tx.order.findMany({
    where: { studentId, status: "pending_payment", expiresAt: { lte: now } },
    select: { id: true },
  });
  const ids = expired.map((o) => o.id);
  if (!ids.length) return;
  await tx.seatReservation.updateMany({
    where: { orderId: { in: ids }, status: "held" },
    data: { status: "expired" },
  });
  await tx.order.updateMany({
    where: { id: { in: ids }, status: "pending_payment" },
    data: { status: "expired", updatedAt: now },
  });
}
export async function occupiedSeats(
  tx: Prisma.TransactionClient,
  offeringId: string,
  now: Date,
) {
  const active = await tx.enrollment.count({
    where: { offeringId, status: { in: ["active", "pending_payment"] } },
  });
  const reserved = await tx.seatReservation.count({
    where: { offeringId, status: "held", expiresAt: { gt: now } },
  });
  return active + reserved;
}
