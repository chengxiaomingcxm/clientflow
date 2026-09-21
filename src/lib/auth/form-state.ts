import type { ZodError } from "zod";

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
 * Flattens Zod issues into per-field messages.
 *
 * Implemented directly from `error.issues` (rather than a Zod helper) so the
 * behaviour does not depend on a particular Zod release, and so an issue
 * without a path is attributed to the form itself.
 */
export function toFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

/** Reads a form value as a trimmed string, treating missing entries as "". */
export function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
