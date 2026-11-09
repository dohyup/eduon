import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { explainRecommendations } from "../../src/modules/recommendations/explain";
import { rankOfferings } from "../../src/modules/recommendations/rank";
import { demoOfferings as offerings } from "../../src/demo/catalog";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it("no model or provider failure preserves the rule results", async () => {
  const items = rankOfferings(offerings, { subject: "math" });
  expect(await explainRecommendations(items)).toEqual(items);
  expect(
    await explainRecommendations(items, {
      explain: async () => {
        throw Error("timeout");
      },
    }),
  ).toEqual(items);
});
it("invented IDs and invented prices cannot change results", async () => {
  const items = rankOfferings(offerings, { subject: "math" });
  expect(
    await explainRecommendations(items, {
      explain: async () => [{ id: "invented-id", reasons: ["수강료 1원"] }],
    }),
  ).toEqual(items);
  expect(
    await explainRecommendations(items, {
      explain: async () =>
        items.map((x) => ({
          id: x.offering.id,
          reasons: ["성적 향상 보장", "수강료 1원"],
        })),
    }),
  ).toEqual(items);
});
it("sends only enumerated public facts and accepts allowlisted explanations", async () => {
  const items = rankOfferings(offerings, { subject: "math" });
  let sent: unknown;
  const result = await explainRecommendations(items, {
    explain: async (input) => {
      sent = input;
      return input.candidates.map((c) => ({
        id: c.id,
        reasons: c.publicFacts.allowedReasons,
      }));
    },
  });
  expect(JSON.stringify(sent)).not.toContain("title");
  expect(JSON.stringify(sent)).not.toContain("student");
  expect(result.map((x) => x.offering)).toEqual(items.map((x) => x.offering));
  expect(result[0].reasons).toContain(`수강료 ${items[0].offering.priceWon}원`);
});
it("times out after three seconds and retains the original ranking", async () => {
  const items = rankOfferings(offerings, { subject: "math" });
  const pending = explainRecommendations(items, {
    explain: () => new Promise(() => {}),
  });
  await vi.advanceTimersByTimeAsync(3001);
  expect(await pending).toEqual(items);
});
