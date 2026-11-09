import { z } from "zod";
import { handleLearning, asPage } from "@/server/learning-http";
import { readJson } from "@/server/http";
import {
  submitAssignment,
  listSubmissions,
} from "@/modules/learning/assignments";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    q = new URL(r.url).searchParams;
  return handleLearning(r, async (ctx) =>
    asPage(
      await listSubmissions(ctx, {
        assignmentId: id,
        studentId: q.get("studentId") || undefined,
        cursor: q.get("cursor") || undefined,
      }),
    ),
  );
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLearning(
    r,
    async (ctx) => {
      const p = z
        .object({
          text: z.string().max(10000),
          fileIds: z.array(z.uuid()).max(5),
        })
        .strict()
        .parse(await readJson(r));
      return submitAssignment(ctx, { ...p, assignmentId: id });
    },
    true,
  );
}
