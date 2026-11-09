import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { recordAttendance } from "@/modules/learning/attendance";
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
          studentId: z.uuid(),
          status: z.enum(["present", "absent", "late"]),
          reason: z.string().min(1).max(2000),
        })
        .strict()
        .parse(await readJson(r));
      return recordAttendance(ctx, { ...p, sessionId: id });
    },
    true,
  );
}
