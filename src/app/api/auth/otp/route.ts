import { z } from "zod";
import { createHash } from "node:crypto";
import { createAuthClient } from "@/integrations/auth/provider";
import { appOrigin, isDemoMode, authConfigured } from "@/server/config";
import { getDatabase } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { verifyOrigin, readJson, respond } from "@/server/http";
import { AppError } from "@/server/errors";
export async function POST(r: Request) {
  try {
    verifyOrigin(r);
    if (isDemoMode() || !authConfigured() || !process.env.SUPABASE_URL)
      return respond({ ok: false, code: "UNAVAILABLE" });
    const data = z
      .object({ email: z.email().max(254) })
      .strict()
      .parse(await readJson(r));
    const email = data.email.toLowerCase();
    const db = getDatabase();
    await rateLimit(
      db,
      "otp:" + createHash("sha256").update(email).digest("hex"),
      3,
      new Date(),
      900000,
    );
    await rateLimit(db, "otp:global", 1000);
    const auth = await createAuthClient();
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser:
          process.env.AUTH_ALLOW_SIGNUP === "true" &&
          !!process.env.PRIVACY_POLICY_VERSION,
        emailRedirectTo: appOrigin() + "/api/auth/callback",
      },
    });
    if (error && error.status && error.status >= 500)
      return respond({ ok: false, code: "UNAVAILABLE" });
    return respond({ ok: true, value: { requested: true } });
  } catch (e) {
    if (e instanceof AppError) return respond({ ok: false, code: e.code });
    if (e instanceof z.ZodError)
      return respond({ ok: false, code: "VALIDATION" });
    return respond({ ok: false, code: "UNAVAILABLE" });
  }
}
