"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldError, FormAlert, fieldErrorId } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/auth/form-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

const PASSWORD_HINT_ID = "password-hint";

/**
 * Sign-up form.
 *
 * The display name is optional; when provided it travels as Supabase sign-up
 * metadata and the `on_auth_user_created` database trigger copies it into the
 * new `profiles` row.
 */
export function RegisterForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, isPending] = useActionState(signUpAction, INITIAL_AUTH_FORM_STATE);

  const emailError = state.fieldErrors.email;
  const passwordError = state.fieldErrors.password;
  const fullNameError = state.fieldErrors.fullName;

  const passwordDescribedBy = passwordError
    ? `${PASSWORD_HINT_ID} ${fieldErrorId("password")}`
    : PASSWORD_HINT_ID;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Name (optional)</Label>
        <Input
          key={`fullName-${state.values.fullName}`}
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          defaultValue={state.values.fullName}
          aria-invalid={fullNameError ? true : undefined}
          aria-describedby={fullNameError ? fieldErrorId("fullName") : undefined}
        />
        <FieldError id={fieldErrorId("fullName")} messages={fullNameError} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          key={`email-${state.values.email}`}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? fieldErrorId("email") : undefined}
        />
        <FieldError id={fieldErrorId("email")} messages={emailError} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordDescribedBy}
        />
        <p id={PASSWORD_HINT_ID} className="text-sm text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters, including a letter and a number.
        </p>
        <FieldError id={fieldErrorId("password")} messages={passwordError} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
