import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { ensure } from "./errors";
export async function rateLimit(
  db: PrismaClient,
  key: string,
  limit: number,
  now = new Date(),
  windowMs = 60000,
) {
  const bucket = Math.floor(now.getTime() / windowMs);
  const hashed = createHash("sha256").update(key).digest("hex");
  const row = await db.rateLimit.upsert({
    where: { key: `${hashed}:${bucket}` },
    create: {
      key: `${hashed}:${bucket}`,
      hits: 1,
      expiresAt: new Date((bucket + 1) * windowMs),
    },
    update: { hits: { increment: 1 } },
  });
  ensure(row.hits <= limit, "RATE_LIMITED");
}
