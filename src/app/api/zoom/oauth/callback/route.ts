import { NextResponse } from "next/server";
import { getActor } from "@/integrations/auth/provider";
import { appOrigin, isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { handle, readJson } from "@/server/http";
import { completeZoomOAuthCallback } from "@/modules/zoom/account";

export async function GET(r: Request) {
  const url = new URL(r.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (isDemoMode() || !code || !state) {
    return NextResponse.redirect(`${appOrigin()}/instructor?zoom=error`);
  }
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.redirect(`${appOrigin()}/login?error=zoom_auth`);
    }
    const db = getDatabase();
    const result = await completeZoomOAuthCallback(
      { actor, db, now: () => new Date() },
      { code, state },
    );
    if (!result.ok) {
      return NextResponse.redirect(
        `${appOrigin()}/instructor?zoom=error&code=${encodeURIComponent(result.code)}`,
      );
    }
    const targetPath = result.value.redirectPath.startsWith("/")
      ? result.value.redirectPath
      : "/instructor";
    const response = NextResponse.redirect(
      `${appOrigin()}${targetPath}?zoom=connected`,
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(`${appOrigin()}/instructor?zoom=error`);
  }
}

export function POST(r: Request) {
  return handle(
    r,
    async (ctx) =>
      completeZoomOAuthCallback(
        ctx,
        (await readJson(r)) as { code: string; state: string },
      ),
    true,
  );
}

