import { handle, readJson } from "@/server/http";
import {
  requestZoomRecordingPlayback,
  setZoomRecordingVisibility,
} from "@/modules/zoom/recordings";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => requestZoomRecordingPlayback(ctx, id), true);
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
        isPublic: boolean;
        consentNoticeConfirmed?: boolean;
      };
      return setZoomRecordingVisibility(ctx, {
        ...body,
        recordingId: id,
      });
    },
    true,
  );
}

