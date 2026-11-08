import "server-only";

/** Evaluated on construction and every use so a retained fake cannot bypass config. */
export function assertTestPaymentAllowed(): void {
  if (
    process.env.NODE_ENV === "production" ||
    (process.env.NODE_ENV !== "test" && process.env.E2E_TEST_MODE !== "1") ||
    process.env.AUTH_PROVIDER !== "test" ||
    (process.env.E2E_AUTH_SECRET?.length ?? 0) < 32 ||
    process.env.PAYMENT_MODE === "live"
  )
    throw new Error("TEST_PAYMENT_FORBIDDEN");
}
