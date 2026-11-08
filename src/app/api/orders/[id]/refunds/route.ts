import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { ensure } from "@/server/errors";
import { requestRefund } from "@/modules/payments/refunds";
import { paymentReadiness } from "@/integrations/payments/provider";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      ensure(paymentReadiness().configured, "PROVIDER_UNAVAILABLE");
      const v = z
        .object({
          cancelSessionIds: z.array(z.uuid()).min(1).max(100),
          reason: z.string().min(1).max(500),
          requestKey: z.string().min(1).max(200),
        })
        .strict()
        .parse(await readJson(r));
      return requestRefund(ctx, { ...v, orderId: id });
    },
    true,
  );
}
