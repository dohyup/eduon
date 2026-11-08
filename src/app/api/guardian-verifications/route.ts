import { handle, readJson } from "@/server/http";
import { verifyGuardian } from "@/modules/identity/guardian-links";
export function POST(r: Request) {
  return handle(r, async (ctx) => verifyGuardian(ctx, await readJson(r)), true);
}
