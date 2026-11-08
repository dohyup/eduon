import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.MIGRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://unused:unused@127.0.0.1:5432/eduon_unconfigured",
  },
});
