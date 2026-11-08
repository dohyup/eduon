import { handle, readJson } from "@/server/http";
import { createChild } from "@/modules/identity/guardian-links";
export function POST(r: Request) {
  return handle(r, async (ctx) => createChild(ctx, await readJson(r)), true);
}
