import { createHmac } from "node:crypto";
import { beforeEach, afterEach, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { ingestPaymentEvent } from "../../src/modules/payments/events";
import { runJobs } from "../../src/server/jobs";
import { FakePaymentProvider } from "../support/fake-payment-provider";
let store: Awaited<ReturnType<typeof createTestDatabase>>,
  port: FakePaymentProvider,
  orderId: string;
const now = new Date("2029-12-01T00:00:00Z"),
  secret = "webhook-integration-secret-longer-than-thirty-two-characters";
const sys = () => ({
  db: store.db,
  now: () => now,
  source: "webhook" as const,
});
function event() {
  const id = "signed-webhook-1",
    timestamp = String(now.getTime() / 1000),
    body = JSON.stringify({ eventId: id, transactionId: orderId });
  return {
    raw: Buffer.from(body),
    headers: new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature":
        "v1," +
        createHmac("sha256", secret)
          .update(`${id}.${timestamp}.`)
          .update(body)
          .digest("base64"),
    }),
  };
}
beforeEach(async () => {
  process.env.AUTH_PROVIDER = "test";
  process.env.E2E_AUTH_SECRET = secret;
  process.env.PAYMENT_PROVIDER = "fake";
  store = await createTestDatabase();
  const s = await seedScenario(store.db);
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
  const o = await createOrder(makeContext(store.db, s.parent, now), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "webhook",
    consent: true,
  });
  if (!o.ok) throw Error(o.code);
  orderId = o.value.orderId;
  port = new FakePaymentProvider({
    now: () => now.getTime(),
    webhookSecret: secret,
  });
  await port.prepare({ orderId, amountWon: 100000, requestKey: "prepare" });
  await port.markPaid(orderId);
});
afterEach(async () => {
  await store?.close();
});
it("persists a signed event and work before granting verified access", async () => {
  const e = event();
  await ingestPaymentEvent(sys(), e.raw, e.headers, port);
  await ingestPaymentEvent(sys(), e.raw, e.headers, port);
  expect(await store.db.providerEvent.count()).toBe(1);
  expect(await store.db.job.count()).toBe(1);
  expect(await store.db.enrollment.count()).toBe(0);
  await runJobs(sys(), 10, port);
  expect(await store.db.enrollment.count({ where: { orderId } })).toBe(1);
  expect((await store.db.providerEvent.findFirstOrThrow()).status).toBe(
    "processed",
  );
});
it("tampered signatures cannot persist an event or activate enrollment", async () => {
  const e = event();
  await expect(
    ingestPaymentEvent(
      sys(),
      Buffer.concat([e.raw, Buffer.from(" ")]),
      e.headers,
      port,
    ),
  ).rejects.toThrow("FORBIDDEN");
  expect(await store.db.providerEvent.count()).toBe(0);
  expect(await store.db.job.count()).toBe(0);
});
it("concurrent delivery acknowledges one durable event twice", async () => {
  const e = event();
  const results = await Promise.all([
    ingestPaymentEvent(sys(), e.raw, e.headers, port),
    ingestPaymentEvent(sys(), e.raw, e.headers, port),
  ]);
  expect(results.every((r) => r.accepted)).toBe(true);
  expect(await store.db.providerEvent.count()).toBe(1);
  expect(await store.db.job.count()).toBe(1);
});
