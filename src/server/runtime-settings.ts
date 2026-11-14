import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimePlatformSettings {
  zoomMode: "simulation" | "live";
  zoomClientId: string;
  zoomClientSecret: string;
  zoomRedirectUri: string;
  zoomWebhookSecret: string;
  zoomTokenEncryptionKey: string;
  zoomSdkKey: string;
  zoomSdkSecret: string;
  zoomExternalSdkApproved: boolean;
  adminEmails: string;
  databaseUrl: string;
  updatedAt: string;
  updatedByEmail?: string;
}

const DEFAULT_SETTINGS: RuntimePlatformSettings = {
  zoomMode: "simulation",
  zoomClientId: "",
  zoomClientSecret: "",
  zoomRedirectUri: "",
  zoomWebhookSecret: "eduon-zoom-webhook-secret-token-2026",
  zoomTokenEncryptionKey:
    "eduon-production-zoom-token-encryption-key-2026-secure",
  zoomSdkKey: "",
  zoomSdkSecret: "",
  zoomExternalSdkApproved: false,
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

function loadFromDisk(): Partial<RuntimePlatformSettings> {
  try {
    const file = settingsFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      return JSON.parse(raw) as Partial<RuntimePlatformSettings>;
    }
  } catch {
    // ignore read errors on serverless environments
  }
  return {};
}

function saveToDisk(settings: RuntimePlatformSettings): void {
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
  const current = globalStore.__eduonRuntimeSettings;
  return {
    zoomMode:
      current.zoomMode ||
      (process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET &&
      process.env.ZOOM_MOCK_MODE !== "1"
        ? "live"
        : "simulation"),
    zoomClientId: current.zoomClientId || process.env.ZOOM_CLIENT_ID || "",
    zoomClientSecret:
      current.zoomClientSecret || process.env.ZOOM_CLIENT_SECRET || "",
    zoomRedirectUri:
      current.zoomRedirectUri || process.env.ZOOM_REDIRECT_URI || "",
    zoomWebhookSecret:
      current.zoomWebhookSecret ||
      process.env.ZOOM_WEBHOOK_SECRET ||
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN ||
      DEFAULT_SETTINGS.zoomWebhookSecret,
    zoomTokenEncryptionKey:
      current.zoomTokenEncryptionKey ||
      process.env.ZOOM_TOKEN_ENCRYPTION_KEY ||
      DEFAULT_SETTINGS.zoomTokenEncryptionKey,
    zoomSdkKey: current.zoomSdkKey || process.env.ZOOM_SDK_KEY || "",
    zoomSdkSecret: current.zoomSdkSecret || process.env.ZOOM_SDK_SECRET || "",
    zoomExternalSdkApproved:
      process.env.ZOOM_EXTERNAL_SDK_APPROVED !== undefined
        ? process.env.ZOOM_EXTERNAL_SDK_APPROVED === "true"
        : Boolean(current.zoomExternalSdkApproved),
    adminEmails:
      current.adminEmails ||
      process.env.ADMIN_EMAILS ||
      process.env.SUPABASE_ADMIN_EMAILS ||
      DEFAULT_SETTINGS.adminEmails,
    databaseUrl: current.databaseUrl || "",
    updatedAt: current.updatedAt,
    updatedByEmail: current.updatedByEmail,
  };
}

export function updateRuntimeSettings(
  patch: Partial<RuntimePlatformSettings>,
  actorEmail?: string,
): RuntimePlatformSettings {
  const prev = getRuntimeSettings();
  const next: RuntimePlatformSettings = {
    ...prev,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
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
  const saved = meta.eduon_platform_settings as
    | Partial<RuntimePlatformSettings>
    | undefined;
  if (!saved || typeof saved !== "object") return;
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
