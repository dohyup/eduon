import "server-only";
import type { SearchInput } from "@/contracts/domain";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { searchOfferings } from "@/modules/catalog/search";
import { rankOfferings, RULE_VERSION, validSearchInput } from "./rank";

/** Rank at most five search pages (100 eligible candidates), without a global accuracy guarantee. */
export function recommend(ctx: ServiceContext, input: SearchInput) {
  return attempt(async () => {
    await requireActor(ctx);
    ensure(validSearchInput(input), "VALIDATION");
    let cursor: string | undefined;
    let best: ReturnType<typeof rankOfferings> = [];
    for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
      const page = await searchOfferings(
        { ...input, cursor },
        ctx.db,
        ctx.now(),
      );
      best = rankOfferings(
        [...best.map((r) => r.offering), ...page.items],
        input,
      );
      cursor = page.nextCursor ?? undefined;
      if (!cursor) break;
    }
    await ctx.db.recommendationEvent.create({
      data: {
        actorId: ctx.actor.userId,
        ruleVersion: RULE_VERSION,
        candidateIds: best.map((r) => r.offering.id),
        createdAt: ctx.now(),
      },
    });
    return best;
  });
}
