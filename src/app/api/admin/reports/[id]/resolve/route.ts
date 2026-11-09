import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { resolveReport } from "@/modules/learning/reviews";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(
    r,
    async (ctx) => {
      const p = z
        .object({
          action: z.enum(["hide", "keep"]),
          reason: z.string().min(1).max(500),
        })
        .strict()
        .parse(await readJson(r));
      return resolveReport(ctx, { reportId: id, ...p });
    },
    true,
  );
}
