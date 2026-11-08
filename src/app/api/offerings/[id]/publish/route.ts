import { handle } from "@/server/http";
import { publishOffering } from "@/modules/catalog/authoring";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => publishOffering(ctx, id), true);
}
