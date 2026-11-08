import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { recordSettlementPaid } from "@/modules/payments/settlement";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const v = z
        .object({ externalReference: z.string().min(4).max(200) })
        .strict()
        .parse(await readJson(r));
      return recordSettlementPaid(ctx, { settlementId: id, ...v });
    },
    true,
  );
}
