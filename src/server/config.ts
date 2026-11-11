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
export function isZoomMockEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "test" ||
      process.env.ZOOM_MOCK_MODE === "1" ||
      isTestAuthEnabled())
  );
}
export function zoomOAuthConfigured() {
  return (
    isZoomMockEnabled() ||
    Boolean(
      process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET &&
        process.env.ZOOM_TOKEN_ENCRYPTION_KEY,
    )
  );
}
export function zoomRedirectUri() {
  return (
    process.env.ZOOM_REDIRECT_URI || `${appOrigin()}/api/zoom/oauth/callback`
  );
}
export function zoomWebhookSecret() {
  if (process.env.ZOOM_WEBHOOK_SECRET) return process.env.ZOOM_WEBHOOK_SECRET;
  if (process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
    return process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (process.env.NODE_ENV !== "production")
    return "eduon-test-zoom-webhook-secret-token";
  return "";
}
export function zoomSdkConfigured() {
  return Boolean(process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET);
}
export function zoomExternalSdkApproved() {
  return process.env.ZOOM_EXTERNAL_SDK_APPROVED === "true" && zoomSdkConfigured();
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
