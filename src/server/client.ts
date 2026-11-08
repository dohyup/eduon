import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export function createDatabase(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: url,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        statement_timeout: 10000,
        query_timeout: 12000,
      },
      { schema: new URL(url).searchParams.get("schema") || "public" },
    ),
  });
}
