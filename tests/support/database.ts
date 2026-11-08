import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { createDatabase } from "../../src/server/client";
export async function createTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== "test" ||
    !url ||
    !new URL(url).pathname.endsWith("/eduon_test")
  )
    throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const schema = "test_" + randomUUID().replaceAll("-", "");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const migrations = (
      await readdir("prisma/migrations", { withFileTypes: true })
    )
      .filter(
        (entry) => entry.isDirectory() && /^\d+_[a-z0-9_]+$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      const sql = await readFile(
        `prisma/migrations/${migration}/migration.sql`,
        "utf8",
      );
      // Never create or mutate public while testing. All unqualified DDL uses
      // this connection's isolated search_path; qualified objects are rewritten.
      await client.query(
        sql
          .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, "")
          .replaceAll('"public".', `"${schema}".`),
      );
    }
  } catch (e) {
    await client.end();
    throw e;
  }
  const scoped = new URL(url);
  scoped.searchParams.set("schema", schema);
  const db = createDatabase(scoped.toString());
  return {
    db,
    url: scoped.toString(),
    async close() {
      await db.$disconnect();
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    },
  };
}
