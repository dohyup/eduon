import { NextResponse } from "next/server";
import {
  getActor,
  persistRuntimeStateToSupabase,
} from "@/integrations/auth/provider";
import { isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { handle, readJson } from "@/server/http";
import { completeZoomOAuthCallback } from "@/modules/zoom/account";
import { syncOfferingZoomMeetingsInternal } from "@/modules/zoom/meetings";

function resolveRequestOrigin(r: Request): string {
  const url = new URL(r.url);
  const fwdHost = r.headers.get("x-forwarded-host") || r.headers.get("host");
  const fwdProto =
    r.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  if (fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  return url.origin;
}

export async function GET(r: Request) {
  const url = new URL(r.url);
  const origin = resolveRequestOrigin(r);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (isDemoMode() || !code || !state) {
    return NextResponse.redirect(`${origin}/instructor?zoom=error`);
  }
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.redirect(`${origin}/login?error=zoom_auth`);
    }
    const db = getDatabase();
    const ctx = { actor, db, now: () => new Date() };
    const result = await completeZoomOAuthCallback(ctx, { code, state });
    if (!result.ok) {
      return NextResponse.redirect(
        `${origin}/instructor?zoom=error&code=${encodeURIComponent(result.code)}`,
      );
    }
    try {
      const liveOfferings = await db.offering.findMany({
        where: { isZoomLive: true, status: { not: "cancelled" } },
        select: { id: true },
      });
      for (const off of liveOfferings) {
        await syncOfferingZoomMeetingsInternal(ctx, off.id);
      }
    } catch {
      // ignore background meeting sync error during callback
    }
    await persistRuntimeStateToSupabase();
    const targetPath = result.value.redirectPath.startsWith("/")
      ? result.value.redirectPath
      : "/instructor";
    const response = NextResponse.redirect(
      `${origin}${targetPath}?zoom=connected`,
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/instructor?zoom=error`);
  }
}

export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const result = await completeZoomOAuthCallback(
        ctx,
        (await readJson(r)) as { code: string; state: string },
      );
      if (result.ok) {
        try {
          const liveOfferings = await ctx.db.offering.findMany({
            where: { isZoomLive: true, status: { not: "cancelled" } },
            select: { id: true },
          });
          for (const off of liveOfferings) {
            await syncOfferingZoomMeetingsInternal(ctx, off.id);
          }
        } catch {
          // ignore background sync error
        }
      }
      return result;
    },
    true,
  );
}

