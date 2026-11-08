import { createAuthClient } from "@/integrations/auth/provider";
import { appOrigin, authConfigured, isDemoMode } from "@/server/config";
import { NextResponse } from "next/server";
export async function GET(r: Request) {
  const code = new URL(r.url).searchParams.get("code");
  if (!code || !authConfigured() || isDemoMode())
    return NextResponse.redirect(appOrigin() + "/login?error=callback");
  try {
    const client = await createAuthClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    const response = NextResponse.redirect(
      appOrigin() + (error ? "/login?error=callback" : "/onboarding"),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(appOrigin() + "/login?error=callback");
  }
}
