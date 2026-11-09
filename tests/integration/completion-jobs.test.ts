import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "../../src/generated/prisma/client";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { seedLearning, systemContext } from "../support/learning";
import { makeContext } from "../support/context";
import { scheduleOfferingCompletions } from "../../src/modules/learning/completion";
import { runJobs } from "../../src/server/jobs";
import {
  getPaymentExceptions,
  retryJob,
} from "../../src/modules/payments/reconcile";
import { POST } from "../../src/app/api/internal/jobs/route";
vi.mock("@/server/db", () => ({ getDatabase: () => store.db }));
let store: Awaited<ReturnType<typeof createTestDatabase>>;
let s: Awaited<ReturnType<typeof seedLearning>>;
const started = new Date("2029-12-01T00:00:00Z");
const grace = new Date("2030-01-01T02:10:00Z");
const finished = new Date(grace.getTime() + 1);
beforeEach(async () => {
  vi.stubEnv("AUTH_PROVIDER", "test");
  vi.stubEnv(
    "E2E_AUTH_SECRET",
    "completion-test-authentication-secret-over-32-characters",
  );
  vi.stubEnv("JOBS_SECRET", "completion-scheduler-secret-over-32-characters");
  vi.stubEnv("PAYMENT_PROVIDER", "");
  vi.stubEnv("PAYMENT_MODE", "test");
  vi.stubEnv("DEMO_MODE", "false");
  store = await createTestDatabase();
  s = await seedLearning(
    store.db,
    await seedScenario(store.db, { capacity: 300 }),
    started,
  );
});
afterEach(async () => {
  vi.useRealTimers();
  await store?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function request(nonce = randomUUID().replaceAll("-", "")) {
  const raw = Buffer.from('{"limit":10}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.JOBS_SECRET!)
    .update(`${timestamp}.${nonce}.`)
    .update(raw)
    .digest("hex");
  return new Request("http://localhost/api/internal/jobs", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-eduon-timestamp": timestamp,
      "x-eduon-nonce": nonce,
      "x-eduon-signature": signature,
    },
  });
}
it("runs signed learning-only scheduler requests without payment setup and rejects nonce replay or unsigned execution", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(finished);
  const unsigned = await POST(
    new Request("http://localhost/api/internal/jobs", {
      method: "POST",
      body: '{"limit":10}',
    }),
  );
  expect(unsigned.status).toBe(401);
  expect(await store.db.job.count()).toBe(0);
  const nonce = randomUUID().replaceAll("-", "");
  const first = await POST(request(nonce));
  expect(first.status).toBe(200);
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: s.enrollmentId },
      })
    ).status,
  ).toBe("completed");
  expect(
    await store.db.job.count({
      where: { type: "complete_offering", status: "succeeded" },
    }),
  ).toBe(1);
  expect((await POST(request(nonce))).status).toBe(409);
});
it("waits through the inclusive final-session grace and deduplicates durable work", async () => {
  expect(
    await scheduleOfferingCompletions(systemContext(store.db, grace)),
  ).toEqual({ scheduled: 0 });
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: s.enrollmentId },
      })
    ).status,
  ).toBe("active");
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  expect(
    await store.db.job.count({ where: { type: "complete_offering" } }),
  ).toBe(1);
  const result = await runJobs(systemContext(store.db, finished), 1);
  expect(result.processed).toBe(1);
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: s.enrollmentId },
      })
    ).status,
  ).toBe("completed");
  expect(await store.db.attendance.count()).toBe(0);
});
it("waits for the final session even when an earlier session and its grace have ended", async () => {
  const future = await seedScenario(store.db);
  await store.db.session.create({
    data: {
      academyId: future.academyId,
      offeringId: future.offeringId,
      startsAt: new Date("2030-01-02T01:00:00Z"),
      endsAt: new Date("2030-01-02T02:00:00Z"),
    },
  });
  const later = await seedLearning(store.db, future, started);
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  expect(
    await store.db.job.count({
      where: {
        type: "complete_offering",
        dedupeKey: `complete_offering:${later.offeringId}`,
      },
    }),
  ).toBe(0);
  await runJobs(systemContext(store.db, finished), 10);
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: later.enrollmentId },
      })
    ).status,
  ).toBe("active");
  const after = new Date("2030-01-02T02:10:00.001Z");
  await scheduleOfferingCompletions(systemContext(store.db, after));
  await runJobs(systemContext(store.db, after), 10);
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: later.enrollmentId },
      })
    ).status,
  ).toBe("completed");
});
it("advances the durable offering scan past its hundred-row bound without duplicate work", async () => {
  const offering = await store.db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
  });
  const session = await store.db.session.findUniqueOrThrow({
    where: { id: s.sessionId },
  });
  const order = await store.db.order.findUniqueOrThrow({
    where: { id: s.orderId },
  });
  const payment = await store.db.payment.findUniqueOrThrow({
    where: { orderId: s.orderId },
  });
  const rows = Array.from({ length: 101 }, () => ({
    offeringId: randomUUID(),
    orderId: randomUUID(),
  }));
  await store.db.offering.createMany({
    data: rows.map((row) => ({
      ...offering,
      id: row.offeringId,
      purchaseLockedAt: null,
    })),
  });
  await store.db.session.createMany({
    data: rows.map((row) => ({
      ...session,
      id: randomUUID(),
      offeringId: row.offeringId,
    })),
  });
  await store.db.order.createMany({
    data: rows.map((row) => ({
      ...order,
      id: row.orderId,
      offeringId: row.offeringId,
      requestKey: row.orderId,
      policySnapshot: order.policySnapshot as Prisma.InputJsonValue,
      sessionsSnapshot: order.sessionsSnapshot as Prisma.InputJsonValue,
    })),
  });
  await store.db.payment.createMany({
    data: rows.map((row) => ({
      ...payment,
      id: randomUUID(),
      orderId: row.orderId,
      transactionId: row.orderId,
    })),
  });
  await store.db.enrollment.createMany({
    data: rows.map((row) => ({
      offeringId: row.offeringId,
      studentId: s.studentId,
      orderId: row.orderId,
    })),
  });
  expect(
    await scheduleOfferingCompletions(systemContext(store.db, finished)),
  ).toEqual({ scheduled: 100 });
  expect(
    await store.db.job.count({ where: { type: "complete_offering" } }),
  ).toBe(100);
  expect(
    await scheduleOfferingCompletions(systemContext(store.db, finished)),
  ).toEqual({ scheduled: 2 });
  expect(
    await store.db.job.count({ where: { type: "complete_offering" } }),
  ).toBe(102);
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  expect(
    await store.db.job.count({ where: { type: "complete_offering" } }),
  ).toBe(102);
});
it("defers payment work without consuming its retry budget while learning jobs progress", async () => {
  const payment = await store.db.job.create({
    data: {
      type: "reconcile",
      dedupeKey: `reconcile:${s.orderId}`,
      payloadJson: { orderId: s.orderId },
      runAt: started,
    },
  });
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  expect((await runJobs(systemContext(store.db, finished), 10)).processed).toBe(
    1,
  );
  expect(
    await store.db.job.findUnique({
      where: { id: payment.id },
      select: {
        status: true,
        attempts: true,
        lastError: true,
        claimToken: true,
      },
    }),
  ).toEqual({
    status: "pending",
    attempts: 0,
    lastError: null,
    claimToken: null,
  });
});
it("retains queued learning work without attempts while the learning feature is disabled", async () => {
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("E2E_TEST_MODE", "0");
  vi.stubEnv("LEARNING_ENABLED", "false");
  expect((await runJobs(systemContext(store.db, finished), 10)).processed).toBe(
    0,
  );
  expect(
    await store.db.job.findFirst({
      where: { type: "complete_offering" },
      select: { status: true, attempts: true, claimToken: true },
    }),
  ).toEqual({ status: "pending", attempts: 0, claimToken: null });
  expect(
    (
      await store.db.enrollment.findUniqueOrThrow({
        where: { id: s.enrollmentId },
      })
    ).status,
  ).toBe("active");
});
it("bounds completion batches and reaches paid learners beyond a hundred unverified enrollments", async () => {
  const templateOrder = await store.db.order.findUniqueOrThrow({
    where: { id: s.orderId },
  });
  const templatePayment = await store.db.payment.findUniqueOrThrow({
    where: { orderId: s.orderId },
  });
  const templateRight = await store.db.enrollmentSession.findFirstOrThrow({
    where: { enrollmentId: s.enrollmentId },
  });
  const rows = Array.from({ length: 206 }, (_, index) => ({
    studentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    orderId: randomUUID(),
    enrollmentId: randomUUID(),
    paid: index >= 101,
  }));
  await store.db.studentProfile.createMany({
    data: rows.map((row) => ({
      id: row.studentId,
      name: "completion fixture",
      grade: 5,
    })),
  });
  await store.db.guardianLink.createMany({
    data: rows.map((row) => ({
      studentId: row.studentId,
      guardianId: s.parent.userId,
      verifiedAt: started,
    })),
  });
  await store.db.order.createMany({
    data: rows.map((row) => ({
      ...templateOrder,
      id: row.orderId,
      studentId: row.studentId,
      requestKey: row.orderId,
      policySnapshot: templateOrder.policySnapshot as Prisma.InputJsonValue,
      sessionsSnapshot: templateOrder.sessionsSnapshot as Prisma.InputJsonValue,
    })),
  });
  await store.db.payment.createMany({
    data: rows.map((row) => ({
      ...templatePayment,
      id: randomUUID(),
      orderId: row.orderId,
      transactionId: row.orderId,
      verifiedAt: row.paid ? started : null,
    })),
  });
  await store.db.enrollment.createMany({
    data: rows.map((row) => ({
      id: row.enrollmentId,
      offeringId: s.offeringId,
      studentId: row.studentId,
      orderId: row.orderId,
    })),
  });
  await store.db.enrollmentSession.createMany({
    data: rows.map((row) => ({
      ...templateRight,
      id: randomUUID(),
      enrollmentId: row.enrollmentId,
      completedAt: null,
    })),
  });
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  await runJobs(systemContext(store.db, finished), 1);
  expect(
    await store.db.enrollment.count({
      where: { offeringId: s.offeringId, status: "completed" },
    }),
  ).toBe(100);
  expect(
    await store.db.job.findFirst({
      where: { type: "complete_offering" },
      select: { status: true, attempts: true },
    }),
  ).toEqual({ status: "pending", attempts: 0 });
  await runJobs(systemContext(store.db, finished), 1);
  expect(
    await store.db.enrollment.count({
      where: { offeringId: s.offeringId, status: "completed" },
    }),
  ).toBe(106);
  expect(
    await store.db.enrollment.count({
      where: { offeringId: s.offeringId, status: "active" },
    }),
  ).toBe(101);
  expect(
    await store.db.enrollmentSession.count({
      where: { completedAt: { not: null } },
    }),
  ).toBe(0);
});
it("uses claim fencing for concurrent completion workers and exposes only admin-safe retry controls", async () => {
  await scheduleOfferingCompletions(systemContext(store.db, finished));
  const results = await Promise.all([
    runJobs(systemContext(store.db, finished), 1),
    runJobs(systemContext(store.db, finished), 1),
  ]);
  expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1);
  const job = await store.db.job.findFirstOrThrow({
    where: { type: "complete_offering" },
  });
  await store.db.job.update({
    where: { id: job.id },
    data: { status: "failed", attempts: 5, lastError: "PROVIDER_UNAVAILABLE" },
  });
  expect(
    await retryJob(makeContext(store.db, s.owner, finished), job.id),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  const listed = await getPaymentExceptions(
    makeContext(store.db, s.admin, finished),
  );
  expect(
    listed.ok &&
      listed.value.items.some(
        (item) =>
          item.id === job.id &&
          item.kind === "complete_offering" &&
          item.canRetry,
      ),
  ).toBe(true);
  expect(
    (await retryJob(makeContext(store.db, s.admin, finished), job.id)).ok,
  ).toBe(true);
  await runJobs(systemContext(store.db, finished), 1);
  expect(
    (await store.db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
  ).toBe("succeeded");
});
