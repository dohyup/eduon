import { z } from "zod";
import { createHash } from "node:crypto";
import { createAuthClient } from "@/integrations/auth/provider";
import {
  authConfigured,
  isConfiguredAdminEmail,
  isDemoMode,
} from "@/server/config";
import { getDatabase } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { verifyOrigin, readJson, respond } from "@/server/http";
import { AppError } from "@/server/errors";

export function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "admin") return "admin@eduon.kr";
  if (!trimmed.includes("@")) return `${trimmed}@eduon.kr`;
  return trimmed;
}

export async function POST(r: Request) {
  try {
    verifyOrigin(r);
    const data = z
      .object({
        identifier: z.string().trim().min(2).max(254),
        password: z.string().min(4).max(128),
      })
      .strict()
      .parse(await readJson(r));

    const email = normalizeLoginIdentifier(data.identifier);

    if (isDemoMode()) {
      if (email === "admin@eduon.kr" && data.password === "admin1234") {
        return respond({
          ok: true,
          value: { redirectPath: "/admin", email, platformAdmin: true },
        });
      }
      return respond({ ok: false, code: "UNAUTHENTICATED" });
    }

    if (!authConfigured() || !process.env.SUPABASE_URL) {
      return respond({ ok: false, code: "UNAVAILABLE" });
    }

    const db = getDatabase();
    await rateLimit(
      db,
      "pwd:" + createHash("sha256").update(email).digest("hex"),
      10,
      new Date(),
      900000,
    );

    const auth = await createAuthClient();
    const { data: authData, error } = await auth.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (error || !authData.user?.email) {
      return respond({ ok: false, code: "UNAUTHENTICATED" });
    }

    const identity = authData.user;
    const normalizedEmail = identity.email!.toLowerCase();
    const appMeta = (identity.app_metadata ?? {}) as Record<string, unknown>;
    const isSupabaseMetaAdmin =
      appMeta.role === "admin" ||
      appMeta.role === "platform_admin" ||
      appMeta.platform_admin === true ||
      appMeta.platformAdmin === true ||
      normalizedEmail === "admin@eduon.kr";
    const shouldGrantAdmin =
      isConfiguredAdminEmail(normalizedEmail) || isSupabaseMetaAdmin;

    const user = await db.user.upsert({
      where: { id: identity.id },
      create: {
        id: identity.id,
        email: normalizedEmail,
        ...(shouldGrantAdmin ? { platformAdmin: true } : {}),
      },
      update: {
        email: normalizedEmail,
        ...(shouldGrantAdmin ? { platformAdmin: true } : {}),
      },
    });

    if (user.disabledAt) {
      return respond({ ok: false, code: "FORBIDDEN" });
    }

    return respond({
      ok: true,
      value: {
        redirectPath: user.platformAdmin ? "/admin" : "/onboarding",
        email: user.email,
        platformAdmin: user.platformAdmin,
      },
    });
  } catch (e) {
    if (e instanceof AppError) return respond({ ok: false, code: e.code });
    if (e instanceof z.ZodError)
      return respond({ ok: false, code: "VALIDATION" });
    return respond({ ok: false, code: "UNAVAILABLE" });
  }
}

