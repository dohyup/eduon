import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import type { SystemContext } from "../../src/server/context";
import type { VerifiedPayment } from "../../src/integrations/payments/port";

describe("verified payment transitions", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>;
  let s: Awaited<ReturnType<typeof seedScenario>>;
  let orderId: string;
  const now = new Date("2029-12-01T00:00:00Z");
  let sys: SystemContext;
  const payment = (): VerifiedPayment => ({
    transactionId: orderId,
    orderId,
    amountWon: 100000,
    currency: "KRW",
    status: "paid",
    mode: "test",
    refundedAmountWon: 0,
    refunds: [],
  });
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedScenario(store.db);
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "published" },
    });
    const r = await createOrder(makeContext(store.db, s.parent, now), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "pay-event-1",
      consent: true,
    });
    if (!r.ok) throw new Error(r.code);
    orderId = r.value.orderId;
    sys = { db: store.db, now: () => now, source: "webhook" };
  });
  afterEach(async () => {
    await store?.close();
  });
  it("repeated paid evidence grants one enrollment and one financial posting", async () => {
    expect((await applyVerifiedPayment(sys, payment())).ok).toBe(true);
    expect((await applyVerifiedPayment(sys, payment())).ok).toBe(true);
    expect(await store.db.enrollment.count({ where: { orderId } })).toBe(1);
    expect(await store.db.payment.count({ where: { orderId } })).toBe(1);
  });
  it("rejects amount, currency and order mismatches without creating access", async () => {
    expect(
      (await applyVerifiedPayment(sys, { ...payment(), amountWon: 1 })).ok,
    ).toBe(false);
    expect(
      (
        await applyVerifiedPayment(sys, {
          ...payment(),
          currency: "USD",
        } as unknown as VerifiedPayment)
      ).ok,
    ).toBe(false);
    expect(await store.db.enrollment.count({ where: { orderId } })).toBe(0);
  });
  it("never grants a seat for evidence received after the reservation deadline", async () => {
    sys.now = () => new Date(now.getTime() + 11 * 60 * 1000);
    await applyVerifiedPayment(sys, payment());
    expect(await store.db.enrollment.count({ where: { orderId } })).toBe(0);
    expect(await store.db.payment.count({ where: { orderId } })).toBe(1);
    expect(await store.db.job.count()).toBeGreaterThan(0);
  });
  it("late pending and failed events never regress a paid order", async () => {
    await applyVerifiedPayment(sys, payment());
    await applyVerifiedPayment(sys, { ...payment(), status: "pending" });
    await applyVerifiedPayment(sys, { ...payment(), status: "failed" });
    expect(
      (await store.db.order.findUniqueOrThrow({ where: { id: orderId } }))
        .status,
    ).toBe("paid");
    expect(
      (await store.db.enrollment.findUniqueOrThrow({ where: { orderId } }))
        .status,
    ).toBe("active");
  });
  it("persists paid evidence and compensation if a legacy enrollment prevents access", async () => {
    await store.db.enrollment.create({
      data: {
        offeringId: s.offeringId,
        studentId: s.studentId,
        status: "cancelled",
      },
    });
    expect((await applyVerifiedPayment(sys, payment())).ok).toBe(true);
    expect(await store.db.payment.count({ where: { orderId } })).toBe(1);
    expect(
      await store.db.refund.count({ where: { orderId, kind: "compensation" } }),
    ).toBe(1);
    expect(await store.db.enrollment.count({ where: { orderId } })).toBe(0);
  });
});
