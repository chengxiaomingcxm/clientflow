import "server-only";

import { isPublicEnvConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  type AuthFailure,
  type AuthOperation,
  createAuthFailure,
  describeAuthFailure,
  logAuthFailure,
} from "./errors";

/**
 * Server-side identity lookup.
 *
 * `getUser()` is used rather than `getSession()`: it asks the Supabase Auth
 * server to verify the access token, so the returned id is trustworthy. A
 * cookie-based `getSession()` value is attacker-controlled input and is never
 * used for authorization anywhere in ClientFlow.
 *
 * The result is a discriminated union instead of `User | null` so that callers
 * cannot accidentally treat "the Auth service is unreachable" as "signed out".
 * The distinction matters for the protected layout, which must deny access in
 * *both* cases (fail closed) while still being able to explain itself.
 */

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type CurrentUser =
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "unauthenticated" }
  /** Supabase is configured but the Auth service could not be reached. */
  | { status: "unavailable"; failure: AuthFailure }
  /** No Supabase credentials in this environment (local dev / CI default). */
  | { status: "not_configured"; failure: AuthFailure };

export type RequireUserResult =
  { ok: true; user: AuthenticatedUser } | { ok: false; failure: AuthFailure };

/**
 * Resolves the signed-in user for the current request.
 *
 * Never throws: an unexpected failure is reported as `unavailable` so the caller
 * can deny access and render a safe message.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (!isPublicEnvConfigured()) {
    return {
      status: "not_configured",
      failure: createAuthFailure("not_configured", "load_user"),
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      const failure = describeAuthFailure(error, "load_user");

      // No (or an unusable) session is the ordinary signed-out case: it is not
      // a fault, so it is not logged as one.
      if (failure.code === "session_expired") {
        return { status: "unauthenticated" };
      }

      logAuthFailure(failure);
      return { status: "unavailable", failure };
    }

    if (!data.user) {
      return { status: "unauthenticated" };
    }

    return {
      status: "authenticated",
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  } catch (error) {
    const failure = describeAuthFailure(error, "load_user");
    logAuthFailure(failure);

    return { status: "unavailable", failure };
  }
}

/**
 * Guard for Server Actions that require a signed-in caller.
 *
 * Fails closed: anything other than a verified user yields `ok: false`, and the
 * action must refuse to touch data. Row Level Security remains the final
 * backstop for the tenant-owned tables.
 */
export async function requireAuthenticatedUser(
  operation: AuthOperation,
): Promise<RequireUserResult> {
  const current = await getCurrentUser();

  if (current.status === "authenticated") {
    return { ok: true, user: current.user };
  }

  if (current.status === "unauthenticated") {
    return { ok: false, failure: createAuthFailure("session_expired", operation) };
  }

  return {
    ok: false,
    failure: { ...current.failure, diagnostic: { ...current.failure.diagnostic, operation } },
  };
}
