import { handle } from "@/server/http";
import { retryOfferingZoomSync } from "@/modules/zoom/meetings";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => retryOfferingZoomSync(ctx, id), true);
}

