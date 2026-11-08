import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { z } from "zod";
loadEnvConfig(process.cwd());
const email = z.email().parse(process.argv[2]).toLowerCase();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const { createDatabase } = await import("../src/server/client");
const db = createDatabase(process.env.DATABASE_URL);
try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user)
    throw new Error(
      "먼저 해당 계정으로 Supabase 로그인과 EDUON API 계정 동기화를 완료하세요.",
    );
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { platformAdmin: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "operator.bootstrap",
        targetId: user.id,
        reason: "로컬 CLI에서 최초 운영자 지정",
      },
    });
  });
  console.log(
    "운영자 지정 완료. 계정 정보와 연결 문자열은 출력하지 않았습니다.",
  );
} finally {
  await db.$disconnect();
}
