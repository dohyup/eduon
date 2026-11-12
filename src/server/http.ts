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
  const origin = request.headers.get("origin");
  ensure(origin, "FORBIDDEN");
  const expected = appOrigin();
  if (origin === expected) return;
  try {
    const oUrl = new URL(origin);
    const eUrl = new URL(expected);
    const isLoopback = (h: string) => h === "127.0.0.1" || h === "localhost";
    if (
      oUrl.protocol === eUrl.protocol &&
      oUrl.port === eUrl.port &&
      isLoopback(oUrl.hostname) &&
      isLoopback(eUrl.hostname)
    ) {
      return;
    }
    const stripWww = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    if (
      oUrl.protocol === eUrl.protocol &&
      oUrl.port === eUrl.port &&
      stripWww(oUrl.hostname) === stripWww(eUrl.hostname)
    ) {
      return;
    }
    if (stripWww(oUrl.hostname) === "eduonlink.com") {
      return;
    }
    const reqUrl = new URL(request.url);
    if (origin === reqUrl.origin) return;
    const fwdHost =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const fwdProto =
      request.headers.get("x-forwarded-proto") ||
      reqUrl.protocol.replace(":", "");
    if (fwdHost && origin === `${fwdProto}://${fwdHost}`) return;
  } catch {
    // fallthrough
  }
  throw new AppError("FORBIDDEN");
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
