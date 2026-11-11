import { handle, readJson } from "@/server/http";
import { createSessionMaterial } from "@/modules/zoom/classroom";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        title: string;
        description?: string;
        fileName: string;
        content: string;
      };
      return createSessionMaterial(ctx, {
        ...body,
        sessionId: id,
      });
    },
    true,
  );
}

