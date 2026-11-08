import { handle, readJson, asOutcome } from "@/server/http";
import { requireActor } from "@/modules/identity/access";
import { ensure } from "@/server/errors";
import {
  submitAcademy,
  listManagedAcademies,
} from "@/modules/academies/service";
export function GET(r: Request) {
  return handle(r, async (ctx) => {
    const params = new URL(r.url).searchParams;
    if (params.get("review") === "true") {
      const checked = await asOutcome(async () =>
        ensure((await requireActor(ctx)).platformAdmin, "FORBIDDEN"),
      );
      if (!checked.ok) return checked;
    }
    const result = await listManagedAcademies(
      ctx,
      params.get("cursor") || undefined,
    );
    return result.ok
      ? {
          ...result,
          nextCursor: result.value.length === 20 ? result.value[19].id : null,
        }
      : result;
  });
}
export function POST(r: Request) {
  return handle(r, async (ctx) => submitAcademy(ctx, await readJson(r)), true);
}
