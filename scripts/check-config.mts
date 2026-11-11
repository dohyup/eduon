import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const required = [
  "APP_ORIGIN",
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
];
for (const key of required)
  console.log(`${key}: ${process.env[key] ? "설정됨" : "미설정"}`);
console.log(
  `인증 제공자: ${process.env.AUTH_PROVIDER === "supabase" ? "Supabase" : "설정 확인 필요"}`,
);
console.log(
  `초대 메일: ${process.env.RESEND_API_KEY && process.env.MAIL_FROM ? "설정됨" : "직접 전달 모드"}`,
);
console.log(
  `신규 가입: ${process.env.AUTH_ALLOW_SIGNUP === "true" && process.env.PRIVACY_POLICY_VERSION ? "활성화 구성" : "비활성화"}`,
);
console.log(
  `Zoom OAuth: ${process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET && process.env.ZOOM_TOKEN_ENCRYPTION_KEY ? "설정됨" : "미설정"}`,
);
console.log(
  `Zoom Webhook: ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN ? "설정됨" : "미설정"}`,
);
console.log(
  `Zoom 외부 회의 SDK 심사 승인: ${process.env.ZOOM_EXTERNAL_SDK_APPROVED === "true" && process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET ? "승인·활성화" : "외부 앱/브라우저 안전 입장 모드"}`,
);
if (required.some((key) => !process.env[key])) process.exitCode = 1;
