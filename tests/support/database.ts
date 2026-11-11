import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
    for (const migration of [
      "prisma/migrations/0001_identity_catalog/migration.sql",
      "prisma/migrations/0002_zoom_integration/migration.sql",
    ]) {
      const sql = await readFile(migration, "utf8");
      await client.query(sql.replaceAll('"public".', `"${schema}".`));
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
    url:scoped.toString(),
    async close() {
      await db.$disconnect();
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    },
  };
}
