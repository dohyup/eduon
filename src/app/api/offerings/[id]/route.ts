import { handle, readJson } from "@/server/http";
import { updateOffering } from "@/modules/catalog/authoring";
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => updateOffering(ctx, id, await readJson(r)),
    true,
  );
}
