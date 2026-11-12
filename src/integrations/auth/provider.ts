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
import { verifyTestSession } from "./test-session";
export async function createAuthClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
    throw new Error("AUTH_UNCONFIGURED");
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
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
    },
  );
}
export async function getActor() {
  if (isDemoMode() || !authConfigured()) return null;
  const db = getDatabase();
  if (isTestAuthEnabled()) {
    const jar = await cookies();
    const id = verifyTestSession(
      jar.get("eduon-test-session")?.value || "",
      process.env.E2E_AUTH_SECRET!,
    );
    if (!id) return null;
    const user = await db.user.findUnique({ where: { id } });
    return user && !user.disabledAt ? { userId: user.id } : null;
  }
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  const identity = data.user;
  const normalizedEmail = identity.email!.toLowerCase();
  const appMeta = (identity.app_metadata ?? {}) as Record<string, unknown>;
  const isSupabaseMetaAdmin =
    appMeta.role === "admin" ||
    appMeta.role === "platform_admin" ||
    appMeta.platform_admin === true ||
    appMeta.platformAdmin === true;
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
  return !user.disabledAt ? { userId: user.id } : null;
}
