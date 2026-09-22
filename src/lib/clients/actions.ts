"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAuthFailure } from "@/lib/auth/errors";
import { readFormString, toFieldErrors } from "@/lib/forms/form-state";
import { requireAuthenticatedUser } from "@/lib/auth/user";
import { clientSchema } from "@/lib/validation/clients";

import { errorState, readClientFormValues, type ClientFormState } from "./form-state";
import { createClient, deleteClient, updateClient } from "./queries";

/**
 * Client Server Actions.
 *
 * Everything security-relevant happens here and in the DAL, on the server:
 *
 *  - the submitted values are re-validated with the shared Zod schema (the
 *    browser copy is only a convenience);
 *  - `requireAuthenticatedUser` fails closed unless the caller has a session that
 *    Supabase Auth has verified, and the resulting `user.id` — never a form
 *    field — becomes the row's owner;
 *  - the database's Row Level Security policies are the final boundary, so a
 *    mistake here still cannot read or write another tenant's rows;
 *  - failures are mapped to fixed, safe sentences by `./errors`; upstream error
 *    text never reaches the browser.
 *
 * `redirect()` throws a control-flow signal (`NEXT_REDIRECT`), so it is called
 * outside any `try`/`catch` — the DAL returns failures as values precisely so
 * these actions never need one.
 */

const CHECK_FIELDS_MESSAGE = "Check the highlighted fields and try again.";

/**
 * Creates a client owned by the signed-in user and opens its detail page.
 *
 * The form carries no ownership field: `auth.user.id` is the only source of
 * `user_id`, so a tampered request cannot create a row in somebody else's
 * account.
 */
export async function createClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const submitted = readClientFormValues(formData);
  const parsed = clientSchema.safeParse(submitted);

  if (!parsed.success) {
    return errorState(CHECK_FIELDS_MESSAGE, {
      fieldErrors: toFieldErrors(parsed.error),
      values: submitted,
    });
  }

  const auth = await requireAuthenticatedUser("create_client");

  if (!auth.ok) {
    logAuthFailure(auth.failure);

    return errorState(auth.failure.message, { values: submitted });
  }

  const result = await createClient(auth.user.id, parsed.data);

  if (!result.ok) {
    return errorState(result.failure.message, { values: submitted });
  }

  revalidatePath("/clients");

  redirect(`/clients/${result.client.id}`);
}

/**
 * Updates an existing client and returns to its detail page.
 *
 * The id comes from a hidden field, which is safe: it is only a selector. A
 * value that is malformed, does not exist, or belongs to another tenant is
 * rejected by the DAL as `not_found` — all three produce the same answer, so the
 * response cannot be used to discover whether a client exists elsewhere.
 */
export async function updateClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const submitted = readClientFormValues(formData);
  const submittedId = readFormString(formData, "clientId");
  const parsed = clientSchema.safeParse(submitted);

  if (!parsed.success) {
    return errorState(CHECK_FIELDS_MESSAGE, {
      fieldErrors: toFieldErrors(parsed.error),
      values: submitted,
    });
  }

  const auth = await requireAuthenticatedUser("update_client");

  if (!auth.ok) {
    logAuthFailure(auth.failure);

    return errorState(auth.failure.message, { values: submitted });
  }

  const result = await updateClient(auth.user.id, submittedId, parsed.data);

  if (!result.ok) {
    return errorState(result.failure.message, { values: submitted });
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${result.client.id}`);

  redirect(`/clients/${result.client.id}`);
}

/**
 * Deletes a client and returns to the list.
 *
 * There is no confirmation step here on purpose: confirming is a user-interface
 * concern (`DeleteClientForm` requires a second, explicit click), while the
 * server-side guarantee is that the statement can only ever match a row owned by
 * the caller — deleting somebody else's client is impossible, not merely
 * hard to trigger.
 */
export async function deleteClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const submittedId = readFormString(formData, "clientId");

  const auth = await requireAuthenticatedUser("delete_client");

  if (!auth.ok) {
    logAuthFailure(auth.failure);

    return errorState(auth.failure.message);
  }

  const result = await deleteClient(auth.user.id, submittedId);

  if (!result.ok) {
    return errorState(result.failure.message);
  }

  revalidatePath("/clients");

  redirect("/clients");
}
