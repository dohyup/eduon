import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { z } from "zod";
loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const isRevoke = args[0] === "--revoke";
const targetArg1 = isRevoke ? args[1] : args[0];
const targetArg2 = isRevoke ? undefined : args[1];

if (!targetArg1) {
  throw new Error(
    "사용법:\n" +
      "  1) 관리자 지정: npm run admin:bootstrap -- admin@example.com\n" +
      "  2) 관리자 이메일 변경(교체): npm run admin:bootstrap -- old@example.com new@example.com\n" +
      "  3) 관리자 해제: npm run admin:bootstrap -- --revoke old@example.com",
  );
}

const email1 = z.email().parse(targetArg1).toLowerCase();
const email2 = targetArg2 ? z.email().parse(targetArg2).toLowerCase() : null;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const { createDatabase } = await import("../src/server/client");
const db = createDatabase(process.env.DATABASE_URL);

try {
  if (isRevoke) {
    const user = await db.user.findUnique({ where: { email: email1 } });
    if (!user) throw new Error(`해당 이메일 계정을 찾을 수 없습니다: ${email1}`);
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { platformAdmin: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "operator.revoked",
          targetId: user.id,
          reason: "로컬 CLI에서 운영자 권한 해제",
        },
      });
    });
    console.log("운영자 권한 해제 완료.");
  } else if (email2) {
    // 기존 관리자(email1)에서 새 관리자(email2)로 변경
    const [oldUser, newUser] = await Promise.all([
      db.user.findUnique({ where: { email: email1 } }),
      db.user.findUnique({ where: { email: email2 } }),
    ]);
    if (!oldUser)
      throw new Error(`기존 관리자 계정을 찾을 수 없습니다: ${email1}`);
    if (!newUser)
      throw new Error(
        `새 관리자 계정을 찾을 수 없습니다(${email2}). 먼저 해당 이메일로 Supabase 로그인을 1회 완료하거나 ADMIN_EMAILS 환경변수를 설정하세요.`,
      );
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: oldUser.id },
        data: { platformAdmin: false },
      });
      await tx.user.update({
        where: { id: newUser.id },
        data: { platformAdmin: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: newUser.id,
          action: "operator.replaced",
          targetId: newUser.id,
          reason: "로컬 CLI에서 운영자 이메일 계정 교체",
        },
      });
    });
    console.log("운영자 이메일 변경(교체) 완료.");
  } else {
    const user = await db.user.findUnique({ where: { email: email1 } });
    if (!user)
      throw new Error(
        "먼저 해당 계정으로 Supabase 로그인과 EDUON API 계정 동기화를 완료하거나, .env의 ADMIN_EMAILS에 이메일을 등록하세요.",
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
  }
} finally {
  await db.$disconnect();
}
