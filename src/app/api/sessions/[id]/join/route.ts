import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { requestJoin } from "@/modules/learning/join";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(
    r,
    async (ctx) => {
      z.object({})
        .strict()
        .parse(await readJson(r));
      return requestJoin(ctx, id);
    },
    true,
  );
}
