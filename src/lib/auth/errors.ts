import {
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";

/**
 * Translates Supabase Auth failures into messages that are safe to render.
 *
 * Two rules drive this module:
 *
 *  1. **Nothing internal reaches the browser.** The raw `error.message`,
 *     status codes, GoTrue/PostgREST text and stack traces stay on the server.
 *     The UI only ever receives {@link AuthFailure.message}, which comes from
 *     the fixed table below.
 *  2. **No account enumeration.** A wrong password and an unknown email produce
 *     the same message, and a failed sign-up never reveals that the address is
 *     already registered.
 *
 * The sanitised `diagnostic` field is the only part meant for server logs. It
 * carries the upstream error *name*, `code` and `status` — never the message,
 * password, JWT, session token or cookie contents.
 */

export type AuthFailureCode =
  | "not_configured"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_creation_failed"
  | "rate_limited"
  | "weak_password"
  | "session_expired"
  | "service_unavailable"
  | "unexpected";

export type AuthOperation =
  "sign_in" | "sign_up" | "sign_out" | "confirm_session" | "load_user" | "update_profile";

export type AuthFailureDiagnostic = {
  operation: AuthOperation;
  upstreamName: string;
  upstreamCode: string | null;
  upstreamStatus: number | null;
};

export type AuthFailure = {
  /** Stable code for tests and logs. Never rendered to the user. */
  code: AuthFailureCode;
  /** Fixed, user-facing sentence. */
  message: string;
  /** Sanitised metadata for server-side logging only. */
  diagnostic: AuthFailureDiagnostic;
};

const MESSAGES: Record<AuthFailureCode, string> = {
  not_configured:
    "Authentication is not configured for this environment. Copy .env.example to .env.local and add your Supabase project values.",
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Please confirm your email address, then sign in.",
  account_creation_failed:
    "We could not create an account with those details. If you already have an account, try signing in instead.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  weak_password:
    "That password was rejected. Use at least 8 characters, including a letter and a number.",
  session_expired: "Your session has expired. Please sign in again.",
  service_unavailable: "Authentication is temporarily unavailable. Please try again in a moment.",
  unexpected: "Something went wrong. Please try again.",
};

/** Upstream codes that mean "this address already has an account". */
const DUPLICATE_ACCOUNT_CODES = new Set(["email_exists", "user_already_exists", "phone_exists"]);

/** Upstream codes that mean "those credentials were rejected". */
const INVALID_CREDENTIAL_CODES = new Set(["invalid_credentials", "invalid_grant"]);

/** Supabase signals throttling either through a status or a dedicated code. */
function isRateLimited(code: string, status: number | null): boolean {
  return (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit"
  );
}

/**
 * Builds a safe failure for a condition ClientFlow detected itself (for example
 * missing Supabase configuration), with no upstream error attached.
 */
export function createAuthFailure(code: AuthFailureCode, operation: AuthOperation): AuthFailure {
  return {
    code,
    message: MESSAGES[code],
    diagnostic: {
      operation,
      upstreamName: "none",
      upstreamCode: null,
      upstreamStatus: null,
    },
  };
}

/**
 * Maps any thrown value to a safe {@link AuthFailure}.
 *
 * `operation` matters for one case: a duplicate-account error is only hidden
 * during sign-up. During sign-in the same upstream code would itself be an
 * enumeration leak, so it is folded into `invalid_credentials`.
 */
export function describeAuthFailure(error: unknown, operation: AuthOperation): AuthFailure {
  const diagnostic: AuthFailureDiagnostic = {
    operation,
    upstreamName: nameOf(error),
    upstreamCode: null,
    upstreamStatus: null,
  };

  const withDiagnostic = (code: AuthFailureCode): AuthFailure => ({
    code,
    message: MESSAGES[code],
    diagnostic,
  });

  // "No session" is the normal state for a visitor, not a fault.
  if (isAuthSessionMissingError(error)) {
    return withDiagnostic("session_expired");
  }

  // Supabase retries these itself; when it gives up, the service is unreachable.
  if (isAuthRetryableFetchError(error)) {
    diagnostic.upstreamStatus = statusOf(error);
    return withDiagnostic("service_unavailable");
  }

  if (isAuthError(error)) {
    const code = typeof error.code === "string" ? error.code : "";
    const status = statusOf(error);
    diagnostic.upstreamCode = code.length > 0 ? code : null;
    diagnostic.upstreamStatus = status;

    if (isRateLimited(code, status)) {
      return withDiagnostic("rate_limited");
    }

    if (DUPLICATE_ACCOUNT_CODES.has(code)) {
      return withDiagnostic(
        operation === "sign_up" ? "account_creation_failed" : "invalid_credentials",
      );
    }

    if (INVALID_CREDENTIAL_CODES.has(code)) {
      return withDiagnostic("invalid_credentials");
    }

    if (code === "email_not_confirmed") {
      return withDiagnostic("email_not_confirmed");
    }

    if (code === "weak_password") {
      return withDiagnostic("weak_password");
    }

    if (code === "session_not_found" || code === "refresh_token_not_found") {
      return withDiagnostic("session_expired");
    }

    // A 5xx from the Auth service is an outage, not a rejected credential.
    if (isAuthApiError(error) && status !== null && status >= 500) {
      return withDiagnostic("service_unavailable");
    }

    return withDiagnostic("unexpected");
  }

  // A failed `fetch` surfaces as a TypeError ("fetch failed"), i.e. the Auth
  // service could not be reached at all.
  if (error instanceof TypeError) {
    return withDiagnostic("service_unavailable");
  }

  return withDiagnostic("unexpected");
}

/**
 * Writes sanitised diagnostics to the server log.
 *
 * Only the stable code, operation and upstream name/code/status are recorded.
 * Request credentials (password, JWT, session token, cookies) are never part of
 * a {@link AuthFailure}, so they cannot leak here.
 */
export function logAuthFailure(failure: AuthFailure): void {
  const { operation, upstreamName, upstreamCode, upstreamStatus } = failure.diagnostic;

  console.error(
    `[clientflow:auth] ${operation} failed (${failure.code}) ` +
      `upstream=${upstreamName} code=${upstreamCode ?? "-"} status=${upstreamStatus ?? "-"}`,
  );
}

function nameOf(error: unknown): string {
  if (error instanceof Error && typeof error.name === "string" && error.name.length > 0) {
    return error.name;
  }

  return typeof error;
}

function statusOf(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }

  return null;
}
