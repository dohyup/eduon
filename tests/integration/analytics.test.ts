import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import {
  seedLearningScenario,
  payOrder,
  systemContext,
} from "../support/learning";
import { makeContext } from "../support/context";
import { recordAttendance } from "../../src/modules/learning/attendance";
import {
  getAnalytics,
  trackDiscovery,
} from "../../src/modules/analytics/events";

let store: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  store = await createTestDatabase();
});
afterEach(async () => {
  await store?.close();
});
it("records application, verified payment and actual attendance once and scopes aggregates", async () => {
  const s = await seedLearningScenario(store.db);
  await payOrder(systemContext(store.db), s.orderId);
  const now = new Date("2030-01-01T01:05:00Z");
  const input = {
    sessionId: s.sessionId,
    studentId: s.studentId,
    status: "present" as const,
    reason: "강사 확인",
  };
  expect(
    (await recordAttendance(makeContext(store.db, s.teacher, now), input)).ok,
  ).toBe(true);
  expect(
    (
      await recordAttendance(makeContext(store.db, s.teacher, now), {
        ...input,
        status: "late",
      })
    ).ok,
  ).toBe(true);
  const events = await store.db.analyticsEvent.findMany({
    orderBy: { stage: "asc" },
  });
  expect(events.map((e) => e.stage)).toEqual([
    "application",
    "first_participation",
    "paid",
  ]);
  expect(
    (await getAnalytics(makeContext(store.db, s.owner), s.academyId)).ok,
  ).toBe(true);
  expect(
    (await getAnalytics(makeContext(store.db, s.otherOwner), s.academyId)).ok,
  ).toBe(false);
  expect(
    (await getAnalytics(makeContext(store.db, s.parent), s.academyId)).ok,
  ).toBe(false);
  expect((await getAnalytics(makeContext(store.db, s.owner))).ok).toBe(false);
});
it("deduplicates authenticated discovery without accepting fabricated private stages", async () => {
  const s = await seedLearningScenario(store.db);
  const ctx = makeContext(store.db, s.parent);
  const input = {
    offeringId: s.offeringId,
    stage: "detail" as const,
    requestKey: "view",
  };
  expect((await trackDiscovery(ctx, input)).ok).toBe(true);
  expect((await trackDiscovery(ctx, input)).ok).toBe(true);
  expect(
    await store.db.analyticsEvent.count({ where: { stage: "detail" } }),
  ).toBe(1);
  expect(
    (await trackDiscovery(ctx, { ...input, stage: "paid" as "detail" })).ok,
  ).toBe(false);
});
