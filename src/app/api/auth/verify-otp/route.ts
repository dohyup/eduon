import { createHash } from "node:crypto";
import { z } from "zod";
import { createAuthClient } from "@/integrations/auth/provider";
import { authConfigured, isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { readJson, respond, verifyOrigin } from "@/server/http";
import { AppError, ensure } from "@/server/errors";
const input = z
  .object({ email: z.email().max(254), token: z.string().regex(/^\d{6,8}$/) })
  .strict();
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    ensure(
      !isDemoMode() &&
        authConfigured() &&
        process.env.AUTH_PROVIDER === "supabase",
      "UNAVAILABLE",
    );
    const data = input.parse(await readJson(request));
    const email = data.email.toLowerCase();
    const db = getDatabase();
    await rateLimit(
      db,
      `otp-verify:${createHash("sha256").update(email).digest("hex")}`,
      5,
      new Date(),
      900000,
    );
    await rateLimit(db, "otp-verify:global", 1000);
    const auth = await createAuthClient();
    const verified = await auth.auth.verifyOtp({
      email,
      token: data.token,
      type: "email",
    });
    if (verified.error)
      throw new AppError(
        verified.error.status === 429
          ? "RATE_LIMITED"
          : (verified.error.status || 0) >= 500
            ? "UNAVAILABLE"
            : "UNAUTHENTICATED",
      );
    const user = verified.data.user;
    if (
      !verified.data.session ||
      !user?.email_confirmed_at ||
      user.email?.toLowerCase() !== email
    ) {
      await auth.auth.signOut({ scope: "local" });
      throw new AppError("UNAUTHENTICATED");
    }
    const account = await db.user.findUnique({
      where: { id: user.id },
      select: { disabledAt: true },
    });
    if (account?.disabledAt) {
      await auth.auth.signOut({ scope: "local" });
      throw new AppError("FORBIDDEN");
    }
    return respond({ ok: true, value: { authenticated: true } });
  } catch (error) {
    if (error instanceof AppError)
      return respond({ ok: false, code: error.code });
    return respond({
      ok: false,
      code: error instanceof z.ZodError ? "VALIDATION" : "UNAVAILABLE",
    });
  }
}
