import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Authentication only. Callers must durably claim nonce before executing work. */
export function verifyJobRequest(
  rawBody: Uint8Array,
  headers: Headers,
  nowMs = Date.now(),
): { nonce: string; timestamp: number } {
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 32) throw new Error("JOB_AUTH_UNCONFIGURED");
  const timestampText = headers.get("x-eduon-timestamp") ?? "";
  const nonce = headers.get("x-eduon-nonce") ?? "";
  const signature = headers.get("x-eduon-signature") ?? "";
  if (
    !/^(0|[1-9]\d{0,10})$/.test(timestampText) ||
    !/^[a-fA-F0-9]{32}$/.test(nonce) ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  )
    throw new Error("JOB_UNAUTHORIZED");
  const timestamp = Number(timestampText);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isFinite(now) || timestamp > now || now - timestamp > 300)
    throw new Error("JOB_UNAUTHORIZED");
  const expected = createHmac("sha256", secret)
    .update(`${timestampText}.${nonce}.`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "hex");
  if (!timingSafeEqual(received, expected)) throw new Error("JOB_UNAUTHORIZED");
  return { nonce, timestamp };
}
