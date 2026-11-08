import { handle } from "@/server/http";
import { listSettlements } from "@/modules/payments/settlement";
export function GET(r: Request) {
  const q = new URL(r.url).searchParams;
  return handle(r, (ctx) =>
    listSettlements(ctx, {
      academyId: q.get("academyId") || undefined,
      cursor: q.get("cursor") || undefined,
    }),
  );
}
