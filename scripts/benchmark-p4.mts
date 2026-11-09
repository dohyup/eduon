import EmbeddedPostgres from "embedded-postgres";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch, release } from "node:os";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createTestDatabase } from "../tests/support/database";
import { seedScenario } from "../tests/support/scenario";
import { makeContext } from "../tests/support/context";
import { searchOfferings } from "../src/modules/catalog/search";
import { listRoster } from "../src/modules/learning/views";

// Always creates its own loopback cluster. No dotenv or caller DB URL is read.
if (process.argv.length > 2) throw Error("BENCHMARK_ARGUMENTS_NOT_SUPPORTED");
const root = resolve(".tmp");
await mkdir(root, { recursive: true });
const dataDir = resolve(root, `pg-p4-benchmark-${randomUUID()}`);
if (!dataDir.startsWith(root + sep)) throw Error("UNSAFE_TEST_PATH");
const password = randomBytes(24).toString("hex");
const port = await new Promise<number>((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) =>
      error
        ? reject(error)
        : resolvePort(
            typeof address === "object" && address ? address.port : 0,
          ),
    );
  });
});
if (!port) throw Error("TEST_PORT_UNAVAILABLE");
const cluster = new EmbeddedPostgres({
  databaseDir: dataDir,
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
let traced: PrismaClient | undefined;
let sql: pg.Client | undefined;
try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase("eduon_test");
  const url = `postgresql://eduon_test:${password}@127.0.0.1:${port}/eduon_test`;
  Object.assign(process.env, {
    NODE_ENV: "test",
    TEST_DATABASE_URL: url,
    DATABASE_URL: url,
  });
  store = await createTestDatabase();
  process.env.DATABASE_URL = store.url;
  const db = store.db,
    now = new Date("2029-12-01T00:00:00Z");
  const s = await seedScenario(db, { capacity: 2000 });
  await db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
  const offeringIds = Array.from({ length: 999 }, () => randomUUID());
  await db.offering.createMany({
    data: offeringIds.map((id) => ({
      id,
      courseId: s.courseId,
      academyId: s.academyId,
      status: "published",
      priceWon: 100000,
      capacity: 20,
      enrollmentOpensAt: new Date("2029-01-01"),
      enrollmentClosesAt: new Date("2029-12-31"),
    })),
  });
  await db.session.createMany({
    data: offeringIds.map((offeringId) => ({
      offeringId,
      academyId: s.academyId,
      startsAt: new Date("2030-01-01T01:00:00Z"),
      endsAt: new Date("2030-01-01T02:00:00Z"),
    })),
  });
  // Synthetic bulk fixture only, never evidence of production sales or attendance.
  const students = Array.from({ length: 1000 }, (_, i) => ({
    id: randomUUID(),
    name: `Synthetic learner ${i}`,
    grade: 5,
  }));
  await db.studentProfile.createMany({ data: students });
  await db.guardianLink.createMany({
    data: students.map((student) => ({
      guardianId: s.parent.userId,
      studentId: student.id,
      verifiedAt: now,
    })),
  });
  const orders = students.map((student) => ({
    id: randomUUID(),
    studentId: student.id,
  }));
  await db.order.createMany({
    data: orders.map((row) => ({
      ...row,
      parentId: s.parent.userId,
      offeringId: s.offeringId,
      academyId: s.academyId,
      requestKey: row.id,
      status: "paid",
      amountWon: 100000,
      feeWon: 5000,
      policyVersion: "synthetic-benchmark-only",
      policySnapshot: { synthetic: true },
      sessionsSnapshot: [],
      consentedAt: now,
      expiresAt: new Date("2029-12-02"),
      createdAt: now,
    })),
  });
  await db.payment.createMany({
    data: orders.map((row) => ({
      orderId: row.id,
      transactionId: row.id,
      amountWon: 100000,
      provider: "fake",
      status: "paid",
      verifiedAt: now,
    })),
  });
  const enrollments = orders.map((row) => ({
    id: randomUUID(),
    offeringId: s.offeringId,
    studentId: row.studentId,
    orderId: row.id,
    status: "active",
  }));
  await db.enrollment.createMany({ data: enrollments });
  await db.enrollmentSession.createMany({
    data: enrollments.map((row) => ({
      enrollmentId: row.id,
      sessionId: s.sessionId,
      startsAt: new Date("2030-01-01T01:00:00Z"),
      endsAt: new Date("2030-01-01T02:00:00Z"),
      amountWon: 100000,
    })),
  });
  sql = new pg.Client({ connectionString: store.url });
  await sql.connect();
  await sql.query("ANALYZE");
  const searchInput = {
    subject: "math" as const,
    grade: 5,
    level: "beginner" as const,
    maxPriceWon: 150000,
  };
  const search = async () => {
    const result = await searchOfferings(searchInput, db, now);
    if (result.items.length !== 20 || !result.nextCursor)
      throw Error("SEARCH_PAGE_ASSERTION_FAILED");
  };
  const roster = async () => {
    const result = await listRoster(
      makeContext(db, s.teacher, now),
      s.offeringId,
    );
    if (
      !result.ok ||
      result.value.items.length !== 20 ||
      !result.value.nextCursor
    )
      throw Error("ROSTER_PAGE_ASSERTION_FAILED");
  };
  const warmups = 10,
    samples = 100;
  async function measure(fn: () => Promise<void>) {
    for (let i = 0; i < warmups; i++) await fn();
    const elapsed: number[] = [];
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await fn();
      elapsed.push(performance.now() - start);
    }
    const sorted = [...elapsed].sort((a, b) => a - b);
    return {
      samples,
      warmups,
      concurrency: 1,
      p50Ms: sorted[Math.ceil(samples * 0.5) - 1],
      p95Ms: sorted[Math.ceil(samples * 0.95) - 1],
      minMs: sorted[0],
      maxMs: sorted.at(-1),
      elapsedMs: elapsed,
    };
  }
  const searchMetrics = await measure(search),
    rosterMetrics = await measure(roster);
  const schema = new URL(store.url).searchParams.get("schema")!;
  const captured: { operation: string; query: string; params: string }[] = [];
  let operation = "search";
  traced = new PrismaClient({
    adapter: new PrismaPg({ connectionString: store.url, max: 5 }, { schema }),
    log: [{ emit: "event", level: "query" }],
  });
  traced.$on("query", (event) => {
    if (/^\s*SELECT\b/i.test(event.query))
      captured.push({ operation, query: event.query, params: event.params });
  });
  await searchOfferings(searchInput, traced, now);
  operation = "roster";
  await listRoster(makeContext(traced, s.teacher, now), s.offeringId);
  const explain = [];
  for (const query of captured) {
    const params = JSON.parse(query.params) as unknown[];
    const plan = await sql.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.query}`,
      params,
    );
    explain.push({
      operation: query.operation,
      sql: query.query,
      parameterCount: params.length,
      plan: plan.rows[0]["QUERY PLAN"],
    });
  }
  const version = (await sql.query("SELECT version() AS version")).rows[0]
    .version;
  const report = {
    scope: "local synthetic embedded PostgreSQL; not staging or HTTP/browser",
    createdAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      osRelease: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      postgres: version,
      prisma: "7.10.1",
    },
    dataset: {
      offerings: await db.offering.count(),
      rosterStudents: 1000,
      resultsPerPage: 20,
    },
    method: {
      warmups,
      samples,
      concurrency: 1,
      percentile: "nearest rank ceil(n * p)",
      timed:
        "production searchOfferings and listRoster services, original non-query-logging Prisma client, same-machine database, warm cache, no web rendering/network/provider latency",
    },
    search: searchMetrics,
    roster: rosterMetrics,
    explain,
  };
  const output = resolve("docs/operations/p4-benchmark-result.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ...report,
        search: { ...searchMetrics, elapsedMs: undefined },
        roster: { ...rosterMetrics, elapsedMs: undefined },
        explain: undefined,
        explainStatements: explain.length,
        artifact: output,
      },
      null,
      2,
    ),
  );
} finally {
  await traced?.$disconnect();
  await sql?.end();
  await store?.close();
  await cluster.stop();
}
