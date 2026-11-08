import { handle } from "@/server/http";
import { getPaymentExceptions } from "@/modules/payments/reconcile";
export function GET(r: Request) {
  return handle(r, (ctx) =>
    getPaymentExceptions(
      ctx,
      new URL(r.url).searchParams.get("cursor") || undefined,
    ),
  );
}
