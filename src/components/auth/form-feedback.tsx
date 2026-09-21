import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AuthFormState } from "@/lib/auth/form-state";

/**
 * Form-level feedback for a Server Action result.
 *
 * The message was produced by `src/lib/auth/errors.ts` (or by ClientFlow itself
 * for validation failures), so it never contains upstream error text.
 */

export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const isError = state.status === "error";

  return (
    <Alert variant={isError ? "destructive" : "default"}>
      <AlertTitle>{isError ? "Something went wrong" : "Please note"}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/** `id` used by a field's error paragraph so controls can reference it. */
export function fieldErrorId(field: string): string {
  return `${field}-error`;
}

/** Field-level message; render `null` when the field is valid. */
export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  const message = messages?.[0];

  if (!message) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
