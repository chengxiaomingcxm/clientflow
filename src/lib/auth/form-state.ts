/**
 * Shape shared by the authentication and profile forms.
 *
 * It lives outside `actions.ts` because every export of a `"use server"` module
 * must be an async function, so types and constants cannot be declared there.
 *
 * `status` distinguishes the two outcomes that both carry a message:
 *
 *  - `error`  — something failed; show it as an alert.
 *  - `notice` — informational, e.g. "confirm your email" or "profile updated".
 *
 * The two generic helpers (`toFieldErrors`, `readFormString`) moved to
 * `src/lib/forms/form-state.ts` in Phase 2 so the client forms could reuse them
 * instead of copying them. They are re-exported below, which keeps this module's
 * API — and therefore every Phase 1 import — unchanged.
 */
export type AuthFormState = {
  status: "idle" | "error" | "notice";
  /** Safe, user-facing sentence. Never upstream error text. */
  message: string | null;
  /** Field-level messages, keyed by form field name. */
  fieldErrors: Record<string, string[]>;
  /** Echoes submitted text back so the user does not retype it. */
  values: { email: string; fullName: string };
};

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: { email: "", fullName: "" },
};

/** Builds an `error` state, optionally preserving submitted values. */
export function errorState(
  message: string,
  options: {
    fieldErrors?: Record<string, string[]>;
    values?: Partial<AuthFormState["values"]>;
  } = {},
): AuthFormState {
  return {
    status: "error",
    message,
    fieldErrors: options.fieldErrors ?? {},
    values: { email: "", fullName: "", ...options.values },
  };
}

/** Builds a `notice` state (success or actionable information). */
export function noticeState(
  message: string,
  values: Partial<AuthFormState["values"]> = {},
): AuthFormState {
  return {
    status: "notice",
    message,
    fieldErrors: {},
    values: { email: "", fullName: "", ...values },
  };
}

/**
 * Generic form helpers, re-exported for backward compatibility.
 *
 * Phase 1 defined them here; Phase 2 moved the implementations to
 * `src/lib/forms/form-state.ts` so the client forms share one copy. Every
 * existing import path (`@/lib/auth/form-state`) keeps working.
 */
export { readFormString, toFieldErrors } from "@/lib/forms/form-state";
