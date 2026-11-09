import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { saveFeedback } from "@/modules/learning/assignments";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(
    r,
    async (ctx) => {
      const p = z
        .object({ text: z.string().min(1).max(10000) })
        .strict()
        .parse(await readJson(r));
      return saveFeedback(ctx, { submissionId: id, ...p });
    },
    true,
  );
}
