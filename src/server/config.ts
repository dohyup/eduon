export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}
export function isTestAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TEST_MODE === "1" &&
    process.env.AUTH_PROVIDER === "test" &&
    (process.env.E2E_AUTH_SECRET?.length || 0) >= 32
  );
}
export function authConfigured() {
  return (
    !!process.env.DATABASE_URL &&
    (isTestAuthEnabled() ||
      !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY))
  );
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  return new URL(value).origin;
}
