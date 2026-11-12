import { getRuntimeSettings } from "./runtime-settings";

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
  return !isDemoMode();
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  return new URL(value).origin;
}
export function isZoomMockEnabled() {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.ZOOM_MOCK_MODE === "1" ||
    isTestAuthEnabled()
  ) {
    return true;
  }
  const settings = getRuntimeSettings();
  return settings.zoomMode === "simulation";
}
export function zoomOAuthConfigured() {
  const settings = getRuntimeSettings();
  return (
    isZoomMockEnabled() ||
    Boolean(settings.zoomClientId && settings.zoomClientSecret)
  );
}
export function zoomRedirectUri() {
  const settings = getRuntimeSettings();
  return (
    settings.zoomRedirectUri ||
    process.env.ZOOM_REDIRECT_URI ||
    `${appOrigin()}/api/zoom/oauth/callback`
  );
}
export function zoomWebhookSecret() {
  if (process.env.ZOOM_WEBHOOK_SECRET) return process.env.ZOOM_WEBHOOK_SECRET;
  if (process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
    return process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const settings = getRuntimeSettings();
  if (settings.zoomWebhookSecret) return settings.zoomWebhookSecret;
  return "eduon-test-zoom-webhook-secret-token";
}
export function zoomSdkConfigured() {
  const settings = getRuntimeSettings();
  return Boolean(
    (process.env.ZOOM_SDK_KEY || settings.zoomSdkKey) &&
      (process.env.ZOOM_SDK_SECRET || settings.zoomSdkSecret),
  );
}
export function zoomExternalSdkApproved() {
  const settings = getRuntimeSettings();
  return settings.zoomExternalSdkApproved && zoomSdkConfigured();
}
export function zoomApiBaseUrl() {
  return (process.env.ZOOM_API_BASE_URL || "https://api.zoom.us/v2").replace(
    /\/+$/,
    "",
  );
}
export function zoomOAuthBaseUrl() {
  return (process.env.ZOOM_OAUTH_BASE_URL || "https://zoom.us/oauth").replace(
    /\/+$/,
    "",
  );
}
export function configuredAdminEmails(): string[] {
  const hasExplicitEnv =
    process.env.ADMIN_EMAILS !== undefined ||
    process.env.SUPABASE_ADMIN_EMAILS !== undefined;
  const raw = hasExplicitEnv
    ? process.env.ADMIN_EMAILS || process.env.SUPABASE_ADMIN_EMAILS || ""
    : getRuntimeSettings().adminEmails;
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return configuredAdminEmails().includes(email.trim().toLowerCase());
}
