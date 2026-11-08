import { handle } from "@/server/http";
import { getOrder } from "@/modules/enrollment/orders";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => getOrder(ctx, id));
}
