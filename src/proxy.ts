import { authFetch } from "./integrations/auth/fetch";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  if (
    process.env.DEMO_MODE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))
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
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          response.headers.set("Cache-Control", "private, no-store");
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
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
