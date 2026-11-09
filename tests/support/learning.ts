import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { SystemContext } from "../../src/server/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import { makeContext } from "./context";
import { seedScenario } from "./scenario";
export function systemContext(
  db: PrismaClient,
  now = new Date("2029-12-01T00:00:00Z"),
): SystemContext {
  return { db, now: () => now, source: "job" };
}
export async function payOrder(sys: SystemContext, orderId: string) {
  const order = await sys.db.order.findUniqueOrThrow({
    where: { id: orderId },
  });
  const result = await applyVerifiedPayment(sys, {
    orderId,
    transactionId: orderId,
    amountWon: order.amountWon,
    currency: "KRW",
    mode: "test",
    status: "paid",
  });
  if (!result.ok) throw Error(result.code);
}
export async function seedLearning(
  db: PrismaClient,
  s: Awaited<ReturnType<typeof seedScenario>>,
  now = new Date("2029-12-01T00:00:00Z"),
) {
  await db.user.updateMany({
    where: { id: s.parent.userId, guardianVerifiedAt: { gt: now } },
    data: { guardianVerifiedAt: now },
  });
  await db.guardianLink.updateMany({
    where: {
      guardianId: s.parent.userId,
      studentId: s.studentId,
      verifiedAt: { gt: now },
    },
    data: { verifiedAt: now },
  });
  await db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
  await db.studentProfile.update({
    where: { id: s.studentId },
    data: { accountUserId: s.student.userId },
  });
  const result = await createOrder(makeContext(db, s.parent, now), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: randomUUID(),
    consent: true,
  });
  if (!result.ok) throw Error(result.code);
  await payOrder(systemContext(db, now), result.value.orderId);
  const enrollment = await db.enrollment.findUniqueOrThrow({
    where: { orderId: result.value.orderId },
  });
  return { ...s, orderId: result.value.orderId, enrollmentId: enrollment.id };
}
export async function seedLearningScenario(
  db: PrismaClient,
  input: { startsAt?: Date; endsAt?: Date; now?: Date; capacity?: number } = {},
) {
  const s = await seedScenario(db, { capacity: input.capacity });
  if (input.startsAt || input.endsAt)
    await db.session.update({
      where: { id: s.sessionId },
      data: { startsAt: input.startsAt, endsAt: input.endsAt },
    });
  if (input.now)
    await db.offering.update({
      where: { id: s.offeringId },
      data: {
        enrollmentOpensAt: new Date(input.now.getTime() - 86400000),
        enrollmentClosesAt: new Date(input.now.getTime() + 86400000),
      },
    });
  return seedLearning(db, s, input.now);
}
import {
  requestRefund,
  processRefund,
} from "../../src/modules/payments/refunds";
import { FakePaymentProvider } from "./fake-payment-provider";
export async function refundLearningScenario(
  db: PrismaClient,
  s: Awaited<ReturnType<typeof seedLearning>>,
  now = new Date("2029-12-01T00:00:00Z"),
) {
  const order = await db.order.findUniqueOrThrow({ where: { id: s.orderId } });
  const port = new FakePaymentProvider();
  await port.prepare({
    orderId: order.id,
    amountWon: order.amountWon,
    requestKey: `prepare:${order.id}`,
  });
  await port.markPaid(order.id);
  const rights = await db.enrollmentSession.findMany({
    where: { enrollmentId: s.enrollmentId },
  });
  const requested = await requestRefund(makeContext(db, s.parent, now), {
    orderId: order.id,
    cancelSessionIds: rights.map((r) => r.sessionId),
    reason: "전체 수업 취소",
    requestKey: randomUUID(),
  });
  if (!requested.ok) throw Error(requested.code);
  const refunded = await processRefund(
    systemContext(db, now),
    requested.value.refundId,
    port,
  );
  if (!refunded.ok) throw Error(refunded.code);
  return s;
}
export async function seedFullyRefundedLearningScenario(db: PrismaClient) {
  return refundLearningScenario(db, await seedLearningScenario(db));
}
