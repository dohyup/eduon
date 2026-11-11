import { handle, readJson } from "@/server/http";
import { cancelOfferingAndZoomMeetings } from "@/modules/zoom/meetings";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as { reason?: string };
      return cancelOfferingAndZoomMeetings(ctx, id, body?.reason);
    },
    true,
  );
}

