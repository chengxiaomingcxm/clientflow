"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldError, FormAlert, fieldErrorId } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/auth/form-state";

/**
 * Sign-in form.
 *
 * Validation and the credential exchange both happen in the Server Action; this
 * component only renders the result. `noValidate` disables the browser's own
 * messages so the user always sees the same, server-owned wording.
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, isPending] = useActionState(signInAction, INITIAL_AUTH_FORM_STATE);

  const emailError = state.fieldErrors.email;
  const passwordError = state.fieldErrors.password;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* Preserved so a successful sign-in returns the user to where they were. */}
      <input type="hidden" name="next" value={nextPath} />

      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          // Remounts when the action returns a value, so React's post-action form
          // reset does not silently clear what the user typed.
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
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? fieldErrorId("password") : undefined}
        />
        <FieldError id={fieldErrorId("password")} messages={passwordError} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
          Create one
        </Link>
      </p>
    </form>
  );
}
