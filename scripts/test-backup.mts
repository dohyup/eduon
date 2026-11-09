import { access, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { delimiter, isAbsolute, join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { createTestDatabase } from "../tests/support/database";
import { seedLearningScenario, systemContext } from "../tests/support/learning";
import { makeContext } from "../tests/support/context";
import { recordAttendance } from "../src/modules/learning/attendance";
import { completeOffering } from "../src/modules/learning/completion";
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !args[0].startsWith("--pg-bin=")))
  throw Error("USAGE: --pg-bin=LOCAL_DIRECTORY");
const exists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};
const safeLocal = (path: string) =>
  isAbsolute(path) && !path.startsWith("\\\\") && !path.startsWith("//");
const executable = (name: string) =>
  process.platform === "win32" ? `${name}.exe` : name;
const embedded = resolve(
  "node_modules/@embedded-postgres",
  `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
  "native/bin",
);
const common: string[] = [];
if (process.platform === "win32") {
  const programFiles = "C:/Program Files/PostgreSQL";
  if (await exists(programFiles))
    for (const version of await readdir(programFiles, { withFileTypes: true }))
      if (version.isDirectory())
        common.push(join(programFiles, version.name, "bin"));
  common.push("C:/tools/postgresql/bin", "C:/tools/postgresql");
}
const explicit = args[0]?.slice("--pg-bin=".length);
if (explicit && !safeLocal(explicit))
  throw Error("LOCAL_BINARY_DIRECTORY_REQUIRED");
const candidates = [
  ...(explicit ? [explicit] : []),
  embedded,
  ...common,
  ...(process.env.PATH ?? "").split(delimiter),
].filter(safeLocal);
let pgBin: string | undefined;
for (const candidate of candidates) {
  if (
    (await exists(join(candidate, executable("pg_dump")))) &&
    (await exists(join(candidate, executable("pg_restore"))))
  ) {
    const actual = await realpath(candidate);
    if (safeLocal(actual)) {
      pgBin = actual;
      break;
    }
  }
}
const outDir = resolve("docs/operations");
await mkdir(outDir, { recursive: true });
const inventory = {
  createdAt: new Date().toISOString(),
  scope: "local synthetic only; no dotenv or caller database URL",
  embedded: {
    directory: embedded,
    pgDump: await exists(join(embedded, executable("pg_dump"))),
    pgRestore: await exists(join(embedded, executable("pg_restore"))),
  },
  commonLocations: {
    programFilesPostgresql: await exists("C:/Program Files/PostgreSQL"),
    toolsPostgresql: await exists("C:/tools/postgresql"),
  },
  matchingToolDirectoryFound: !!pgBin,
};
if (!pgBin) {
  const report = {
    status: "BLOCKED",
    reason:
      "Matching local pg_dump and pg_restore executables are unavailable. Embedded bundle has initdb/pg_ctl/postgres only; PATH and scoped common locations checked. No restore drill executed.",
    ...inventory,
  };
  await writeFile(
    join(outDir, "p4-restore-result.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
} else {
  const root = resolve(".tmp");
  await mkdir(root, { recursive: true });
  const dataDir = resolve(root, `pg-p4-restore-${randomUUID()}`);
  if (!dataDir.startsWith(root + sep)) throw Error("UNSAFE_TEST_PATH");
  const password = randomBytes(24).toString("hex");
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close((error) =>
        error
          ? reject(error)
          : resolvePort(typeof addr === "object" && addr ? addr.port : 0),
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
  let store: Awaited<ReturnType<typeof createTestDatabase>> | undefined,
    source: pg.Client | undefined,
    target: pg.Client | undefined;
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv))
    if (key.toUpperCase().startsWith("PG")) delete childEnv[key];
  const tool = async (
    name: "pg_dump" | "pg_restore",
    params: string[],
    database = "eduon_test",
  ) =>
    new Promise<string>((done, reject) => {
      const child = spawn(
        join(pgBin!, executable(name)),
        params.includes("--version")
          ? params
          : [
              "--host=127.0.0.1",
              `--port=${port}`,
              "--username=eduon_test",
              `--dbname=${database}`,
              ...params,
            ],
        {
          windowsHide: true,
          env: {
            ...childEnv,
            PGHOST: "127.0.0.1",
            PGPORT: String(port),
            PGUSER: "eduon_test",
            PGPASSWORD: password,
            PGDATABASE: database,
            PGCONNECT_TIMEOUT: "5",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (data) => (output += String(data)));
      child.stderr.on("data", () => {});
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? done(output.trim())
          : reject(Error(`${name.toUpperCase()}_FAILED_${code}`)),
      );
    });
  try {
    const dumpVersion = await tool("pg_dump", ["--version"]),
      restoreVersion = await tool("pg_restore", ["--version"]);
    if (!/\b17\./.test(dumpVersion) || !/\b17\./.test(restoreVersion))
      throw Error("POSTGRES_17_TOOLS_REQUIRED");
    await cluster.initialise();
    await cluster.start();
    await cluster.createDatabase("eduon_test");
    await cluster.createDatabase("eduon_restore_test");
    const base = `postgresql://eduon_test:${password}@127.0.0.1:${port}/`;
    Object.assign(process.env, {
      NODE_ENV: "test",
      TEST_DATABASE_URL: base + "eduon_test",
      DATABASE_URL: base + "eduon_test",
    });
    store = await createTestDatabase();
    const s = await seedLearningScenario(store.db);
    const now = new Date("2030-01-01T02:11:00Z");
    const attendance = await recordAttendance(
      makeContext(store.db, s.teacher, now),
      {
        sessionId: s.sessionId,
        studentId: s.studentId,
        status: "present",
        reason: "Synthetic restore drill",
      },
    );
    if (!attendance.ok) throw Error(attendance.code);
    await completeOffering(systemContext(store.db, now), s.offeringId);
    const schema = new URL(store.url).searchParams.get("schema")!;
    if (!/^test_[0-9a-f]+$/.test(schema))
      throw Error("ISOLATED_SCHEMA_REQUIRED");
    source = new pg.Client({ connectionString: base + "eduon_test" });
    target = new pg.Client({ connectionString: base + "eduon_restore_test" });
    await source.connect();
    await target.connect();
    const dump = resolve(root, `p4-synthetic-${randomUUID()}.dump`);
    if (!dump.startsWith(root + sep)) throw Error("UNSAFE_DUMP_PATH");
    const started = Date.now();
    await tool("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--schema=${schema}`,
      `--file=${dump}`,
    ]);
    await tool(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "--dbname=eduon_restore_test",
        dump,
      ],
      "eduon_restore_test",
    );
    const tables = (
      await source.query(
        "SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",
        [schema],
      )
    ).rows.map((row) => row.tablename as string);
    const verified = [];
    for (const table of tables) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table))
        throw Error("UNSAFE_TABLE_NAME");
      const query = `SELECT row_to_json(t)::text AS row FROM "${schema}"."${table}" t ORDER BY row_to_json(t)::text`;
      const before = await source.query(query),
        after = await target.query(query);
      const digest = (rows: unknown[]) =>
        createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      if (digest(before.rows) !== digest(after.rows))
        throw Error("RESTORE_DATA_MISMATCH");
      verified.push({
        table,
        rows: before.rowCount,
        sha256: digest(after.rows),
      });
    }
    const security =
      "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname";
    if (
      JSON.stringify((await source.query(security, [schema])).rows) !==
      JSON.stringify((await target.query(security, [schema])).rows)
    )
      throw Error("RESTORE_RLS_MISMATCH");
    const triggerQuery =
      "SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname";
    if (
      JSON.stringify((await source.query(triggerQuery, [schema])).rows) !==
      JSON.stringify((await target.query(triggerQuery, [schema])).rows)
    )
      throw Error("RESTORE_TRIGGER_MISMATCH");
    let appendOnly = false;
    try {
      await target.query(
        `UPDATE "${schema}"."SettlementEntry" SET "amountWon"="amountWon"+1`,
      );
    } catch (error) {
      appendOnly = (error as { code?: string }).code === "23514";
    }
    if (!appendOnly) throw Error("RESTORE_APPEND_ONLY_NOT_ENFORCED");
    const report = {
      status: "PASSED",
      ...inventory,
      dumpVersion,
      restoreVersion,
      durationMs: Date.now() - started,
      verified,
      checks: {
        allTableCountsAndRowDigests: true,
        rlsFlags: true,
        triggerNames: true,
        settlementAppendOnly: true,
      },
      limitations:
        "Synthetic local custom-format schema dump only. Not Supabase backup/PITR, provider storage/media, global roles, production restore or RTO/RPO proof.",
    };
    await writeFile(
      join(outDir, "p4-restore-result.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await source?.end();
    await target?.end();
    await store?.close();
    await cluster.stop();
  }
}
