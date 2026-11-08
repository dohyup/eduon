import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  getPaymentProvider,
  getTestPaymentProvider,
  paymentReadiness,
} from "../../src/integrations/payments/provider";
import { FakePaymentProvider } from "../support/fake-payment-provider";

const secret = "test-authentication-secret-with-32-characters";
const now = 1_800_000_000_000;
const input = {
  orderId: "order-000001",
  amountWon: 50000,
  requestKey: "prepare-1",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYMENT_PROVIDER", "fake");
  vi.stubEnv("PAYMENT_MODE", "test");
  vi.stubEnv("AUTH_PROVIDER", "test");
  vi.stubEnv("E2E_AUTH_SECRET", secret);
  vi.stubEnv("E2E_TEST_MODE", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("fail-closed payment selection", () => {
  it("exposes a shared fake only for explicitly guarded test mode", () => {
    expect(paymentReadiness()).toEqual({
      configured: true,
      provider: "fake",
      mode: "test",
    });
    expect(getPaymentProvider()).toBe(getTestPaymentProvider());
  });
  it.each([
    ["NODE_ENV", "production"],
    ["AUTH_PROVIDER", "supabase"],
    ["E2E_AUTH_SECRET", "short"],
  ])("rejects fake when %s is %s", (name, value) => {
    vi.stubEnv(name, value);
    expect(() => new FakePaymentProvider()).toThrow("TEST_PAYMENT_FORBIDDEN");
    expect(() => getTestPaymentProvider()).toThrow("TEST_PAYMENT_FORBIDDEN");
    expect(() => getPaymentProvider()).toThrow("TEST_PAYMENT_FORBIDDEN");
  });
  it("rejects fake in development without the explicit E2E marker", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_MODE", "");
    expect(() => new FakePaymentProvider()).toThrow("TEST_PAYMENT_FORBIDDEN");
  });
  it("does not default a missing provider to fake", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(() => getPaymentProvider()).toThrow("PAYMENT_UNCONFIGURED");
  });
  it("keeps live mode disabled even with test authentication", () => {
    vi.stubEnv("PAYMENT_MODE", "live");
    expect(() => getPaymentProvider()).toThrow("PAYMENT_LIVE_DISABLED");
  });
});

describe("fake payment contract", () => {
  it("binds repeated preparation to one server order and returns no invented URL", async () => {
    const port = new FakePaymentProvider();
    expect(await port.prepare(input)).toEqual({
      provider: "fake",
      mode: "test",
      orderId: "order-000001",
      transactionId: "order-000001",
      checkout: { kind: "test" },
    });
    await port.prepare(input);
    await expect(port.prepare({ ...input, amountWon: 1 })).rejects.toThrow(
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
    await expect(
      port.prepare({ ...input, orderId: "order-000002" }),
    ).rejects.toThrow("PAYMENT_IDEMPOTENCY_CONFLICT");
    expect(await port.fetchPayment(input.orderId)).toMatchObject({
      orderId: "order-000001",
      transactionId: "order-000001",
      currency: "KRW",
      amountWon: 50000,
      status: "pending",
      mode: "test",
    });
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid server amount %s",
    async (amountWon) => {
      await expect(
        new FakePaymentProvider().prepare({ ...input, amountWon }),
      ).rejects.toThrow("INVALID_PAYMENT_INPUT");
    },
  );
  it("looks up only known payments and copies verified results", async () => {
    const port = new FakePaymentProvider();
    await expect(port.fetchPayment("unknown")).rejects.toThrow(
      "PAYMENT_NOT_FOUND",
    );
    await port.prepare(input);
    await port.markPaid(input.orderId);
    const payment = await port.fetchPayment(input.orderId);
    payment.amountWon = 1;
    expect((await port.fetchPayment(input.orderId)).amountWon).toBe(50000);
    expect((await port.fetchPayment(input.orderId)).status).toBe("paid");
  });
  it("reconciles an idempotent partial refund and preserves refunded status", async () => {
    const port = new FakePaymentProvider();
    await port.prepare(input);
    await port.markPaid(input.orderId);
    const refund = {
      transactionId: input.orderId,
      amountWon: 20000,
      requestKey: "refund-1",
    };
    expect(await port.fetchRefund(refund)).toBeNull();
    const first = await port.refund(refund);
    expect(first).toMatchObject({ ...refund, status: "succeeded" });
    expect(await port.refund(refund)).toEqual(first);
    expect(await port.fetchRefund(refund)).toEqual(first);
    await expect(port.refund({ ...refund, amountWon: 10000 })).rejects.toThrow(
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
    expect(await port.fetchPayment(input.orderId)).toMatchObject({
      status: "partially_refunded",
      refundedAmountWon: 20000,
    });
    await expect(port.markPaid(input.orderId)).rejects.toThrow(
      "PAYMENT_STATE_CONFLICT",
    );
    await port.refund({ ...refund, amountWon: 30000, requestKey: "refund-2" });
    expect(await port.fetchPayment(input.orderId)).toMatchObject({
      status: "refunded",
      refundedAmountWon: 50000,
    });
    await expect(
      port.refund({ ...refund, amountWon: 1, requestKey: "refund-3" }),
    ).rejects.toThrow("PAYMENT_STATE_CONFLICT");
  });
  it("rejects refund before payment and rejects over-refunding", async () => {
    const port = new FakePaymentProvider();
    await port.prepare(input);
    const refund = {
      transactionId: input.orderId,
      amountWon: 50001,
      requestKey: "refund-1",
    };
    await expect(port.refund(refund)).rejects.toThrow("PAYMENT_STATE_CONFLICT");
    await port.markPaid(input.orderId);
    await expect(port.refund(refund)).rejects.toThrow("INVALID_REFUND_AMOUNT");
  });
  it("rejects a retained fake after runtime switches to production", async () => {
    const port = new FakePaymentProvider();
    await port.prepare(input);
    vi.stubEnv("NODE_ENV", "production");
    await expect(port.markPaid(input.orderId)).rejects.toThrow(
      "TEST_PAYMENT_FORBIDDEN",
    );
    await expect(port.fetchPayment(input.orderId)).rejects.toThrow(
      "TEST_PAYMENT_FORBIDDEN",
    );
  });
});

describe("signed fake webhook boundary", () => {
  function event(
    timestamp = String(now / 1000),
    body = '{"eventId":"event-1","transactionId":"order-000001"}',
  ) {
    const signature = createHmac("sha256", secret)
      .update(`event-1.${timestamp}.${body}`)
      .digest("base64");
    return {
      raw: new TextEncoder().encode(body),
      headers: new Headers({
        "webhook-id": "event-1",
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      }),
    };
  }
  it("verifies exact raw bytes and preserves event IDs for durable deduplication", async () => {
    const port = new FakePaymentProvider({ now: () => now });
    const { raw, headers } = event();
    expect(await port.verifyWebhook(raw, headers)).toEqual({
      eventId: "event-1",
      transactionId: "order-000001",
    });
    expect(await port.verifyWebhook(raw, headers)).toEqual({
      eventId: "event-1",
      transactionId: "order-000001",
    });
    await expect(
      port.verifyWebhook(
        new TextEncoder().encode(new TextDecoder().decode(raw) + " "),
        headers,
      ),
    ).rejects.toThrow("INVALID_PAYMENT_WEBHOOK");
    await expect(port.verifyWebhook(raw, new Headers())).rejects.toThrow(
      "INVALID_PAYMENT_WEBHOOK",
    );
  });
  it.each([String(now / 1000 - 301), String(now / 1000 + 301), "invalid"])(
    "rejects old, future, or malformed signature time %s",
    async (timestamp) => {
      const port = new FakePaymentProvider({ now: () => now });
      const { raw, headers } = event(timestamp);
      await expect(port.verifyWebhook(raw, headers)).rejects.toThrow(
        "INVALID_PAYMENT_WEBHOOK",
      );
    },
  );
});
