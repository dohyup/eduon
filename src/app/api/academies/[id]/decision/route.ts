import { handle, readJson } from "@/server/http";
import { decideAcademy } from "@/modules/academies/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) =>
      decideAcademy(ctx, { ...(await readJson(r)), academyId: id }),
    true,
  );
}
