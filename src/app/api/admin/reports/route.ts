import { handleLearning } from "@/server/learning-http";
import { listReviewReports } from "@/modules/learning/reviews";
export function GET(r: Request) {
  return handleLearning(r, (ctx) =>
    listReviewReports(
      ctx,
      new URL(r.url).searchParams.get("cursor") || undefined,
    ),
  );
}
