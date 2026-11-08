export type PaymentMode = "test" | "live";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

export type RefundInput = {
  transactionId: string;
  amountWon: number;
  requestKey: string;
};
export type RefundLookup = Pick<RefundInput, "transactionId" | "requestKey">;
export type VerifiedRefund = RefundInput & {
  reference: string;
  status: "succeeded" | "pending" | "failed";
};
export type VerifiedPayment = {
  transactionId: string;
  orderId: string;
  amountWon: number;
  currency: "KRW";
  status: PaymentStatus;
  mode: PaymentMode;
  providerTransactionId?: string;
  refundedAmountWon?: number;
  refunds?: VerifiedRefund[];
};
export type PreparePaymentInput = {
  orderId: string;
  amountWon: number;
  requestKey: string;
  orderName?: string;
};
export type CheckoutPreparation = {
  provider: "portone-v2" | "fake";
  orderId: string;
  transactionId: string;
  mode: PaymentMode;
  checkout:
    | { kind: "test" }
    | {
        kind: "sdk";
        provider: "portone-v2";
        storeId: string;
        channelKey: string;
        paymentId: string;
        orderName: string;
        totalAmount: number;
        currency: "KRW";
        payMethod: "CARD";
      };
};
export type VerifiedPaymentEvent = { eventId: string; transactionId: string };

/** All results are authenticated provider facts, never redirect parameters. */
export interface PaymentPort {
  prepare(input: PreparePaymentInput): Promise<CheckoutPreparation>;
  verifyWebhook(
    rawBody: Uint8Array,
    headers: Headers,
  ): Promise<VerifiedPaymentEvent>;
  fetchPayment(transactionId: string): Promise<VerifiedPayment>;
  refund(input: RefundInput): Promise<VerifiedRefund>;
  fetchRefund(input: RefundLookup): Promise<VerifiedRefund | null>;
}
