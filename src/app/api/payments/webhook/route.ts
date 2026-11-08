import { readRawBody, respond } from "@/server/http";
import { AppError, ensure } from "@/server/errors";
import { getDatabase } from "@/server/db";
import { isDemoMode } from "@/server/config";
import {
  getPaymentProvider,
  paymentReadiness,
} from "@/integrations/payments/provider";
import { ingestPaymentEvent } from "@/modules/payments/events";
export async function POST(r: Request) {
  try {
    ensure(
      !isDemoMode() && paymentReadiness().configured,
      "PROVIDER_UNAVAILABLE",
    );
    const raw = await readRawBody(r);
    const value = await ingestPaymentEvent(
      { db: getDatabase(), now: () => new Date(), source: "webhook" },
      raw,
      r.headers,
      getPaymentProvider(),
    );
    return respond({ ok: true, value });
  } catch (e) {
    return respond({
      ok: false,
      code: e instanceof AppError ? e.code : "UNAVAILABLE",
    });
  }
}
