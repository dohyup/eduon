import { authFetch } from "./integrations/auth/fetch";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const MAX_SB_COOKIE_BYTES = 3500;

export async function proxy(request: NextRequest) {
  const allCookies = request.cookies.getAll();
  const sbCookies = allCookies.filter((c) => c.name.startsWith("sb-"));
  const sbTotalBytes = sbCookies.reduce(
    (sum, c) => sum + c.name.length + c.value.length,
    0,
  );
  const hasChunkedSbCookies = sbCookies.some((c) => /\.\d+$/.test(c.name));

  // Prevent HTTP 431 (Request Header Fields Too Large) caused by chunked/bloated Supabase JWT cookies
  if (hasChunkedSbCookies || sbTotalBytes > MAX_SB_COOKIE_BYTES) {
    for (const c of sbCookies) {
      request.cookies.delete(c.name);
    }
    const cleanResponse = NextResponse.next({ request });
    cleanResponse.headers.set("Cache-Control", "private, no-store");
    for (const c of sbCookies) {
      cleanResponse.cookies.set(c.name, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return cleanResponse;
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  if (
    process.env.DEMO_MODE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    sbCookies.length === 0
  )
    return response;

  const auth = createServerClient(
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
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          const totalBytes = items.reduce(
            (sum, i) => sum + i.name.length + i.value.length,
            0,
          );
          const isChunked = items.some(
            (i) => /\.\d+$/.test(i.name) && i.value.length > 0,
          );
          if (isChunked || totalBytes > MAX_SB_COOKIE_BYTES) {
            for (const c of sbCookies) {
              response.cookies.set(c.name, "", {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
              });
            }
            return;
          }
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            }),
          );
        },
      },
    },
  );
  try {
    await auth.auth.getClaims();
  } catch {
    return new NextResponse(
      "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
  return response;
}
export const config = {
  matcher: [
    "/api/:path*",
    "/parent/:path*",
    "/learn/:path*",
    "/academy/:path*",
    "/instructor/:path*",
    "/admin/:path*",
    "/login",
    "/signup",
    "/invitations",
  ],
};
