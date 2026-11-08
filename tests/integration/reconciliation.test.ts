import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import { FakePaymentProvider } from "../../src/integrations/payments/fake";
import { expireReservations } from "../../src/modules/enrollment/expire";
import { runJobs } from "../../src/server/jobs";
import {
  reconcilePayments,
  claimSchedulerNonce,
  getPaymentExceptions,
  retryJob,
} from "../../src/modules/payments/reconcile";
import { verifyJobRequest } from "../../src/server/job-auth";
import type { SystemContext } from "../../src/server/context";
let store: Awaited<ReturnType<typeof createTestDatabase>>;
const start = new Date("2029-12-01T00:00:00Z");
let now: Date;
let sys: SystemContext;
let port: FakePaymentProvider;
beforeEach(async () => {
  vi.stubEnv("AUTH_PROVIDER", "test");
  vi.stubEnv("E2E_AUTH_SECRET", "recovery-test-secret-at-least-32-characters");
  vi.stubEnv("PAYMENT_PROVIDER", "fake");
  vi.stubEnv("PAYMENT_MODE", "test");
  store = await createTestDatabase();
  now = start;
  sys = { db: store.db, now: () => now, source: "job" };
  port = new FakePaymentProvider();
});
afterEach(async () => {
  await store?.close();
  vi.unstubAllEnvs();
});
async function order() {
  const s = await seedScenario(store.db);
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
  const result = await createOrder(makeContext(store.db, s.parent, start), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "recovery",
    consent: true,
  });
  if (!result.ok) throw new Error(result.code);
  const id = result.value.orderId;
  await port.prepare({
    orderId: id,
    amountWon: 100000,
    requestKey: `prepare:${id}`,
  });
  await store.db.payment.create({
    data: { orderId: id, transactionId: id, amountWon: 100000 },
  });
  return { ...s, id };
}
async function eventJob(orderId: string) {
  const event = await store.db.providerEvent.create({
    data: { eventId: randomUUID(), transactionId: orderId, payloadJson: {} },
  });
  const job = await store.db.job.create({
    data: {
      type: "payment_event",
      dedupeKey: `event:${event.id}`,
      payloadJson: { eventId: event.id },
      runAt: now,
    },
  });
  return { event, job };
}
it("expires holds and compensates late paid evidence without access", async () => {
  const s = await order();
  now = new Date(start.getTime() + 11 * 60_000);
  expect(await expireReservations(sys)).toEqual({ expired: 1 });
  await port.markPaid(s.id);
  expect(
    (await applyVerifiedPayment(sys, await port.fetchPayment(s.id))).ok,
  ).toBe(true);
  expect(await store.db.enrollment.count({ where: { orderId: s.id } })).toBe(0);
  await runJobs(sys, 10, port);
  expect(
    (await store.db.refund.findFirstOrThrow({ where: { orderId: s.id } }))
      .status,
  ).toBe("succeeded");
});
it("two workers claim an event once and recover a dead worker lease", async () => {
  const s = await order();
  await port.markPaid(s.id);
  const { job, event } = await eventJob(s.id);
  await store.db.job.update({
    where: { id: job.id },
    data: {
      status: "processing",
      attempts: 1,
      claimToken: randomUUID(),
      leaseUntil: new Date(start.getTime() - 1),
    },
  });
  const results = await Promise.all([
    runJobs(sys, 1, port),
    runJobs(sys, 1, port),
  ]);
  expect(results.reduce((sum, r) => sum + r.processed, 0)).toBe(1);
  expect(
    (await store.db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts,
  ).toBe(2);
  expect(
    (
      await store.db.providerEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).status,
  ).toBe("processed");
  expect(await store.db.enrollment.count({ where: { orderId: s.id } })).toBe(1);
});
it("repairs an event persisted before its enqueue and retries provider outage", async () => {
  const s = await order();
  await port.markPaid(s.id);
  const event = await store.db.providerEvent.create({
    data: { eventId: randomUUID(), transactionId: s.id, payloadJson: {} },
  });
  await reconcilePayments(sys, port);
  const outage = Object.create(port) as FakePaymentProvider;
  outage.fetchPayment = async () => {
    throw new Error("provider secret must never be stored");
  };
  await runJobs(sys, 10, outage);
  expect(
    (
      await store.db.providerEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).status,
  ).not.toBe("processed");
  const pending = await store.db.job.findFirstOrThrow({
    where: { type: "payment_event" },
  });
  expect(pending.runAt).toEqual(new Date(start.getTime() + 60_000));
  expect(pending.lastError).not.toContain("secret");
  now = new Date(start.getTime() + 60_000);
  await runJobs(sys, 10, port);
  expect(
    (
      await store.db.providerEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).status,
  ).toBe("processed");
});
it("stale workers cannot complete a job after another worker steals the lease", async () => {
  const s = await order();
  await port.markPaid(s.id);
  const { job } = await eventJob(s.id);
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const slow = Object.create(port) as FakePaymentProvider;
  slow.fetchPayment = async (id) => {
    started();
    await blocked;
    return port.fetchPayment(id);
  };
  const first = runJobs(sys, 1, slow);
  await entered;
  now = new Date(start.getTime() + 61_000);
  const outage = Object.create(port) as FakePaymentProvider;
  outage.fetchPayment = async () => {
    throw new Error("offline");
  };
  await runJobs(sys, 1, outage);
  release();
  await first;
  const stored = await store.db.job.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(stored.status).toBe("pending");
  expect(stored.attempts).toBe(2);
  expect(stored.runAt).toEqual(new Date(start.getTime() + 61_000 + 5 * 60_000));
});
it("a valid scheduler signature can only durably claim its nonce once", async () => {
  vi.stubEnv("JOBS_SECRET", "scheduler-test-secret-at-least-32-characters");
  const raw = Buffer.from('{"limit":10}');
  const nonce = randomUUID().replaceAll("-", "");
  const timestamp = String(Math.floor(start.getTime() / 1000));
  const signature = createHmac("sha256", process.env.JOBS_SECRET!)
    .update(`${timestamp}.${nonce}.`)
    .update(raw)
    .digest("hex");
  const headers = new Headers({
    "x-eduon-timestamp": timestamp,
    "x-eduon-nonce": nonce,
    "x-eduon-signature": signature,
  });
  const auth = verifyJobRequest(raw, headers, start.getTime());
  const claims = await Promise.all([
    claimSchedulerNonce(sys, auth.nonce),
    claimSchedulerNonce(sys, auth.nonce),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(() =>
    verifyJobRequest(Buffer.from("{}"), headers, start.getTime()),
  ).toThrow("JOB_UNAUTHORIZED");
});
it("terminal jobs stop retrying and only platform admins see recovery details", async () => {
  const s = await order();
  const { job } = await eventJob(s.id);
  const outage = Object.create(port) as FakePaymentProvider;
  outage.fetchPayment = async () => {
    throw new Error("offline");
  };
  for (const offset of [0, 1, 6, 36, 66, 96]) {
    now = new Date(start.getTime() + offset * 60_000);
    await runJobs(sys, 1, outage);
  }
  const stored = await store.db.job.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(stored.status).toBe("failed");
  expect(stored.attempts).toBe(5);
  expect(await getPaymentExceptions(makeContext(store.db, s.parent))).toEqual({
    ok: false,
    code: "FORBIDDEN",
  });
  const result = await getPaymentExceptions(makeContext(store.db, s.admin));
  expect(
    result.ok &&
      result.value.items.some(
        (item) =>
          item.id === job.id && item.orderId === s.id && item.attempts === 5,
      ),
  ).toBe(true);
  expect(
    result.ok && result.value.items.find((item) => item.id === job.id),
  ).toMatchObject({ retryJobId: job.id, canRetry: true });
});
it("reconciliation preserves the webhook event dedupe key", async () => {
  const s = await order();
  const { event } = await eventJob(s.id);
  await reconcilePayments(sys, port);
  await reconcilePayments(sys, port);
  const jobs = await store.db.job.findMany({
    where: { type: "payment_event" },
  });
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payloadJson).toEqual({ eventId: event.id });
});
it("shows an order exception before its compensation worker has run", async () => {
  const s = await order();
  now = new Date(start.getTime() + 11 * 60_000);
  await port.markPaid(s.id);
  await applyVerifiedPayment(sys, await port.fetchPayment(s.id));
  const result = await getPaymentExceptions(makeContext(store.db, s.admin));
  expect(
    result.ok &&
      result.value.items.some(
        (item) =>
          item.orderId === s.id &&
          item.lastError === "PAID_WITHOUT_VALID_RESERVATION",
      ),
  ).toBe(true);
});
it("expiration and confirmation at the deadline cannot grant an active seat", async () => {
  const s = await order();
  now = new Date(start.getTime() + 10 * 60_000);
  await port.markPaid(s.id);
  await Promise.all([
    expireReservations(sys),
    applyVerifiedPayment(sys, await port.fetchPayment(s.id)),
  ]);
  expect(await store.db.enrollment.count({ where: { orderId: s.id } })).toBe(0);
  expect(
    (await store.db.order.findUniqueOrThrow({ where: { id: s.id } })).status,
  ).toBe("payment_exception");
  expect(
    await store.db.refund.count({
      where: { orderId: s.id, kind: "compensation" },
    }),
  ).toBe(1);
});
it("durable bounded scans advance beyond 100 exhausted payments, events and refunds", async () => {
  const s = await order();
  const original = await store.db.order.findUniqueOrThrow({
    where: { id: s.id },
  });
  const students = Array.from({ length: 100 }, () => ({
    id: randomUUID(),
    name: "fair scan student",
    grade: 5,
  }));
  await store.db.studentProfile.createMany({ data: students });
  await store.db.guardianLink.createMany({
    data: students.map((student) => ({
      guardianId: s.parent.userId,
      studentId: student.id,
      verifiedAt: start,
    })),
  });
  const orders = students.map((student) => ({
    ...original,
    id: randomUUID(),
    studentId: student.id,
    requestKey: randomUUID(),
    policySnapshot: original.policySnapshot!,
    sessionsSnapshot: original.sessionsSnapshot!,
  }));
  await store.db.order.createMany({ data: orders });
  await store.db.payment.createMany({
    data: orders.map((row) => ({
      orderId: row.id,
      transactionId: row.id,
      amountWon: 100000,
    })),
  });
  const payments = await store.db.payment.findMany({ orderBy: { id: "asc" } });
  await store.db.providerEvent.createMany({
    data: Array.from({ length: 101 }, () => ({
      eventId: randomUUID(),
      transactionId: s.id,
      payloadJson: {},
    })),
  });
  const events = await store.db.providerEvent.findMany({
    orderBy: { id: "asc" },
  });
  await store.db.refund.createMany({
    data: Array.from({ length: 101 }, () => ({
      orderId: s.id,
      paymentId: payments.find((p) => p.orderId === s.id)!.id,
      requestKey: randomUUID(),
      amountWon: 1,
      reason: "scan fairness",
      status: "pending",
    })),
  });
  const refunds = await store.db.refund.findMany({ orderBy: { id: "asc" } });
  await store.db.job.createMany({
    data: [
      ...payments
        .slice(0, 100)
        .map((p) => ({
          type: "reconcile",
          dedupeKey: `reconcile:${p.orderId}`,
          payloadJson: { orderId: p.orderId },
        })),
      ...events
        .slice(0, 100)
        .map((e) => ({
          type: "payment_event",
          dedupeKey: `event:${e.id}`,
          payloadJson: { eventId: e.id },
        })),
      ...refunds
        .slice(0, 100)
        .map((r) => ({
          type: "refund",
          dedupeKey: `refund:${r.id}`,
          payloadJson: { refundId: r.id },
        })),
    ].map((job) => ({
      ...job,
      status: "failed",
      attempts: 5,
      lastError: "PROVIDER_UNAVAILABLE",
      runAt: start,
    })),
  });
  const targets = [
    `reconcile:${payments[100].orderId}`,
    `event:${events[100].id}`,
    `refund:${refunds[100].id}`,
  ];
  expect((await reconcilePayments(sys, port)).checked).toBeLessThanOrEqual(100);
  expect(
    await store.db.job.count({ where: { dedupeKey: { in: targets } } }),
  ).toBe(0);
  expect(
    (await reconcilePayments({ ...sys }, port)).checked,
  ).toBeLessThanOrEqual(100);
  expect(
    await store.db.job.count({
      where: { dedupeKey: { in: targets }, status: "pending" },
    }),
  ).toBe(3);
  // A third invocation wraps without resetting exhausted work.
  await reconcilePayments(sys, port);
  expect(
    await store.db.job.count({ where: { status: "failed", attempts: 5 } }),
  ).toBe(300);
});
it("an admin can retry failed event work with its original event and an audit record", async () => {
  const s = await order();
  const { job, event } = await eventJob(s.id);
  await store.db.job.update({
    where: { id: job.id },
    data: { status: "failed", attempts: 5, lastError: "PROVIDER_UNAVAILABLE" },
  });
  await store.db.providerEvent.update({
    where: { id: event.id },
    data: { status: "failed", lastError: "PROVIDER_UNAVAILABLE" },
  });
  expect(await retryJob(makeContext(store.db, s.parent), job.id)).toEqual({
    ok: false,
    code: "FORBIDDEN",
  });
  expect((await retryJob(makeContext(store.db, s.admin), job.id)).ok).toBe(
    true,
  );
  expect(
    await store.db.job.findUniqueOrThrow({ where: { id: job.id } }),
  ).toMatchObject({
    status: "pending",
    attempts: 0,
    claimToken: null,
    payloadJson: { eventId: event.id },
  });
  expect(
    (
      await store.db.providerEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).status,
  ).toBe("pending");
  expect(
    await store.db.auditEvent.count({
      where: { action: "job.retry", targetId: job.id, actorId: s.admin.userId },
    }),
  ).toBe(1);
  await port.markPaid(s.id);
  await runJobs(sys, 1, port);
  expect(
    (await store.db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
  ).toBe("succeeded");
});
it("job retry refuses live leases and delegates failed refunds without changing the external request key", async () => {
  const s = await order();
  await port.markPaid(s.id);
  now = new Date(start.getTime() + 11 * 60_000);
  await applyVerifiedPayment(sys, await port.fetchPayment(s.id));
  const refund = await store.db.refund.findFirstOrThrow({
    where: { orderId: s.id },
  });
  const job = await store.db.job.findUniqueOrThrow({
    where: { dedupeKey: `refund:${refund.id}` },
  });
  await store.db.job.update({
    where: { id: job.id },
    data: {
      status: "processing",
      claimToken: randomUUID(),
      leaseUntil: new Date(now.getTime() + 60_000),
    },
  });
  expect(await retryJob(makeContext(store.db, s.admin, now), job.id)).toEqual({
    ok: false,
    code: "CONFLICT",
  });
  await store.db.job.update({
    where: { id: job.id },
    data: { status: "failed", attempts: 5, leaseUntil: null, claimToken: null },
  });
  await store.db.refund.update({
    where: { id: refund.id },
    data: { status: "failed" },
  });
  expect((await retryJob(makeContext(store.db, s.admin, now), job.id)).ok).toBe(
    true,
  );
  expect(
    (await store.db.refund.findUniqueOrThrow({ where: { id: refund.id } }))
      .requestKey,
  ).toBe(refund.requestKey);
  expect(
    (await store.db.refund.findUniqueOrThrow({ where: { id: refund.id } }))
      .status,
  ).toBe("requested");
  await runJobs(sys, 1, port);
  expect(
    (await store.db.refund.findUniqueOrThrow({ where: { id: refund.id } }))
      .status,
  ).toBe("succeeded");
});
