"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, fieldErrorId } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_FORM_STATE, type AuthFormState } from "@/lib/auth/form-state";

/**
 * Edits the signed-in user's display name.
 *
 * Only `full_name` is editable in Phase 1 (the email is owned by Supabase Auth),
 * and the write is authorized server-side plus by the owner-only RLS policy on
 * `public.profiles`.
 */
export function ProfileForm({ initialFullName }: { initialFullName: string }) {
  const initialState: AuthFormState = {
    ...INITIAL_AUTH_FORM_STATE,
    values: { email: "", fullName: initialFullName },
  };

  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  const fullNameError = state.fieldErrors.fullName;
  const fullNameDescribedBy = fullNameError ? fieldErrorId("fullName") : undefined;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Display name</Label>
        <Input
          // Remounts when the saved value changes so the field always shows the
          // current name, even though it is uncontrolled.
          key={`fullName-${state.values.fullName || initialFullName}`}
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.values.fullName || initialFullName}
          aria-invalid={fullNameError ? true : undefined}
          aria-describedby={fullNameDescribedBy}
        />
        <FieldError id={fieldErrorId("fullName")} messages={fullNameError} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
