import { handleLearning } from "@/server/learning-http";
import { getLearningSummary } from "@/modules/learning/summary";
export function GET(r: Request) {
  return handleLearning(r, (ctx) =>
    getLearningSummary(ctx, new URL(r.url).searchParams.get("studentId") || ""),
  );
}
