import { handleLearning } from "@/server/learning-http";
import { getAnalytics } from "@/modules/analytics/events";
export function GET(r: Request) {
  return handleLearning(r, (ctx) =>
    getAnalytics(
      ctx,
      new URL(r.url).searchParams.get("academyId") || undefined,
    ),
  );
}
