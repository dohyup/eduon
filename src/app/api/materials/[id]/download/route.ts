import { handleLearning } from "@/server/learning-http";
import { getMaterialDownload } from "@/modules/learning/materials";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    q = new URL(r.url).searchParams;
  return handleLearning(r, (ctx) =>
    getMaterialDownload(ctx, id, {
      studentId: q.get("studentId") || undefined,
      assignmentId: q.get("assignmentId") || undefined,
    }),
  );
}
