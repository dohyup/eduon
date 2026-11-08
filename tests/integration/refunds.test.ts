import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder, getOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import {
  requestRefund,
  processRefund,
} from "../../src/modules/payments/refunds";
import { FakePaymentProvider } from "../support/fake-payment-provider";
import type { SystemContext } from "../../src/server/context";
describe("refund accounting and access", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>,
    s: Awaited<ReturnType<typeof seedScenario>>,
    orderId: string,
    sys: SystemContext,
    port: FakePaymentProvider;
  const now = new Date("2029-12-01T00:00:00Z");
  beforeEach(async () => {
    process.env.AUTH_PROVIDER = "test";
    process.env.E2E_AUTH_SECRET =
      "test-refund-key-longer-than-thirty-two-characters";
    process.env.PAYMENT_PROVIDER = "fake";
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
    const r = await createOrder(makeContext(store.db, s.parent, now), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "refund-order",
      consent: true,
    });
    if (!r.ok) throw Error(r.code);
    orderId = r.value.orderId;
    sys = { db: store.db, now: () => now, source: "job" };
    port = new FakePaymentProvider();
    await port.prepare({ orderId, amountWon: 100000, requestKey: "prepare" });
    await port.markPaid(orderId);
    const paid = await applyVerifiedPayment(
      sys,
      await port.fetchPayment(orderId),
    );
    if (!paid.ok) throw Error(paid.code);
  });
  afterEach(async () => {
    await store?.close();
  });
  const request = (key = "refund-1") =>
    requestRefund(makeContext(store.db, s.parent, now), {
      orderId,
      cancelSessionIds: [s.sessionId],
      reason: "일정 변경",
      requestKey: key,
    });
  it("request retains paid finance and blocks only selected session temporarily", async () => {
    const r = await request();
    expect(r.ok).toBe(true);
    const o = await getOrder(makeContext(store.db, s.parent, now), orderId);
    expect(o.ok && o.value.status).toBe("paid");
    const rights = await store.db.enrollmentSession.findMany();
    expect(rights.filter((x) => x.status === "refund_pending")).toHaveLength(1);
    expect(rights.filter((x) => x.status === "allowed")).toHaveLength(1);
  });
  it("verified partial refund cancels one session and posts once despite duplicate processing", async () => {
    const r = await request();
    if (!r.ok) throw Error(r.code);
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(true);
    await processRefund(sys, r.value.refundId, port);
    const o = await store.db.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(o.status).toBe("partially_refunded");
    expect(
      await store.db.enrollmentSession.count({
        where: { status: "cancelled" },
      }),
    ).toBe(1);
    expect(
      await store.db.enrollmentSession.count({ where: { status: "allowed" } }),
    ).toBe(1);
    expect(
      await store.db.settlementEntry.count({
        where: { refundId: r.value.refundId, kind: "refund" },
      }),
    ).toBe(1);
  });
  it("other parents cannot refund and duplicated session claims cannot over-refund", async () => {
    const r = await request();
    expect(r.ok).toBe(true);
    expect((await request("refund-2")).ok).toBe(false);
    const other = await requestRefund(
      makeContext(store.db, s.otherParent, now),
      {
        orderId,
        cancelSessionIds: [s.sessionId],
        reason: "타인",
        requestKey: "other",
      },
    );
    expect(other.ok).toBe(false);
  });
  it("definitive failure restores valid session access; admin retry can finish", async () => {
    const original = port.refund.bind(port);
    port.refund = async (input) => ({
      ...input,
      reference: "declined",
      status: "failed",
    });
    const r = await request();
    if (!r.ok) throw Error(r.code);
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(false);
    expect(
      (
        await store.db.refund.findUniqueOrThrow({
          where: { id: r.value.refundId },
        })
      ).status,
    ).toBe("failed");
    expect(
      await store.db.enrollmentSession.count({ where: { status: "allowed" } }),
    ).toBe(2);
    const { retryRefund } = await import("../../src/modules/payments/refunds");
    expect(
      (
        await retryRefund(
          makeContext(store.db, s.parent, now),
          r.value.refundId,
        )
      ).ok,
    ).toBe(false);
    expect(
      (await retryRefund(makeContext(store.db, s.admin, now), r.value.refundId))
        .ok,
    ).toBe(true);
    port.refund = original;
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(true);
  });
  it("a timeout after provider success reconciles without sending a second refund", async () => {
    const original = port.refund.bind(port);
    let calls = 0;
    port.refund = async (input) => {
      calls++;
      await original(input);
      throw Error("timeout after commit");
    };
    const r = await request();
    if (!r.ok) throw Error(r.code);
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(false);
    expect(
      (
        await store.db.refund.findUniqueOrThrow({
          where: { id: r.value.refundId },
        })
      ).status,
    ).toBe("pending");
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(true);
    expect(calls).toBe(1);
    expect((await port.fetchPayment(orderId)).refundedAmountWon).toBe(50000);
  });
  it("recovers a crash after claiming a refund but before the provider call", async () => {
    const r = await request();
    if (!r.ok) throw Error(r.code);
    await store.db.refund.update({
      where: { id: r.value.refundId },
      data: { status: "processing" },
    });
    expect((await processRefund(sys, r.value.refundId, port)).ok).toBe(true);
    expect((await port.fetchPayment(orderId)).refundedAmountWon).toBe(50000);
  });
  it("concurrent distinct session refunds never exceed the purchase", async () => {
    const ids = await store.db.session.findMany({
      where: { offeringId: s.offeringId },
    });
    const results = await Promise.all(
      ids.map((session, i) =>
        requestRefund(makeContext(store.db, s.parent, now), {
          orderId,
          cancelSessionIds: [session.id],
          reason: "개별 취소",
          requestKey: `parallel-${i}`,
        }),
      ),
    );
    for (const r of results) if (!r.ok) throw Error(r.code);
    await Promise.all(
      results.map((r) =>
        r.ok ? processRefund(sys, r.value.refundId, port) : Promise.resolve(),
      ),
    );
    expect(
      (await store.db.order.findUniqueOrThrow({ where: { id: orderId } }))
        .status,
    ).toBe("refunded");
    expect((await port.fetchPayment(orderId)).refundedAmountWon).toBe(100000);
    expect(
      await store.db.enrollmentSession.count({
        where: { status: "cancelled" },
      }),
    ).toBe(2);
  });
  it("a stale failed attempt cannot release a replacement refund's session hold", async () => {
    const r = await request();
    if (!r.ok) throw Error(r.code);
    let resolveSlow!: (value: Awaited<ReturnType<typeof port.refund>>) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let calls = 0;
    port.refund = async (input) => {
      calls++;
      if (calls === 1) {
        entered();
        return new Promise((resolve) => {
          resolveSlow = resolve;
        });
      }
      return { ...input, reference: "declined-new", status: "failed" };
    };
    const slow = processRefund(sys, r.value.refundId, port);
    await started;
    await processRefund(sys, r.value.refundId, port);
    const replacement = await request("replacement");
    expect(replacement.ok).toBe(true);
    const previous = await store.db.refund.findUniqueOrThrow({
      where: { id: r.value.refundId },
    });
    resolveSlow({
      transactionId: orderId,
      requestKey: previous.requestKey,
      amountWon: 50000,
      reference: "declined-old",
      status: "failed",
    });
    await slow;
    expect(
      await store.db.enrollmentSession.count({
        where: { sessionId: s.sessionId, status: "refund_pending" },
      }),
    ).toBe(1);
    expect((await request("third")).ok).toBe(false);
  });
  it("stale partial provider evidence cannot regress a fully refunded payment", async () => {
    const ids = await store.db.session.findMany({
      where: { offeringId: s.offeringId },
    });
    const r = await requestRefund(makeContext(store.db, s.parent, now), {
      orderId,
      cancelSessionIds: ids.map((s) => s.id),
      reason: "전체 취소",
      requestKey: "full-refund",
    });
    if (!r.ok) throw Error(r.code);
    await processRefund(sys, r.value.refundId, port);
    await applyVerifiedPayment(sys, {
      ...(await port.fetchPayment(orderId)),
      status: "partially_refunded",
      refundedAmountWon: 50000,
    });
    expect(
      (await store.db.payment.findUniqueOrThrow({ where: { orderId } })).status,
    ).toBe("refunded");
    expect(
      (await store.db.order.findUniqueOrThrow({ where: { id: orderId } }))
        .status,
    ).toBe("refunded");
  });
});
