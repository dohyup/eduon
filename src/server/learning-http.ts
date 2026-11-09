import "server-only";
import type { ServiceContext } from "./context";
import type { Outcome } from "./errors";
import { ensure } from "./errors";
import { handle } from "./http";
import { learningEnabled } from "@/modules/learning/access";
export function handleLearning(
  r: Request,
  fn: (ctx: ServiceContext) => Promise<Outcome<unknown>>,
  mutate = false,
  rateScope: "mutate" | "telemetry" = "mutate",
) {
  return handle(
    r,
    (ctx) => {
      ensure(learningEnabled(), "UNAVAILABLE");
      return fn(ctx);
    },
    mutate,
    rateScope,
  );
}
export function asPage<T extends { id: string }>(r: Outcome<T[]>) {
  return r.ok
    ? {
        ok: true as const,
        value: {
          items: r.value,
          nextCursor: r.value.length === 20 ? r.value[19].id : null,
        },
      }
    : r;
}
