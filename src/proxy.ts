import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { describeAuthFailure, logAuthFailure } from "@/lib/auth/errors";
import { PATHNAME_HEADER } from "@/lib/auth/request-path";
import { getPublicEnvOrNull } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Session refresh proxy (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Its single job is to exchange an expiring Supabase session for a fresh one and
 * write the rotated cookies back onto the response. It deliberately makes **no
 * authorization decisions and performs no redirects**: Next.js documents proxy
 * as an optimistic layer that must not be the security boundary, and ClientFlow
 * keeps that boundary in the protected layout plus Row Level Security in the
 * database.
 *
 * Two failure modes are handled explicitly:
 *
 *  - **Supabase not configured** (local development or CI without credentials):
 *    pass the request through untouched. There is no session to refresh and
 *    throwing here would break every route.
 *  - **Auth service unreachable**: log sanitised diagnostics and continue. The
 *    request must still be served; the protected layout fails closed on its own.
 */
export async function proxy(request: NextRequest) {
  // Always overwritten with the real path, so a forged header cannot survive.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const env = getPublicEnvOrNull();

  if (!env) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Refresh both the request (so the current render sees the new
          // session) and the response (so the browser stores it).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request: { headers: requestHeaders } });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  try {
    // Verifies the token with the Auth server and rotates it when needed.
    await supabase.auth.getUser();
  } catch (error) {
    logAuthFailure(describeAuthFailure(error, "load_user"));
  }

  return response;
}

export const config = {
  /**
   * Everything except Next.js build output and static assets. Keeping assets out
   * avoids a pointless Supabase round-trip for every image or font request.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|txt|woff|woff2|ttf)$).*)",
  ],
};
