import { handleLearning } from "@/server/learning-http";
import { listLearningOfferings } from "@/modules/learning/views";
import type { LearningView } from "@/contracts/learning";
export function GET(r: Request) {
  const q = new URL(r.url).searchParams;
  return handleLearning(r, (ctx) =>
    listLearningOfferings(ctx, {
      view: (q.get("view") || "student") as LearningView,
      studentId: q.get("studentId") || undefined,
      cursor: q.get("cursor") || undefined,
    }),
  );
}
