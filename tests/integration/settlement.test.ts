import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import {
  recordSettlementPaid,
  listSettlements,
} from "../../src/modules/payments/settlement";
describe("append-only scoped settlements", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>,
    s: Awaited<ReturnType<typeof seedScenario>>,
    dueId: string;
  const now = new Date("2029-12-01T00:00:00Z");
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedScenario(store.db);
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "published" },
    });
    await store.db.session.create({
      data: {
        offeringId: s.offeringId,
        academyId: s.academyId,
        startsAt: new Date("2030-01-02T01:00:00Z"),
        endsAt: new Date("2030-01-02T02:00:00Z"),
      },
    });
    const o = await createOrder(makeContext(store.db, s.parent, now), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "ledger",
      consent: true,
    });
    if (!o.ok) throw Error(o.code);
    await applyVerifiedPayment(
      { db: store.db, now: () => now, source: "job" },
      {
        orderId: o.value.orderId,
        transactionId: o.value.orderId,
        amountWon: 100000,
        currency: "KRW",
        mode: "test",
        status: "paid",
      },
    );
    dueId = (
      await store.db.settlementEntry.findFirstOrThrow({
        where: { kind: "academy_due" },
      })
    ).id;
  });
  afterEach(async () => {
    await store?.close();
  });
  it("owner cannot mark transfers paid and another academy cannot read entries", async () => {
    expect(
      (
        await recordSettlementPaid(makeContext(store.db, s.owner, now), {
          settlementId: dueId,
          externalReference: "external-transfer",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await listSettlements(makeContext(store.db, s.otherOwner, now), {
          academyId: s.academyId,
        })
      ).ok,
    ).toBe(false);
  });
  it("admin records a payout as a new row once and preserves original due", async () => {
    const ctx = makeContext(store.db, s.admin, now),
      input = { settlementId: dueId, externalReference: "external-transfer" };
    expect((await recordSettlementPaid(ctx, input)).ok).toBe(true);
    expect((await recordSettlementPaid(ctx, input)).ok).toBe(true);
    expect(
      await store.db.settlementEntry.count({ where: { kind: "payout" } }),
    ).toBe(1);
    expect(
      (
        await store.db.settlementEntry.findUniqueOrThrow({
          where: { id: dueId },
        })
      ).amountWon,
    ).toBe(100000);
  });
  it("refund after payout is carried into the academy's next payable", async () => {
    const { requestRefund, processRefund } =
      await import("../../src/modules/payments/refunds");
    const { FakePaymentProvider } =
      await import("../support/fake-payment-provider");
    process.env.AUTH_PROVIDER = "test";
    process.env.E2E_AUTH_SECRET =
      "settlement-test-secret-longer-than-thirty-two-characters";
    process.env.PAYMENT_PROVIDER = "fake";
    const due = await store.db.settlementEntry.findUniqueOrThrow({
        where: { id: dueId },
      }),
      ctx = makeContext(store.db, s.admin, now);
    await recordSettlementPaid(ctx, {
      settlementId: dueId,
      externalReference: "first-paid-transfer",
    });
    const port = new FakePaymentProvider();
    await port.prepare({
      orderId: due.orderId,
      amountWon: 100000,
      requestKey: "provider-1",
    });
    await port.markPaid(due.orderId);
    const req = await requestRefund(makeContext(store.db, s.parent, now), {
      orderId: due.orderId,
      cancelSessionIds: [s.sessionId],
      reason: "지급 후 취소",
      requestKey: "after-payout",
    });
    if (!req.ok) throw Error(req.code);
    await processRefund(
      { db: store.db, now: () => now, source: "job" },
      req.value.refundId,
      port,
    );
    const next = await createOrder(makeContext(store.db, s.otherParent, now), {
      studentId: s.otherStudentId,
      offeringId: s.offeringId,
      requestKey: "next-sale",
      consent: true,
    });
    if (!next.ok) throw Error(next.code);
    await applyVerifiedPayment(
      { db: store.db, now: () => now, source: "job" },
      {
        orderId: next.value.orderId,
        transactionId: next.value.orderId,
        amountWon: 100000,
        currency: "KRW",
        mode: "test",
        status: "paid",
      },
    );
    const entries = await listSettlements(ctx, { academyId: s.academyId });
    if (!entries.ok) throw Error(entries.code);
    const nextDue = entries.value.items.find(
      (e) => e.orderId === next.value.orderId && e.kind === "academy_due",
    );
    expect(nextDue?.payoutAmountWon).toBe(50000);
    expect(nextDue?.canPay).toBe(true);
    if (!nextDue) throw Error("Missing next due");
    await recordSettlementPaid(ctx, {
      settlementId: nextDue.id,
      externalReference: "next-paid-transfer",
    });
    expect(
      (
        await store.db.settlementEntry.findFirstOrThrow({
          where: { kind: "payout", orderId: next.value.orderId },
        })
      ).amountWon,
    ).toBe(-50000);
    // Original payout is preserved; paired netting carries the partial refund.
    expect(
      (
        await store.db.settlementEntry.findFirstOrThrow({
          where: { kind: "payout" },
        })
      ).amountWon,
    ).toBe(-100000);
    expect(
      await store.db.settlementEntry.count({
        where: { idempotencyKey: { startsWith: "net:" } },
      }),
    ).toBe(2);
  });
});
