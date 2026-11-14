import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { zoomWebhookSecret } from "@/server/config";
import { getRuntimeSettings } from "@/server/runtime-settings";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function resolveEncryptionKey(): Buffer {
  const raw =
    process.env.ZOOM_TOKEN_ENCRYPTION_KEY ||
    getRuntimeSettings().zoomClientSecret ||
    "eduon-zoom-oauth-token-encryption-key-2026-default";
  if (raw && raw.length >= 32 && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256")
    .update(raw || "eduon-nonprod-zoom-token-encryption-key-v1", "utf8")
    .digest();
}

export function encryptZoomSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = resolveEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptZoomSecret(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("INVALID_ENCRYPTED_ZOOM_SECRET");
  }
  const key = resolveEncryptionKey();
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("INVALID_ENCRYPTED_ZOOM_SECRET");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}*@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.min(4, local.length - 2))}@${domain}`;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "encrypted_password",
  "password",
  "pstn_password",
  "h323_password",
  "zak",
  "token",
  "download_access_token",
  "play_url",
  "download_url",
  "start_url",
]);

function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value))
    return value.map((item) => redactObject(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactObject(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function maskSensitivePayload(payload: unknown): string {
  try {
    return JSON.stringify(redactObject(payload));
  } catch {
    return '{"redacted":true}';
  }
}

export function createZoomUrlValidationResponse(
  plainToken: string,
  secret = zoomWebhookSecret(),
): { plainToken: string; encryptedToken: string } {
  if (!secret) throw new Error("ZOOM_WEBHOOK_SECRET_UNCONFIGURED");
  const encryptedToken = createHmac("sha256", secret)
    .update(plainToken, "utf8")
    .digest("hex");
  return { plainToken, encryptedToken };
}

export function computeZoomWebhookSignature(
  rawBody: string,
  timestamp: string,
  secret = zoomWebhookSecret(),
): string {
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", secret).update(message, "utf8").digest("hex");
  return `v0=${hash}`;
}

export function verifyZoomWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret?: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const secret = input.secret ?? zoomWebhookSecret();
  if (!secret || !input.timestamp || !input.signature) return false;
  const tsSeconds = Number(input.timestamp);
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - tsSeconds) > tolerance) return false;
  const expected = computeZoomWebhookSignature(
    input.rawBody,
    input.timestamp,
    secret,
  );
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createZoomSdkSignature(input: {
  sdkKey: string;
  sdkSecret: string;
  meetingNumber: string;
  role: 0 | 1;
  now?: Date;
  expirationSeconds?: number;
}): string {
  const cleanMeetingNumber = input.meetingNumber.replace(/\D/g, "");
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000) - 30;
  const exp = iat + Math.min(Math.max(input.expirationSeconds ?? 7200, 1800), 86400);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
    "utf8",
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sdkKey: input.sdkKey,
      appKey: input.sdkKey,
      mn: cleanMeetingNumber,
      role: input.role,
      iat,
      exp,
      tokenExp: exp,
    }),
    "utf8",
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", input.sdkSecret)
    .update(signingInput, "utf8")
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

export function createRecordingStreamToken(input: {
  recordingId: string;
  actorUserId: string;
  expiresAt: Date;
}): string {
  const key = resolveEncryptionKey();
  const data = Buffer.from(
    JSON.stringify({
      r: input.recordingId,
      u: input.actorUserId,
      e: input.expiresAt.getTime(),
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", key).update(data, "utf8").digest("base64url");
  return `${data}.${sig}`;
}

export function verifyRecordingStreamToken(
  token: string,
  now = new Date(),
): { recordingId: string; actorUserId: string } | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const key = resolveEncryptionKey();
  const expected = createHmac("sha256", key)
    .update(data, "utf8")
    .digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      r?: string;
      u?: string;
      e?: number;
    };
    if (!parsed.r || !parsed.u || !parsed.e || parsed.e <= now.getTime())
      return null;
    return { recordingId: parsed.r, actorUserId: parsed.u };
  } catch {
    return null;
  }
}

