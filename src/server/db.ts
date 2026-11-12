import "server-only";
import { createDatabase } from "./client";
import { createRuntimeDatabase } from "./runtime-db";
import { getRuntimeSettings } from "./runtime-settings";

const globalDb = globalThis as unknown as {
  eduonDb?: ReturnType<typeof createDatabase>;
  eduonDbUrl?: string;
};

export function getDatabase(): ReturnType<typeof createDatabase> {
  const url = process.env.DATABASE_URL || getRuntimeSettings().databaseUrl;
  if (url) {
    if (!globalDb.eduonDb || globalDb.eduonDbUrl !== url) {
      globalDb.eduonDb = createDatabase(url);
      globalDb.eduonDbUrl = url;
    }
    return globalDb.eduonDb;
  }
  return createRuntimeDatabase() as unknown as ReturnType<typeof createDatabase>;
}
