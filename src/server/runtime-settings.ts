import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimePlatformSettings {
  zoomMode: "simulation" | "live";
  zoomAccountId: string;
  zoomClientId: string;
  zoomClientSecret: string;
  zoomRedirectUri: string;
  zoomWebhookSecret: string;
  adminEmails: string;
  databaseUrl: string;
  updatedAt: string;
  updatedByEmail?: string;
}

const DEFAULT_SETTINGS: RuntimePlatformSettings = {
  zoomMode: "simulation",
  zoomAccountId: "",
  zoomClientId: "",
  zoomClientSecret: "",
  zoomRedirectUri: "https://www.eduonlink.com/api/zoom/oauth/callback",
  zoomWebhookSecret: "eduon-zoom-webhook-secret-token-2026",
  adminEmails: "admin@eduon.kr,darkpon@naver.com",
  databaseUrl: "",
  updatedAt: new Date(0).toISOString(),
};

const globalStore = globalThis as unknown as {
  __eduonRuntimeSettings?: RuntimePlatformSettings;
};

function settingsFilePath(): string {
  return path.join(os.tmpdir(), "eduon-runtime-settings.json");
}

const INVALID_TEST_CLIENT_IDS = new Set([
  "live-client-id",
  "test-zoom-client-id",
]);
const INVALID_TEST_CLIENT_SECRETS = new Set([
  "live-client-secret-updated-value",
  "test-zoom-client-secret",
]);

function sanitizePatch(
  raw: Partial<RuntimePlatformSettings>,
): Partial<RuntimePlatformSettings> {
  const out = { ...raw };
  if (
    process.env.NODE_ENV !== "test" &&
    out.zoomClientId &&
    INVALID_TEST_CLIENT_IDS.has(out.zoomClientId)
  ) {
    out.zoomClientId = "";
  }
  if (
    process.env.NODE_ENV !== "test" &&
    out.zoomClientSecret &&
    INVALID_TEST_CLIENT_SECRETS.has(out.zoomClientSecret)
  ) {
    out.zoomClientSecret = "";
  }
  return out;
}

function loadFromDisk(): Partial<RuntimePlatformSettings> {
  if (process.env.NODE_ENV === "test") return {};
  try {
    const file = settingsFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      return sanitizePatch(JSON.parse(raw) as Partial<RuntimePlatformSettings>);
    }
  } catch {
    // ignore read errors on serverless environments
  }
  return {};
}

function saveToDisk(settings: RuntimePlatformSettings): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    fs.writeFileSync(
      settingsFilePath(),
      JSON.stringify(settings, null, 2),
      "utf8",
    );
  } catch {
    // ignore write errors if read-only fs
  }
}

export function getRuntimeSettings(): RuntimePlatformSettings {
  if (!globalStore.__eduonRuntimeSettings) {
    const disk = loadFromDisk();
    globalStore.__eduonRuntimeSettings = {
      ...DEFAULT_SETTINGS,
      ...disk,
    };
  }
  const current = sanitizePatch(globalStore.__eduonRuntimeSettings);
  const accountId = current.zoomAccountId || process.env.ZOOM_ACCOUNT_ID || "";
  const clientId = current.zoomClientId || process.env.ZOOM_CLIENT_ID || "";
  const clientSecret =
    current.zoomClientSecret || process.env.ZOOM_CLIENT_SECRET || "";
  return {
    zoomMode:
      clientId && clientSecret && process.env.ZOOM_MOCK_MODE !== "1"
        ? "live"
        : current.zoomMode || "simulation",
    zoomAccountId: accountId,
    zoomClientId: clientId,
    zoomClientSecret: clientSecret,
    zoomRedirectUri:
      current.zoomRedirectUri ||
      process.env.ZOOM_REDIRECT_URI ||
      DEFAULT_SETTINGS.zoomRedirectUri,
    zoomWebhookSecret:
      current.zoomWebhookSecret ||
      process.env.ZOOM_WEBHOOK_SECRET ||
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN ||
      DEFAULT_SETTINGS.zoomWebhookSecret,
    adminEmails:
      current.adminEmails ||
      process.env.ADMIN_EMAILS ||
      process.env.SUPABASE_ADMIN_EMAILS ||
      DEFAULT_SETTINGS.adminEmails,
    databaseUrl: current.databaseUrl || "",
    updatedAt: current.updatedAt || DEFAULT_SETTINGS.updatedAt,
    updatedByEmail: current.updatedByEmail,
  };
}

export function updateRuntimeSettings(
  patch: Partial<RuntimePlatformSettings>,
  actorEmail?: string,
): RuntimePlatformSettings {
  const prev = getRuntimeSettings();
  const cleanedPatch = sanitizePatch(patch);
  const next: RuntimePlatformSettings = {
    ...prev,
    ...Object.fromEntries(
      Object.entries(cleanedPatch).filter(([, v]) => v !== undefined),
    ),
    updatedAt: new Date().toISOString(),
    ...(actorEmail ? { updatedByEmail: actorEmail } : {}),
  };
  globalStore.__eduonRuntimeSettings = next;
  saveToDisk(next);
  return next;
}

export function hydrateRuntimeSettingsFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): void {
  if (!meta || typeof meta !== "object") return;
  const rawSaved = meta.eduon_platform_settings as
    | Partial<RuntimePlatformSettings>
    | undefined;
  if (!rawSaved || typeof rawSaved !== "object") return;
  const saved = sanitizePatch(rawSaved);
  const current = globalStore.__eduonRuntimeSettings;
  if (
    !current ||
    (saved.updatedAt && saved.updatedAt > (current.updatedAt || ""))
  ) {
    globalStore.__eduonRuntimeSettings = {
      ...DEFAULT_SETTINGS,
      ...current,
      ...saved,
    };
    saveToDisk(globalStore.__eduonRuntimeSettings);
  }
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
