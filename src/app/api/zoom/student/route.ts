import { handle } from "@/server/http";
import { getStudentZoomLearningOverview } from "@/modules/zoom/student";

export function GET(r: Request) {
  return handle(r, (ctx) => getStudentZoomLearningOverview(ctx));
}

