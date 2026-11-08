import "server-only";
import type { PaymentPort } from "./port";
import { FakePaymentProvider } from "./fake";
import { assertTestPaymentAllowed } from "./test-guard";
export { assertTestPaymentAllowed } from "./test-guard";

export type PaymentReadiness = {
  configured: boolean;
  provider: "fake" | "portone-v2" | null;
  mode: "test" | null;
  reason?:
    "PAYMENT_UNCONFIGURED" | "PAYMENT_LIVE_DISABLED" | "TEST_PAYMENT_FORBIDDEN";
};

export function paymentReadiness(): PaymentReadiness {
  if (process.env.PAYMENT_MODE === "live")
    return {
      configured: false,
      provider: null,
      mode: null,
      reason: "PAYMENT_LIVE_DISABLED",
    };
  if (process.env.PAYMENT_PROVIDER === "fake") {
    try {
      assertTestPaymentAllowed();
      return { configured: true, provider: "fake", mode: "test" };
    } catch {
      return {
        configured: false,
        provider: "fake",
        mode: null,
        reason: "TEST_PAYMENT_FORBIDDEN",
      };
    }
  }
  return {
    configured: false,
    provider: null,
    mode: null,
    reason: "PAYMENT_UNCONFIGURED",
  };
}

export function getPaymentProvider(): PaymentPort {
  const readiness = paymentReadiness();
  if (!readiness.configured) throw new Error(readiness.reason);
  return getTestPaymentProvider();
}

const testRuntime = globalThis as typeof globalThis & {
  eduonTestPayments?: { secret: string; provider: FakePaymentProvider };
};

export function getTestPaymentProvider(): FakePaymentProvider {
  assertTestPaymentAllowed();
  if (process.env.PAYMENT_PROVIDER !== "fake")
    throw new Error("TEST_PAYMENT_FORBIDDEN");
  const secret = process.env.E2E_AUTH_SECRET!;
  if (
    !testRuntime.eduonTestPayments ||
    testRuntime.eduonTestPayments.secret !== secret
  )
    testRuntime.eduonTestPayments = {
      secret,
      provider: new FakePaymentProvider(),
    };
  return testRuntime.eduonTestPayments.provider;
}
