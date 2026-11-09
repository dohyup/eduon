import "server-only";
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { createDatabase } from "../src/server/client";
import {
  createOffering,
  publishOffering,
} from "../src/modules/catalog/authoring";
import { searchOfferings } from "../src/modules/catalog/search";

// An explicit live-DB diagnostic. All synthetic writes MUST roll back together.
const args = process.argv.slice(2);
const email = args.find((arg) => arg.startsWith("--actor-email="))?.slice(14);
if (!email || !args.includes("--allow-rollback-fixtures") || args.length !== 2)
  throw Error("USE: --allow-rollback-fixtures --actor-email=EXISTING_ACCOUNT");
config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL;
const ref = new URL(
  process.env.SUPABASE_URL || "https://unconfigured.invalid",
).hostname.split(".")[0];
const target = new URL(url || "https://unconfigured.invalid");
if (
  !url ||
  process.env.AUTH_PROVIDER !== "supabase" ||
  process.env.DEMO_MODE === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.E2E_TEST_MODE === "1" ||
  !(
    target.hostname === `db.${ref}.supabase.co` ||
    (target.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(target.username).endsWith(`.${ref}`))
  ) ||
  target.searchParams.get("sslmode") !== "verify-full"
)
  throw Error("REAL_PROJECT_AND_VERIFIED_TLS_REQUIRED");

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
const db = createDatabase(url);
const rollback = new Error("EXPECTED_VERIFICATION_ROLLBACK");
const subjects = [
  "programming",
  "ai_usage",
  "ai_certificate",
  "ai_agent",
] as const;
const cases: {
  subject: string;
  grade: number;
  created: boolean;
  published: boolean;
  searchFound: boolean;
  schoolGradeExcluded: boolean;
}[] = [];
let stage = "connect";
const assert = (condition: unknown) => {
  if (!condition) throw Error("VERIFICATION_ASSERTION_FAILED");
};
async function snapshot() {
  const tables = (
    await client.query(
      "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows as { tablename: string; rowsecurity: boolean }[];
  const hashes: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const table of tables) {
    assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.tablename));
    const name = `public."${table.tablename}"`;
    counts[table.tablename] = Number(
      (await client.query(`SELECT count(*) FROM ${name}`)).rows[0].count,
    );
    assert(counts[table.tablename] <= 10000);
    const rows = (
      await client.query(
        `SELECT to_jsonb(t) AS value FROM ${name} AS t ORDER BY to_jsonb(t)::text`,
      )
    ).rows;
    hashes[table.tablename] = createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex");
  }
  return { tables, hashes, counts };
}
try {
  await client.connect();
  const stream = client.connection.stream as unknown as {
    encrypted?: boolean;
    authorized?: boolean;
  };
  assert(stream.encrypted && stream.authorized);
  stage = "migration-history";
  const migrations = (
    await client.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name",
    )
  ).rows;
  assert(migrations.length === 4);
  for (const row of migrations) {
    assert(row.finished_at && !row.rolled_back_at);
    assert(/^000[1-4]_[a-z_]+$/.test(row.migration_name));
    const sql = await readFile(
      `prisma/migrations/${row.migration_name}/migration.sql`,
    );
    assert(row.checksum === createHash("sha256").update(sql).digest("hex"));
  }
  const before = await snapshot();
  assert(before.tables.every((table) => table.rowsecurity));
  const actor = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, disabledAt: true },
  });
  assert(actor && !actor.disabledAt);
  const now = new Date();
  stage = "create-publish-search";
  let unauthorizedRejected = false;
  let generalProfileStored = false;
  try {
    await db.$transaction(
      async (tx) => {
        // No permanent review/role override: fixture approval and membership exist
        // only inside this uncommitted transaction. Existing users are not edited.
        const academy = await tx.academy.create({
          data: {
            name: `[합성 검증·등록 불가] ${randomUUID().slice(0, 8)}`,
            region: "온라인 검증 전용",
            status: "approved",
            memberships: { create: { userId: actor!.id, role: "owner" } },
          },
        });
        const facade = new Proxy(tx, {
          get(target, key, receiver) {
            // Reuse the outer atomic transaction for service transaction callbacks.
            if (key === "$transaction")
              return (
                fn: (scope: Prisma.TransactionClient) => Promise<unknown>,
              ) => fn(tx);
            return Reflect.get(target, key, receiver);
          },
        }) as unknown as PrismaClient;
        const ctx = {
          db: facade,
          actor: { userId: actor!.id },
          now: () => now,
        };
        for (const [index, subject] of subjects.entries()) {
          const startsAt = new Date(now.getTime() + (7 + index) * 86400000);
          const input = {
            academyId: academy.id,
            title: `[합성 검증·등록 불가] ${subject} 일반인`,
            subject,
            gradeMin: 13,
            gradeMax: 13,
            level: "beginner" as const,
            priceWon: 100000,
            capacity: 4,
            instructorIds: [actor!.id],
            enrollmentOpensAt: new Date(now.getTime() - 60000).toISOString(),
            enrollmentClosesAt: new Date(
              startsAt.getTime() - 86400000,
            ).toISOString(),
            sessions: [
              {
                startsAt: startsAt.toISOString(),
                endsAt: new Date(startsAt.getTime() + 3000000).toISOString(),
              },
            ],
          };
          const created = await createOffering(ctx, input);
          assert(created.ok);
          if (!created.ok) throw Error("CREATE_FAILED");
          const published = await publishOffering(
            ctx,
            created.value.offeringId,
          );
          assert(published.ok);
          const result = await searchOfferings(
            { subject, grade: 13 },
            facade,
            now,
          );
          const found = result.items.find(
            (item) => item.id === created.value.offeringId,
          );
          assert(
            found?.subject === subject &&
              found.gradeMin === 13 &&
              found.gradeMax === 13,
          );
          const school = await searchOfferings(
            { subject, grade: 12 },
            facade,
            now,
          );
          assert(
            !school.items.some((item) => item.id === created.value.offeringId),
          );
          cases.push({
            subject,
            grade: 13,
            created: true,
            published: true,
            searchFound: true,
            schoolGradeExcluded: true,
          });
          if (index === 0) {
            const unrelated = await tx.academy.create({
              data: {
                name: "[합성 검증·등록 불가] 권한 검사",
                region: "검증",
                status: "approved",
              },
            });
            const denied = await createOffering(ctx, {
              ...input,
              academyId: unrelated.id,
            });
            assert(!denied.ok && denied.code === "FORBIDDEN");
            unauthorizedRejected = true;
          }
        }
        const learner = await tx.studentProfile.create({
          data: { name: "[합성 검증] 일반인", grade: 13 },
        });
        assert(learner.grade === 13);
        generalProfileStored = true;
        throw rollback;
      },
      { maxWait: 10000, timeout: 60000 },
    );
    throw Error("ROLLBACK_WAS_NOT_EXECUTED");
  } catch (error) {
    if (error !== rollback) throw error;
  }
  stage = "rollback-and-preservation";
  const after = await snapshot();
  assert(JSON.stringify(before.hashes) === JSON.stringify(after.hashes));
  // Compare all application records with the pre-migration snapshot as well.
  const preflight = JSON.parse(
    await readFile(".tmp/supabase-catalog/preflight.json", "utf8"),
  );
  for (const [table, hash] of Object.entries(preflight.digests))
    if (table !== "_prisma_migrations") assert(after.hashes[table] === hash);
  stage = "data-api-denial";
  const roleChecks: Record<string, number> = {};
  for (const role of ["anon", "authenticated"]) {
    await client.query("BEGIN READ ONLY");
    try {
      await client.query(`SET LOCAL ROLE ${role}`);
      roleChecks[role] = Number(
        (await client.query('SELECT count(*) FROM public."User"')).rows[0]
          .count,
      );
      assert(roleChecks[role] === 0);
    } finally {
      await client.query("ROLLBACK");
    }
  }
  const report = {
    status: "PASSED",
    createdAt: new Date().toISOString(),
    sourceCommit: "54383b9",
    scope:
      "Real Supabase PostgreSQL and application services; synthetic writes in one rolled-back transaction. Not an authenticated HTTP/UI test.",
    verifiedClientTls: true,
    migrations: migrations.map((row) => ({
      name: row.migration_name,
      checksumMatches: true,
      finishedAt: row.finished_at,
    })),
    allPublicTablesRls: true,
    publicTableCount: after.tables.length,
    cases,
    unauthorizedRejected,
    generalProfileStored,
    allSyntheticWritesRolledBack: true,
    existingApplicationRowsPreserved: true,
    unchangedUserPermissions: true,
    dataApiUserVisibleRows: roleChecks,
    postVerificationCounts: after.counts,
    realPaymentOrVideoCalls: false,
    providerFlagsChanged: false,
  };
  await writeFile(
    "docs/operations/supabase-catalog-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch {
  console.error(
    JSON.stringify({
      status: "FAILED",
      stage,
      message: "Diagnostic failed; connection values and user data omitted.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  await client.end();
}
