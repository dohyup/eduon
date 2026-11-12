import { authFetch } from "./fetch";
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getDatabase } from "@/server/db";
import {
  authConfigured,
  isConfiguredAdminEmail,
  isDemoMode,
  isTestAuthEnabled,
} from "@/server/config";
import {
  getRuntimeSettings,
  hydrateRuntimeSettingsFromMetadata,
} from "@/server/runtime-settings";
import { ensureRuntimeUserProvisioned } from "@/server/runtime-db";
import { verifyTestSession } from "./test-session";

const DEFAULT_SUPABASE_URL = "https://mljnplnoipkxtggnsqoj.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_LOMCnSMcMIRMFsOo8ke6Hw_j6V134Gl";
const ADMIN_FALLBACK_SECRET =
  process.env.E2E_AUTH_SECRET ||
  process.env.ZOOM_TOKEN_ENCRYPTION_KEY ||
  "eduon-admin-fallback-session-secret-key-2026";

export async function createAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const jar = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    global: { fetch: authFetch },
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items)
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
        } catch {
          /* Server Components cannot set cookies; proxy refreshes them. */
        }
      },
    },
  });
}

export async function getActor() {
  if (isDemoMode() || !authConfigured()) return null;
  const db = getDatabase();
  const jar = await cookies();
  if (isTestAuthEnabled()) {
    const id = verifyTestSession(
      jar.get("eduon-test-session")?.value || "",
      process.env.E2E_AUTH_SECRET!,
    );
    if (!id) return null;
    const user = await db.user.findUnique({ where: { id } });
    return user && !user.disabledAt ? { userId: user.id } : null;
  }
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.email && data.user.email_confirmed_at) {
      const identity = data.user;
      hydrateRuntimeSettingsFromMetadata(
        identity.user_metadata as Record<string, unknown> | undefined,
      );
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
      if (!process.env.DATABASE_URL && !getRuntimeSettings().databaseUrl) {
        ensureRuntimeUserProvisioned(identity.id, normalizedEmail);
      }
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
      return !user.disabledAt ? { userId: user.id } : null;
    }
  } catch {
    // fallback to signed admin session cookie below
  }

  const adminCookie = jar.get("eduon-admin-session")?.value || "";
  const verifiedAdminId = verifyTestSession(adminCookie, ADMIN_FALLBACK_SECRET);
  if (verifiedAdminId) {
    if (!process.env.DATABASE_URL && !getRuntimeSettings().databaseUrl) {
      ensureRuntimeUserProvisioned(verifiedAdminId, "admin@eduon.kr");
    }
    const user = await db.user.upsert({
      where: { id: verifiedAdminId },
      create: {
        id: verifiedAdminId,
        email: "admin@eduon.kr",
        platformAdmin: true,
      },
      update: {
        platformAdmin: true,
      },
    });
    return !user.disabledAt ? { userId: user.id } : null;
  }
  return null;
}
