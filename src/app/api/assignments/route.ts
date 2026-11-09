import { handleLearning, asPage } from "@/server/learning-http";
import { readJson } from "@/server/http";
import {
  createAssignment,
  listAssignments,
} from "@/modules/learning/assignments";
export function GET(r: Request) {
  const q = new URL(r.url).searchParams;
  return handleLearning(r, async (ctx) =>
    asPage(
      await listAssignments(ctx, {
        offeringId: q.get("offeringId") || "",
        studentId: q.get("studentId") || undefined,
        cursor: q.get("cursor") || undefined,
      }),
    ),
  );
}
export function POST(r: Request) {
  return handleLearning(
    r,
    async (ctx) => createAssignment(ctx, await readJson(r)),
    true,
  );
}
