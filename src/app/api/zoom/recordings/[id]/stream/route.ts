import { handle } from "@/server/http";
import { resolveZoomRecordingStream } from "@/modules/zoom/recordings";

export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = new URL(r.url).searchParams.get("token") || "";
  return handle(r, (ctx) => resolveZoomRecordingStream(ctx, id, token));
}

