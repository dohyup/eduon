import { ZodError } from "zod";
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "EXPIRED"
  | "SOLD_OUT"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAVAILABLE";
export type Outcome<T> =
  { ok: true; value: T } | { ok: false; code: ErrorCode };
export class AppError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}
export function ensure(condition: unknown, code: ErrorCode): asserts condition {
  if (!condition) throw new AppError(code);
}
export async function attempt<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code };
    if (e instanceof ZodError) return { ok: false, code: "VALIDATION" };
    const code = (e as { code?: string })?.code;
    if (code === "P2002" || code === "P2034")
      return { ok: false, code: "CONFLICT" };
    if (code === "P2025") return { ok: false, code: "NOT_FOUND" };
    throw e;
  }
}
