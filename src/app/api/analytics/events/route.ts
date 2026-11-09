import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { trackDiscovery } from "@/modules/analytics/events";
export function POST(r: Request) {
  return handleLearning(
    r,
    async (ctx) => trackDiscovery(ctx, await readJson(r)),
    true,
    "telemetry",
  );
}
