import { createAuthClient } from "@/integrations/auth/provider";
import { verifyOrigin, respond } from "@/server/http";
import { AppError } from "@/server/errors";
import { isTestAuthEnabled } from "@/server/config";
import { cookies } from "next/headers";
export async function POST(r: Request) {
  try {
    verifyOrigin(r);
    const jar = await cookies();
    jar.delete("eduon-test-session");
    jar.delete("eduon-admin-session");
    for (const c of jar.getAll()) {
      if (c.name.startsWith("sb-")) {
        jar.set(c.name, "", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 0,
        });
      }
    }
    if (isTestAuthEnabled()) {
      return respond({ ok: true, value: { signedOut: true } });
    }
    const auth = await createAuthClient();
    const { error } = await auth.auth.signOut();
    return respond(
      error
        ? { ok: false, code: "UNAVAILABLE" }
        : { ok: true, value: { signedOut: true } },
    );
  } catch (e) {
    return respond({
      ok: false,
      code: e instanceof AppError ? e.code : "UNAVAILABLE",
    });
  }
}
