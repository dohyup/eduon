import { handleLearning } from "@/server/learning-http";
import { getLearningOverview } from "@/modules/learning/views";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(r, (ctx) =>
    getLearningOverview(ctx, id, {
      studentId: new URL(r.url).searchParams.get("studentId") || undefined,
    }),
  );
}
