import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { createReview, listPublicReviews } from "@/modules/learning/reviews";
import { getDatabase } from "@/server/db";
import { learningEnabled } from "@/modules/learning/access";
import { AppError, ensure } from "@/server/errors";
import { respond } from "@/server/http";
export async function GET(r: Request) {
  try {
    ensure(learningEnabled(), "UNAVAILABLE");
    const q = new URL(r.url).searchParams;
    return respond({
      ok: true,
      value: await listPublicReviews(
        getDatabase(),
        q.get("offeringId") || "",
        q.get("cursor") || undefined,
      ),
    });
  } catch (e) {
    return respond({
      ok: false,
      code: e instanceof AppError ? e.code : "VALIDATION",
    });
  }
}
export function POST(r: Request) {
  return handleLearning(
    r,
    async (ctx) => createReview(ctx, await readJson(r)),
    true,
  );
}
