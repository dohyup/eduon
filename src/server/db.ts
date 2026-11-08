import "server-only";
import { createDatabase } from "./client";
const globalDb = globalThis as unknown as {
  eduonDb?: ReturnType<typeof createDatabase>;
};
export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNCONFIGURED");
  return (globalDb.eduonDb ??= createDatabase(process.env.DATABASE_URL));
}
