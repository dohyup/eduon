import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutPreparation,
  PaymentPort,
  PreparePaymentInput,
  RefundInput,
  RefundLookup,
  VerifiedPayment,
  VerifiedPaymentEvent,
  VerifiedRefund,
} from "./port";
import { assertTestPaymentAllowed } from "./test-guard";

const validId = (value: string) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 200 &&
  value.trim() === value;
const validAmount = (value: number) => Number.isSafeInteger(value) && value > 0;

/** A guarded simulator. Its memory is intentionally not durable provider evidence. */
export class FakePaymentProvider implements PaymentPort {
  private readonly payments = new Map<string, VerifiedPayment>();
  private readonly preparations = new Map<string, PreparePaymentInput>();
  private readonly refunds = new Map<string, VerifiedRefund>();
  private readonly now: () => number;
  private readonly webhookSecret: string;

  constructor(options: { now?: () => number; webhookSecret?: string } = {}) {
    assertTestPaymentAllowed();
    this.now = options.now ?? Date.now;
    this.webhookSecret = options.webhookSecret ?? process.env.E2E_AUTH_SECRET!;
    if (this.webhookSecret.length < 32)
      throw new Error("TEST_PAYMENT_FORBIDDEN");
  }

  async prepare(input: PreparePaymentInput): Promise<CheckoutPreparation> {
    assertTestPaymentAllowed();
    if (
      !validId(input.orderId) ||
      !validId(input.requestKey) ||
      !validAmount(input.amountWon)
    )
      throw new Error("INVALID_PAYMENT_INPUT");
    const previous = this.preparations.get(input.requestKey);
    const payment = this.payments.get(input.orderId);
    if (
      (previous &&
        (previous.orderId !== input.orderId ||
          previous.amountWon !== input.amountWon)) ||
      (payment && payment.amountWon !== input.amountWon)
    )
      throw new Error("PAYMENT_IDEMPOTENCY_CONFLICT");
    this.preparations.set(input.requestKey, { ...input });
    if (!payment)
      this.payments.set(input.orderId, {
        transactionId: input.orderId,
        orderId: input.orderId,
        amountWon: input.amountWon,
        currency: "KRW",
        status: "pending",
        mode: "test",
        refundedAmountWon: 0,
        refunds: [],
      });
    return {
      provider: "fake",
      mode: "test",
      orderId: input.orderId,
      transactionId: input.orderId,
      checkout: { kind: "test" },
    };
  }

  async fetchPayment(transactionId: string): Promise<VerifiedPayment> {
    assertTestPaymentAllowed();
    const payment = this.payments.get(transactionId);
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    return structuredClone(payment);
  }

  async markPaid(transactionId: string): Promise<void> {
    assertTestPaymentAllowed();
    const payment = this.payments.get(transactionId);
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status !== "pending" && payment.status !== "paid")
      throw new Error("PAYMENT_STATE_CONFLICT");
    payment.status = "paid";
  }

  async verifyWebhook(
    rawBody: Uint8Array,
    headers: Headers,
  ): Promise<VerifiedPaymentEvent> {
    assertTestPaymentAllowed();
    const invalid = () => new Error("INVALID_PAYMENT_WEBHOOK");
    const id = headers.get("webhook-id") ?? "";
    const timestamp = headers.get("webhook-timestamp") ?? "";
    const signature = headers.get("webhook-signature") ?? "";
    if (
      !validId(id) ||
      !/^\d+$/.test(timestamp) ||
      rawBody.byteLength > 65536 ||
      Math.abs(this.now() / 1000 - Number(timestamp)) > 300
    )
      throw invalid();
    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${id}.${timestamp}.`)
      .update(rawBody)
      .digest();
    const verified = signature.split(" ").some((part) => {
      if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(part)) return false;
      const candidate = Buffer.from(part.slice(3), "base64");
      return (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      );
    });
    if (!verified) throw invalid();
    try {
      const payload: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
      );
      if (!payload || typeof payload !== "object") throw invalid();
      const event = payload as Partial<VerifiedPaymentEvent>;
      if (event.eventId !== id || !validId(event.transactionId as string))
        throw invalid();
      return { eventId: id, transactionId: event.transactionId! };
    } catch {
      throw invalid();
    }
  }

  async refund(input: RefundInput): Promise<VerifiedRefund> {
    assertTestPaymentAllowed();
    if (
      !validId(input.transactionId) ||
      !validId(input.requestKey) ||
      !validAmount(input.amountWon)
    )
      throw new Error("INVALID_PAYMENT_INPUT");
    const previous = this.refunds.get(input.requestKey);
    if (previous) {
      if (
        previous.transactionId !== input.transactionId ||
        previous.amountWon !== input.amountWon
      )
        throw new Error("PAYMENT_IDEMPOTENCY_CONFLICT");
      return structuredClone(previous);
    }
    const payment = this.payments.get(input.transactionId);
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status !== "paid" && payment.status !== "partially_refunded")
      throw new Error("PAYMENT_STATE_CONFLICT");
    const refunded = (payment.refundedAmountWon ?? 0) + input.amountWon;
    if (refunded > payment.amountWon) throw new Error("INVALID_REFUND_AMOUNT");
    const result: VerifiedRefund = {
      ...input,
      reference: `fake-refund-${this.refunds.size + 1}`,
      status: "succeeded",
    };
    this.refunds.set(input.requestKey, result);
    payment.refundedAmountWon = refunded;
    payment.status =
      refunded === payment.amountWon ? "refunded" : "partially_refunded";
    payment.refunds = [...(payment.refunds ?? []), result];
    return structuredClone(result);
  }

  async fetchRefund(input: RefundLookup): Promise<VerifiedRefund | null> {
    assertTestPaymentAllowed();
    const result = this.refunds.get(input.requestKey);
    if (result && result.transactionId !== input.transactionId)
      throw new Error("PAYMENT_IDEMPOTENCY_CONFLICT");
    return result ? structuredClone(result) : null;
  }
}
