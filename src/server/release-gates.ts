export type ReleaseCheck = {
  id: string;
  status: "ready" | "blocked" | "unverified";
  message: string;
};
export function releaseConfiguration(
  env: Record<string, string | undefined>,
  providers: {
    payments: boolean;
    video: boolean;
    storage: boolean;
    scanner: boolean;
  },
) {
  const checks: ReleaseCheck[] = [];
  const add = (id: string, ready: boolean, message: string) =>
    checks.push({ id, status: ready ? "ready" : "blocked", message });
  let origin = false,
    tls = false,
    db = false;
  try {
    const u = new URL(env.APP_ORIGIN || "");
    origin =
      u.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
      !u.username &&
      !u.password;
  } catch {}
  try {
    const u = new URL(env.DATABASE_URL || "");
    db = ["postgres:", "postgresql:"].includes(u.protocol);
    tls =
      u.searchParams.get("sslmode") === "verify-full" &&
      !!u.searchParams.get("sslrootcert");
  } catch {}
  add("origin", origin, "운영 HTTPS origin 설정");
  add("database", db && tls, "DB 연결과 인증서 검증 TLS 구성");
  add(
    "real-auth",
    env.AUTH_PROVIDER === "supabase" &&
      !!env.SUPABASE_URL &&
      !!env.SUPABASE_PUBLISHABLE_KEY &&
      !env.E2E_TEST_MODE &&
      !env.E2E_AUTH_SECRET,
    "실제 인증 설정과 테스트 인증 제거",
  );
  add(
    "no-demo",
    env.DEMO_MODE !== "true" &&
      env.PAYMENT_PROVIDER !== "fake" &&
      env.VIDEO_PROVIDER !== "fake" &&
      env.STORAGE_PROVIDER !== "fake",
    "데모·가짜 제공자 비활성",
  );
  add(
    "payments",
    providers.payments && env.PAYMENT_MODE === "live",
    "계약·정책이 확정된 실제 결제 어댑터",
  );
  add("video", providers.video, "선택한 화상 제공자 구성");
  add(
    "private-storage",
    providers.storage && providers.scanner,
    "비공개 저장소와 실제 파일 검사기",
  );
  add(
    "learning",
    env.LEARNING_ENABLED === "true",
    "학습 스키마와 기능 활성화 구성",
  );
  add(
    "policies",
    [
      "PRIVACY_POLICY_VERSION",
      "RETENTION_POLICY_VERSION",
      "SELLER_POLICY_VERSION",
      "REFUND_POLICY_VERSION",
      "CONSENT_POLICY_VERSION",
    ].every((k) => !!env[k]),
    "개인정보·보관·판매·환불·동의 정책 버전",
  );
  add(
    "scheduler",
    (env.JOBS_SECRET?.length || 0) >= 32,
    "서명 스케줄러 비밀 설정",
  );
  checks.push({
    id: "staging-evidence",
    status: "unverified",
    message:
      "실제 공급자 계약 테스트·백업 복구·배포·경보와 운영 정책 검토 증거 필요",
  });
  return { canRelease: false as const, checks };
}
export function enforceDeployment(
  env: Record<string, string | undefined>,
  providers: {
    payments: boolean;
    video: boolean;
    storage: boolean;
    scanner: boolean;
  },
) {
  if (env.EDUON_DEPLOYMENT !== "production") return;
  const result = releaseConfiguration(env, providers);
  if (!result.canRelease) throw new Error("RELEASE_GATES_NOT_MET");
}
