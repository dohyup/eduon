import { handle } from "@/server/http";
import { syncSessionZoomRecordings } from "@/modules/zoom/recordings";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => syncSessionZoomRecordings(ctx, id), true);
}

