import { handle, readJson } from "@/server/http";
import { createNextCohort } from "@/modules/catalog/authoring";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => createNextCohort(ctx, id, await readJson(r)),
    true,
  );
}
