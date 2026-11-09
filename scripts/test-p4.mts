import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createTestDatabase } from "../tests/support/database";
import { seedLearningScenario, seedLearning } from "../tests/support/learning";
import { seedScenario } from "../tests/support/scenario";
import { completeOffering } from "../src/modules/learning/completion";
import { recordAttendance } from "../src/modules/learning/attendance";
import { makeContext } from "../tests/support/context";

const root = resolve(".tmp");
await mkdir(root, { recursive: true });
const path = resolve(root, "pg-p4-e2e-" + randomUUID());
if (!path.startsWith(root + sep)) throw Error("UNSAFE_TEST_PATH");
const password = randomBytes(24).toString("hex");
const port = await new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) =>
      error
        ? reject(error)
        : resolve(typeof address === "object" && address ? address.port : 0),
    );
  });
});
if (!port) throw Error("TEST_PORT_UNAVAILABLE");
const pg = new EmbeddedPostgres({
  databaseDir: path,
  user: "eduon_test",
  password,
  port,
  persistent: false,
  autoRehydrateSymlinks: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let store: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("eduon_test");
  Object.assign(process.env, {
    NODE_ENV: "test",
    TEST_DATABASE_URL: `postgresql://eduon_test:${password}@127.0.0.1:${port}/eduon_test`,
    LEARNING_ENABLED: "true",
    AUTH_PROVIDER: "test",
    E2E_TEST_MODE: "1",
    E2E_AUTH_SECRET: randomBytes(32).toString("hex"),
    PAYMENT_PROVIDER: "fake",
    PAYMENT_MODE: "test",
  });
  store = await createTestDatabase();
  process.env.DATABASE_URL = store.url;
  const now = new Date();
  const scenarios: Record<string, unknown> = {};
  for (const name of ["journey", "security", "layout", "revoked", "history"]) {
    const s = await seedLearningScenario(store.db, {
      capacity: 4,
      now: new Date(now.getTime() - 5 * 60000),
      startsAt: new Date(now.getTime() - 60000),
      endsAt: new Date(now.getTime() + 3600000),
    });
    scenarios[name] = s;
  }
  const completed = await seedLearningScenario(store.db, {
    capacity: 4,
    now: new Date(now.getTime() - 3 * 3600000),
    startsAt: new Date(now.getTime() - 2 * 3600000),
    endsAt: new Date(now.getTime() - 3600000),
  });
  // Completion fixture is driven by the actual service from the spec, after attendance.
  scenarios.completed = completed;
  const attendance = await recordAttendance(
    makeContext(store.db, completed.teacher, now),
    {
      sessionId: completed.sessionId,
      studentId: completed.studentId,
      status: "present",
      reason: "합성 완료 수업의 실제 서비스 출결 기록",
    },
  );
  if (!attendance.ok) throw Error(attendance.code);
  await completeOffering(
    { db: store.db, now: () => now, source: "job" },
    completed.offeringId,
  );
  const refund = await seedScenario(store.db, { capacity: 4 });
  await store.db.offering.update({
    where: { id: refund.offeringId },
    data: {
      enrollmentOpensAt: new Date(now.getTime() - 86400000),
      enrollmentClosesAt: new Date(now.getTime() + 30000),
    },
  });
  await store.db.session.update({
    where: { id: refund.sessionId },
    data: {
      startsAt: new Date(now.getTime() + 60000),
      endsAt: new Date(now.getTime() + 120000),
    },
  });
  const second = await store.db.session.create({
    data: {
      offeringId: refund.offeringId,
      academyId: refund.academyId,
      startsAt: new Date(now.getTime() + 300000),
      endsAt: new Date(now.getTime() + 360000),
    },
  });
  scenarios.refund = {
    ...(await seedLearning(store.db, refund, new Date(now.getTime() - 300000))),
    secondSessionId: second.id,
  };
  scenarios.authoring = await seedScenario(store.db, { capacity: 4 });
  const fixture = resolve(root, "p4-fixture-" + randomUUID() + ".json");
  await writeFile(fixture, JSON.stringify(scenarios));
  const env = {
    ...process.env,
    NODE_ENV: "development",
    DEMO_MODE: "false",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    RESEND_API_KEY: "",
    MAIL_FROM: "",
    PAYMENT_PROVIDER: "fake",
    PAYMENT_MODE: "test",
    VIDEO_PROVIDER: "fake",
    DAILY_API_KEY: "",
    DAILY_DOMAIN: "",
    STORAGE_PROVIDER: "fake",
    FILE_SCANNER: "fake",
    LEARNING_ENABLED: "true",
    JOBS_SECRET: randomBytes(32).toString("hex"),
    DATABASE_URL: store.url,
    APP_ORIGIN: "http://127.0.0.1:3103",
    P4_FIXTURE_PATH: fixture,
  };
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.p4.config.ts",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env, windowsHide: true },
  );
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
} finally {
  await store?.close();
  await pg.stop();
}
