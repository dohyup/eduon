import { handle, readJson } from "@/server/http";
import {
  createOffering,
  listManagedOfferings,
} from "@/modules/catalog/authoring";
export function GET(r: Request) {
  return handle(r, async (ctx) => {
    const result = await listManagedOfferings(
      ctx,
      new URL(r.url).searchParams.get("cursor") || undefined,
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
  return handle(r, async (ctx) => createOffering(ctx, await readJson(r)), true);
}
