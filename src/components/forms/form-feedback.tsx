import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Form-level feedback for a Server Action result.
 *
 * Shared by every form in ClientFlow — authentication and profile (Phase 1) and
 * clients (Phase 2) — which is why it lives in a neutral `forms/` folder rather
 * than under `auth/`. It was extracted there in Phase 2 so the client forms could
 * reuse it instead of copying it.
 *
 * The message was produced by ClientFlow itself (a fixed sentence from
 * `src/lib/auth/errors.ts` or `src/lib/clients/errors.ts`, or a validation
 * failure), so it never contains upstream error text.
 */

/**
 * The slice of a form state this component renders.
 *
 * Declared as a minimal structural type rather than as `AuthFormState` so both
 * `AuthFormState` and `ClientFormState` satisfy it without either module having
 * to know about the other.
 */
export type FormAlertState = {
  status: "idle" | "error" | "notice";
  message: string | null;
};

export function FormAlert({ state }: { state: FormAlertState }) {
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
