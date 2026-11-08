import type { PrismaClient } from "@/generated/prisma/client";
export type Actor = { userId: string };
export type ServiceContext = {
  actor: Actor;
  db: PrismaClient;
  now: () => Date;
};
