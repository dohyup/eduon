import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { createServer } from "node:net";
import pg from "pg";
const args = process.argv.slice(2);
let cluster;
const env = { ...process.env, NODE_ENV: "test" };
try {
  if (!env.TEST_DATABASE_URL) {
    const root = resolve(".tmp");
    const dataDir = resolve(root, "pg-" + randomUUID());
    if (!dataDir.startsWith(root + sep)) throw new Error("UNSAFE_TEST_PATH");
    const password = randomBytes(20).toString("hex");
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close((error) =>
          error ? reject(error) : resolve(address.port),
        );
      });
    });
    cluster = new EmbeddedPostgres({
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
    await cluster.initialise();
    await cluster.start();
    await cluster.createDatabase("eduon_test");
    env.TEST_DATABASE_URL = `postgresql://eduon_test:${password}@127.0.0.1:${port}/eduon_test`;
  }
  if (!new URL(env.TEST_DATABASE_URL).pathname.endsWith("/eduon_test"))
    throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  if (args.includes("--migration-only")) {
    const schema = "test_migration_" + randomUUID().replaceAll("-", "");
    const url = new URL(env.TEST_DATABASE_URL);
    url.searchParams.set("schema", schema);
    const client = new pg.Client({ connectionString: env.TEST_DATABASE_URL });
    await client.connect();
    try {
      const child = spawn(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        {
          stdio: "inherit",
          env: {
            ...env,
            DATABASE_URL: url.toString(),
            MIGRATION_DATABASE_URL: url.toString(),
          },
          windowsHide: true,
        },
      );
      process.exitCode = await new Promise((resolve, reject) => {
        child.on("exit", (c) => resolve(c ?? 1));
        child.on("error", reject);
      });
      if (!process.exitCode) {
        const result = await client.query(
          `SELECT count(*) FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL`,
        );
        const migrations = (
          await readdir("prisma/migrations", { withFileTypes: true })
        ).filter(
          (entry) => entry.isDirectory() && /^\d+_[a-z0-9_]+$/.test(entry.name),
        );
        if (Number(result.rows[0].count) !== migrations.length)
          throw new Error("MIGRATION_NOT_APPLIED");
        console.log("Isolated Prisma migration verified");
      }
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  } else {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...args,
      ],
      { stdio: "inherit", env, windowsHide: true },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      child.on("exit", (code) => resolve(code ?? 1));
      child.on("error", reject);
    });
  }
} finally {
  if (cluster) await cluster.stop();
}
