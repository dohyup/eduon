import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getActor } from "@/integrations/auth/provider";
import { getDatabase } from "./db";
import {
  AppError,
  attempt,
  type Outcome,
  type ErrorCode,
  ensure,
} from "./errors";
import { appOrigin, isDemoMode } from "./config";
import type { ServiceContext } from "./context";
import { rateLimit } from "./rate-limit";
export const noStore = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const statuses: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  EXPIRED: 410,
  SOLD_OUT: 409,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
};
export function respond<T>(result: Outcome<T>) {
  return Response.json(result, {
    status: result.ok ? 200 : statuses[result.code],
    headers: noStore,
  });
}
export function verifyOrigin(request: Request) {
  ensure(request.headers.get("origin") === appOrigin(), "FORBIDDEN");
}
export async function readJson(request: Request) {
  ensure(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    "VALIDATION",
  );
  const length = Number(request.headers.get("content-length") || 0);
  ensure(length <= 32768, "VALIDATION");
  const reader = request.body?.getReader();
  ensure(reader, "VALIDATION");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new AppError("VALIDATION");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  ensure(Buffer.byteLength(text) <= 32768, "VALIDATION");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION");
  }
}
/** Preserve exact signed bytes and bound streaming bodies before decoding. */
export async function readRawBody(request: Request) {
  ensure(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    "VALIDATION",
  );
  ensure(
    Number(request.headers.get("content-length") || 0) <= 32768,
    "VALIDATION",
  );
  const reader = request.body?.getReader();
  ensure(reader, "VALIDATION");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new AppError("VALIDATION");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function handle(
  request: Request,
  fn: (ctx: ServiceContext) => Promise<Outcome<unknown>>,
  mutate = false,
) {
  try {
    if (isDemoMode()) return respond({ ok: false, code: "UNAVAILABLE" });
    if (mutate) verifyOrigin(request);
    const actor = await getActor();
    ensure(actor, "UNAUTHENTICATED");
    const db = getDatabase();
    if (mutate) await rateLimit(db, `mutate:${actor.userId}`, 60);
    return respond(await fn({ actor, db, now: () => new Date() }));
  } catch (error) {
    if (error instanceof AppError)
      return respond({ ok: false, code: error.code });
    if (error instanceof z.ZodError)
      return respond({ ok: false, code: "VALIDATION" });
    const id = randomUUID();
    console.error(
      "EDUON request failed",
      id,
      (error as { code?: string })?.code || "INTERNAL",
    );
    return respond({ ok: false, code: "UNAVAILABLE" });
  }
}
export const asOutcome = attempt;
