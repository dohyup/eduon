import type { ServiceContext, Actor } from "../../src/server/context";
export function makeContext(
  db: ServiceContext["db"],
  actor: Actor,
  now = new Date("2029-12-01T00:00:00Z"),
): ServiceContext {
  return { db, actor, now: () => now };
}
