import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createTestDatabase } from "../tests/support/database";
import { seedScenario } from "../tests/support/scenario";
const root = resolve(".tmp");
await mkdir(root, { recursive: true });
const path = resolve(root, "pg-e2e-" + randomUUID());
if (!path.startsWith(root + sep)) throw new Error("UNSAFE_TEST_PATH");
const password = randomBytes(20).toString("hex");
const pg = new EmbeddedPostgres({
  databaseDir: path,
  user: "eduon_test",
  password,
  port: 55433,
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
  process.env.NODE_ENV = "test";
  process.env.TEST_DATABASE_URL = `postgresql://eduon_test:${password}@127.0.0.1:55433/eduon_test`;
  store = await createTestDatabase();
  const s = await seedScenario(store.db);
  // E2E public search must be open at the real execution date.
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: {
      status: "published",
      enrollmentOpensAt: new Date("2020-01-01"),
      enrollmentClosesAt: new Date("2040-01-01"),
    },
  });
  const user = await store.db.user.findUniqueOrThrow({
    where: { id: s.student.userId },
  });
  const fixture = resolve(root, "p2-fixture-" + randomUUID() + ".json");
  await writeFile(fixture, JSON.stringify({ ...s, studentEmail: user.email }));
  const env = {
    ...process.env,
    NODE_ENV: "development",
    DEMO_MODE: "false",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    RESEND_API_KEY: "",
    MAIL_FROM: "",
    AUTH_PROVIDER: "test",
    E2E_TEST_MODE: "1",
    E2E_AUTH_SECRET: randomBytes(32).toString("hex"),
    DATABASE_URL: store.url,
    APP_ORIGIN: "http://127.0.0.1:3101",
    P2_FIXTURE_PATH: fixture,
  };
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.p2.config.ts",
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
