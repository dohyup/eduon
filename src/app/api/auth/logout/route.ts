import { createAuthClient } from "@/integrations/auth/provider";
import { verifyOrigin, respond } from "@/server/http";
import { AppError } from "@/server/errors";
import { isTestAuthEnabled } from "@/server/config";
import { cookies } from "next/headers";
export async function POST(r: Request) {
  try {
    verifyOrigin(r);
    if (isTestAuthEnabled()) {
      (await cookies()).delete("eduon-test-session");
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
