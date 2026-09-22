import type { ZodError } from "zod";

/**
 * Form-state primitives shared by every Server Action form in ClientFlow.
 *
 * These two helpers are domain-agnostic: the authentication forms (Phase 1) and
 * the client forms (Phase 2) both need to flatten Zod issues into per-field
 * messages and to read raw form entries. They live here, rather than in either
 * domain, so there is one implementation instead of two.
 *
 * `src/lib/auth/form-state.ts` re-exports them unchanged, so the Phase 1 module's
 * public API is preserved.
 */

/** Field-level messages, keyed by form field name. */
export type FieldErrors = Record<string, string[]>;

/**
 * Flattens Zod issues into per-field messages.
 *
 * Implemented directly from `error.issues` (rather than a Zod helper) so the
 * behaviour does not depend on a particular Zod release, and so an issue
 * without a path is attributed to the form itself.
 */
export function toFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

/**
 * Reads a form value as a string, treating a missing entry as `""`.
 *
 * Trimming belongs to the schema, not here, so the text the user typed is
 * available to echo back into the form.
 */
export function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
