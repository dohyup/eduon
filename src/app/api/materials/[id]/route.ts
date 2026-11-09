import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { deleteMaterial } from "@/modules/learning/materials";
export async function DELETE(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(
    r,
    async (ctx) => {
      const p = z
        .object({ reason: z.string().min(1).max(500) })
        .strict()
        .parse(await readJson(r));
      return deleteMaterial(ctx, { materialId: id, ...p });
    },
    true,
  );
}
