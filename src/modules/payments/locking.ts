import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ensure } from "@/server/errors";
import { lockAcademy } from "@/modules/academies/service";

/** Match reservation lock order. ORM updates qualify the isolated test schema. */
export async function lockOrder(
  tx: Prisma.TransactionClient,
  id: string,
  now = new Date(),
) {
  const ref = await tx.order.findUnique({
    where: { id },
    select: { studentId: true, academyId: true, offeringId: true },
  });
  ensure(ref, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${ref.studentId}`}))`;
  await lockAcademy(tx, ref.academyId);
  await tx.$executeRaw`SELECT set_config('eduon.now', ${now.toISOString()}, true)`;
  await tx.offering.update({
    where: { id: ref.offeringId },
    data: { capacity: { increment: 0 } },
  });
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: {
      reservation: true,
      payment: true,
      enrollment: { include: { sessions: true } },
      offering: { include: { academy: true } },
      student: { include: { account: true } },
    },
  });
}
