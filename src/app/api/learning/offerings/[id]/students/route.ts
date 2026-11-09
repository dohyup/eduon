import { handleLearning } from "@/server/learning-http";
import { listRoster } from "@/modules/learning/views";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(r, (ctx) =>
    listRoster(ctx, id, new URL(r.url).searchParams.get("cursor") || undefined),
  );
}
