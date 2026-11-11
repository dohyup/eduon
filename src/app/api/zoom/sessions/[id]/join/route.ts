import { handle, readJson } from "@/server/http";
import {
  joinZoomSessionByStudent,
  startZoomSessionByHost,
} from "@/modules/zoom/classroom";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        mode?: "host" | "student";
        recordingConsentAgreed?: boolean;
      };
      if (body?.mode === "host") {
        return startZoomSessionByHost(ctx, id);
      }
      return joinZoomSessionByStudent(ctx, id, {
        recordingConsentAgreed: body?.recordingConsentAgreed,
      });
    },
    true,
  );
}

