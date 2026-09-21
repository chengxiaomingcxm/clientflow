import { NextResponse, type NextRequest } from "next/server";

import { confirmFailureLocation, confirmSuccessLocation } from "@/lib/auth/confirm";
import { describeAuthFailure, logAuthFailure } from "@/lib/auth/errors";
import { isPublicEnvConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Email-confirmation callback (`/auth/confirm?code=...&next=...`).
 *
 * Supabase redirects here after the user clicks the link in the confirmation
 * email; the PKCE `code` is exchanged for a session, which `@supabase/ssr`
 * writes into cookies. Used only when the Supabase project has email
 * confirmation enabled.
 *
 * Security notes:
 *
 *  - The `code` is opaque and single-use; it is passed straight to Supabase and
 *    never logged.
 *  - `next` is attacker-controllable and is therefore sanitised before use.
 *  - Redirects use a **relative** `Location`. Building an absolute URL would
 *    mean trusting the request's `Host` header, which is the classic host-header
 *    open-redirect; a relative location cannot leave the origin.
 *  - Failures return a fixed reason code. Supabase's own `error` /
 *    `error_description` parameters are deliberately ignored so they can never be
 *    reflected back to the user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!isPublicEnvConfigured()) {
    return redirectTo(confirmFailureLocation("unavailable"));
  }

  if (!code) {
    return redirectTo(confirmFailureLocation("invalid_link"));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logAuthFailure(describeAuthFailure(error, "confirm_session"));

      return redirectTo(confirmFailureLocation("invalid_link"));
    }
  } catch (error) {
    logAuthFailure(describeAuthFailure(error, "confirm_session"));

    return redirectTo(confirmFailureLocation("unavailable"));
  }

  return redirectTo(confirmSuccessLocation(next));
}

/** 303 keeps the follow-up request a GET and does not repeat the exchange. */
function redirectTo(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}
