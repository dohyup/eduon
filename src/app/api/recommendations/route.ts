import { handle, readJson } from "@/server/http";
import { recommend } from "@/modules/recommendations/service";
export function POST(r: Request) {
  return handle(r, async (ctx) => recommend(ctx, await readJson(r)), true);
}
