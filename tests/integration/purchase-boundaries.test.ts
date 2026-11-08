import { beforeEach, afterEach, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
let store: Awaited<ReturnType<typeof createTestDatabase>>,
  s: Awaited<ReturnType<typeof seedScenario>>;
const now = new Date("2029-12-01T00:00:00Z");
beforeEach(async () => {
  store = await createTestDatabase();
  s = await seedScenario(store.db);
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
});
afterEach(async () => {
  await store?.close();
});
const order = () =>
  createOrder(makeContext(store.db, s.parent, now), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "boundary",
    consent: true,
  });
it("hold ends no later than enrollment close or first session", async () => {
  const close = new Date(now.getTime() + 4 * 60 * 1000);
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { enrollmentClosesAt: close },
  });
  await store.db.session.update({
    where: { id: s.sessionId },
    data: {
      startsAt: new Date(now.getTime() + 5 * 60 * 1000),
      endsAt: new Date(now.getTime() + 30 * 60 * 1000),
    },
  });
  const r = await order();
  expect(r.ok && r.value.expiresAt).toBe(close.toISOString());
});
it("cancelled historical enrollment prevents repurchase of the same cohort before charging", async () => {
  await store.db.enrollment.create({
    data: {
      offeringId: s.offeringId,
      studentId: s.studentId,
      status: "cancelled",
    },
  });
  expect(await order()).toEqual({ ok: false, code: "CONFLICT" });
  expect(await store.db.order.count()).toBe(0);
});
it("does not reserve a paid-checkout seat for a zero-price cohort", async () => {
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { priceWon: 0 },
  });
  expect(await order()).toEqual({ ok: false, code: "VALIDATION" });
  expect(await store.db.seatReservation.count()).toBe(0);
});
