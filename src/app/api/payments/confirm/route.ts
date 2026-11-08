import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { confirmPayment } from "@/modules/payments/confirm";
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) =>
      confirmPayment(
        ctx,
        z
          .object({
            orderId: z.uuid(),
            transactionId: z.string().min(1).max(200),
          })
          .strict()
          .parse(await readJson(r)),
      ),
    true,
  );
}
