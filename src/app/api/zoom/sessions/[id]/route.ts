import { handle, readJson } from "@/server/http";
import { getClassroomState } from "@/modules/zoom/classroom";
import { updateSessionScheduleAndSyncZoom } from "@/modules/zoom/meetings";

export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => getClassroomState(ctx, id));
}

export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        startsAt: string;
        endsAt: string;
        waitingRoom?: boolean;
        autoRecording?: "none" | "cloud" | "local";
      };
      return updateSessionScheduleAndSyncZoom(ctx, {
        ...body,
        sessionId: id,
      });
    },
    true,
  );
}

