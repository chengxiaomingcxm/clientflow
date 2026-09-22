"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldError, FormAlert, fieldErrorId } from "@/components/forms/form-feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_CLIENT_FORM_VALUES,
  INITIAL_CLIENT_FORM_STATE,
  type ClientFormState,
  type ClientFormValues,
} from "@/lib/clients/form-state";
import { CLIENT_NOTES_MAX_LENGTH } from "@/lib/validation/clients";
import { cn } from "@/lib/utils";

/**
 * The one client form, used for both creating and editing.
 *
 * Create and edit share the component, the state shape and the Zod schema, so the
 * two screens cannot drift apart: any value one accepts the other accepts.
 *
 * The Server Action is injected as a prop (a Server Component passes
 * `createClientAction` or `updateClientAction`), which keeps this component free
 * of any knowledge about which operation it is performing. Validation lives in
 * the action; `noValidate` disables the browser's own messages so the user always
 * sees the same, server-owned wording.
 */
type ClientFormProps = {
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  /** Existing values when editing; empty fields when creating. */
  initialValues?: ClientFormValues;
  /** Set when editing: travels in a hidden field as the row selector only. */
  clientId?: string;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function ClientForm({
  action,
  initialValues = EMPTY_CLIENT_FORM_VALUES,
  clientId,
  submitLabel,
  pendingLabel,
  cancelHref,
}: ClientFormProps) {
  const [state, formAction, isPending] = useActionState(action, {
    ...INITIAL_CLIENT_FORM_STATE,
    values: initialValues,
  });

  const { fieldErrors } = state;
  const nameError = fieldErrors.name;
  const emailError = fieldErrors.email;
  const phoneError = fieldErrors.phone;
  const companyError = fieldErrors.company;
  const notesError = fieldErrors.notes;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* The only thing a browser may choose here is *which* client is edited;
          ownership always comes from the verified session, server-side. */}
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}

      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="name">Client name</Label>
        <Input
          // Remounts when the action returns a value, so React's post-action form
          // reset does not silently clear what the user typed.
          key={`name-${state.values.name}`}
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          required
          defaultValue={state.values.name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? fieldErrorId("name") : undefined}
        />
        <FieldError id={fieldErrorId("name")} messages={nameError} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            key={`company-${state.values.company}`}
            id="company"
            name="company"
            type="text"
            autoComplete="organization"
            defaultValue={state.values.company}
            aria-invalid={companyError ? true : undefined}
            aria-describedby={companyError ? fieldErrorId("company") : undefined}
          />
          <FieldError id={fieldErrorId("company")} messages={companyError} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            key={`email-${state.values.email}`}
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={state.values.email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? fieldErrorId("email") : undefined}
          />
          <FieldError id={fieldErrorId("email")} messages={emailError} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          key={`phone-${state.values.phone}`}
          id="phone"
          name="phone"
          type="tel"
          autoComplete="off"
          defaultValue={state.values.phone}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? fieldErrorId("phone") : undefined}
        />
        <FieldError id={fieldErrorId("phone")} messages={phoneError} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          key={`notes-${state.values.notes}`}
          id="notes"
          name="notes"
          rows={4}
          defaultValue={state.values.notes}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={
            [notesError ? fieldErrorId("notes") : undefined, "notes-hint"]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <p id="notes-hint" className="text-sm text-muted-foreground">
          Optional. Anything worth remembering, up to {CLIENT_NOTES_MAX_LENGTH} characters.
        </p>
        <FieldError id={fieldErrorId("notes")} messages={notesError} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>

        <Link href={cancelHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
