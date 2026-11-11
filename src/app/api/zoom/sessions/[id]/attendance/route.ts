import { handle, readJson } from "@/server/http";
import { overrideStudentAttendance } from "@/modules/zoom/attendance";

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        studentId: string;
        status: "present" | "late" | "absent";
        reason: string;
      };
      return overrideStudentAttendance(ctx, {
        ...body,
        sessionId: id,
      });
    },
    true,
  );
}

