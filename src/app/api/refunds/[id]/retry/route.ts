import { handle, readJson } from "@/server/http";
import { z } from "zod";
import { retryRefund } from "@/modules/payments/refunds";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      z.object({})
        .strict()
        .parse(await readJson(r));
      return retryRefund(ctx, id);
    },
    true,
  );
}
