/**
 * Translates client data failures into messages that are safe to render.
 *
 * The module mirrors `src/lib/auth/errors.ts` and follows the same two rules:
 *
 *  1. **Nothing internal reaches the browser.** PostgreSQL error text, PostgREST
 *     codes, table/column names, policy names, policy expressions and stack
 *     traces stay in the server log. The UI only ever receives
 *     {@link ClientFailure.message}, which comes from the fixed table below.
 *  2. **A missing row and another tenant's row are indistinguishable.** Row
 *     Level Security makes a foreign row invisible, so both cases arrive here as
 *     the same `not_found` failure with the same sentence. The application never
 *     learns — and therefore can never leak — which of the two happened.
 *
 * The sanitised `diagnostic` field is the only part meant for server logs. It
 * carries the upstream error *name*, `code` and `status`; never the message, a
 * JWT, a cookie or a credential.
 */

export type ClientFailureCode =
  | "not_configured"
  | "not_found"
  | "invalid_input"
  | "session_expired"
  | "service_unavailable"
  | "unexpected";

/**
 * What the server was doing when it failed. Only used for logging, but it is
 * typed so a new call site cannot silently invent an operation name.
 */
export type ClientOperation =
  "list_clients" | "load_client" | "create_client" | "update_client" | "delete_client";

export type ClientFailureDiagnostic = {
  operation: ClientOperation;
  upstreamName: string;
  upstreamCode: string | null;
  upstreamStatus: number | null;
};

export type ClientFailure = {
  /** Stable code for tests and logs. Never rendered to the user. */
  code: ClientFailureCode;
  /** Fixed, user-facing sentence. */
  message: string;
  /** Sanitised metadata for server-side logging only. */
  diagnostic: ClientFailureDiagnostic;
};

const MESSAGES: Record<ClientFailureCode, string> = {
  not_configured:
    "Client data is not available because Supabase is not configured for this environment. Copy .env.example to .env.local and add your Supabase project values.",
  not_found: "That client could not be found.",
  invalid_input: "Those details were not accepted. Check the entries and try again.",
  session_expired: "Your session has expired. Please sign in again.",
  service_unavailable: "Client data is temporarily unavailable. Please try again in a moment.",
  unexpected: "Something went wrong. Please try again.",
};

/**
 * PostgreSQL `errcode` values that mean the submitted values were rejected by a
 * database constraint. The client schema mirrors those constraints, so reaching
 * one of these means the payload did not come from ClientFlow's own form.
 *
 *  - `23514` check_violation      (a `clients_*_check` constraint)
 *  - `23502` not_null_violation   (a NULL in a NOT NULL column)
 *  - `22001` string_data_right_truncation (value longer than the column allows)
 */
const INVALID_INPUT_CODES = new Set(["23514", "23502", "22001"]);

/**
 * `42501` insufficient_privilege. ClientFlow builds every statement from the
 * verified session and scopes it with `user_id = auth.uid()`, so the only way
 * Row Level Security can reject it is that the request is no longer
 * authenticated as the user it claims to be. Telling the visitor to sign in
 * again is both safe and actionable.
 */
const INSUFFICIENT_PRIVILEGE_CODES = new Set(["42501"]);

/**
 * `PGRST116` — PostgREST's "JSON object requested, multiple (or no) rows
 * returned" for `.single()`. Zero rows is reported as "not found", not a fault.
 */
const NO_ROWS_CODES = new Set(["PGRST116"]);

/**
 * Builds a safe failure for a condition ClientFlow detected itself (missing
 * configuration, or a row that is not visible to this tenant), with no upstream
 * error attached.
 */
export function createClientFailure(
  code: ClientFailureCode,
  operation: ClientOperation,
): ClientFailure {
  return {
    code,
    message: MESSAGES[code],
    diagnostic: {
      operation,
      upstreamName: "clientflow",
      upstreamCode: null,
      upstreamStatus: null,
    },
  };
}

/** Maps a Supabase/PostgREST/PostgreSQL failure onto a safe {@link ClientFailure}. */
export function describeClientFailure(error: unknown, operation: ClientOperation): ClientFailure {
  const diagnostic: ClientFailureDiagnostic = {
    operation,
    upstreamName: nameOf(error),
    upstreamCode: null,
    upstreamStatus: null,
  };

  const withDiagnostic = (code: ClientFailureCode): ClientFailure => ({
    code,
    message: MESSAGES[code],
    diagnostic,
  });

  if (isErrorWithCode(error)) {
    const { code } = error;
    diagnostic.upstreamCode = code;
    diagnostic.upstreamStatus = statusOf(error);

    if (NO_ROWS_CODES.has(code)) {
      return withDiagnostic("not_found");
    }

    if (INVALID_INPUT_CODES.has(code)) {
      return withDiagnostic("invalid_input");
    }

    if (INSUFFICIENT_PRIVILEGE_CODES.has(code)) {
      return withDiagnostic("session_expired");
    }

    return withDiagnostic("unexpected");
  }

  // A failed `fetch` surfaces as a TypeError ("fetch failed"), i.e. Supabase
  // could not be reached at all.
  if (error instanceof TypeError) {
    return withDiagnostic("service_unavailable");
  }

  return withDiagnostic("unexpected");
}

/**
 * Writes sanitised diagnostics to the server log.
 *
 * Only the stable code, operation and upstream name/code/status are recorded, so
 * neither row contents nor credentials can end up in a log line.
 */
export function logClientFailure(failure: ClientFailure): void {
  const { operation, upstreamName, upstreamCode, upstreamStatus } = failure.diagnostic;

  console.error(
    `[clientflow:clients] ${operation} failed (${failure.code}) ` +
      `upstream=${upstreamName} code=${upstreamCode ?? "-"} status=${upstreamStatus ?? "-"}`,
  );
}

/**
 * Supabase surfaces a PostgREST error (`class PostgrestError extends Error`) with
 * a 5-character PostgreSQL `code`. That code is all this module needs.
 */
function isErrorWithCode(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code.length > 0
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
