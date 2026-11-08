import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { ensure } from "@/server/errors";
import { createOrder, listOrders } from "@/modules/enrollment/orders";
import { paymentReadiness } from "@/integrations/payments/provider";
export function GET(r: Request) {
  return handle(r, async (ctx) => {
    const v = await listOrders(
      ctx,
      new URL(r.url).searchParams.get("cursor") || undefined,
    );
    return v.ok
      ? {
          ok: true,
          value: {
            items: v.value,
            nextCursor: v.value.length === 20 ? v.value[19].id : null,
          },
        }
      : v;
  });
}
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      ensure(paymentReadiness().configured, "PROVIDER_UNAVAILABLE");
      const v = z
        .object({
          studentId: z.uuid(),
          offeringId: z.uuid(),
          requestKey: z.string().min(1).max(200),
          consent: z.literal(true),
        })
        .strict()
        .parse(await readJson(r));
      return createOrder(ctx, v);
    },
    true,
  );
}
