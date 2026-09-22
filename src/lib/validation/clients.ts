import { z } from "zod";

/**
 * Shared validation schemas for client records.
 *
 * The same schema is used by the create form, the edit form and both Server
 * Actions, so "create" and "edit" can never drift apart: a value that can be
 * stored once can be stored again. Client-side validation is a convenience only;
 * the Server Action always re-validates what it received.
 *
 * The numeric limits mirror the SQL constraints in
 * `supabase/migrations/20260921000000_init_clientflow_schema.sql` so the form can
 * never submit a value the database would reject:
 *
 *  - `clients_name_check`    — 1..200 characters after trimming
 *  - `clients_email_check`   — NULL, or 3..320 characters with an "@" that is not
 *                              the first character
 *  - `clients_phone_check`   — NULL, or at most 40 characters
 *  - `clients_company_check` — NULL, or at most 200 characters
 *
 * `notes` has no database limit. `CLIENT_NOTES_MAX_LENGTH` is an
 * application-level bound on how much free text a form may submit; it is
 * deliberately lower than "unlimited" and is not a substitute for a constraint.
 *
 * Every optional field normalises an absent or blank value to `null` rather than
 * storing an empty string, so "not given" has exactly one representation — the
 * same rule the profile display name already follows.
 */

export const CLIENT_NAME_MAX_LENGTH = 200;
export const CLIENT_EMAIL_MAX_LENGTH = 320;
export const CLIENT_PHONE_MAX_LENGTH = 40;
export const CLIENT_COMPANY_MAX_LENGTH = 200;
export const CLIENT_NOTES_MAX_LENGTH = 2000;

/** Name is the only required field: a client with no name cannot be identified. */
export const clientNameSchema = z
  .string({ error: "Enter a client name." })
  .trim()
  .min(1, { error: "Client name must be at least 1 character." })
  .max(CLIENT_NAME_MAX_LENGTH, {
    error: `Client name must be at most ${CLIENT_NAME_MAX_LENGTH} characters.`,
  });

/**
 * Builds an optional free-text field.
 *
 * `default("")` (rather than `optional()`) means a missing form entry, an empty
 * string and a whitespace-only string all end up as `null`, so the three ways of
 * saying "nothing" cannot produce three different stored values.
 */
function optionalTextSchema(maxLength: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(maxLength, { error: tooLongMessage })
    .default("")
    .transform((value) => (value.length > 0 ? value : null));
}

/**
 * Mirrors `clients_email_check`. Client emails are stored as entered (only
 * trimmed): unlike an account email they are contact data, not an identity, so
 * the local part's case is preserved.
 */
function isStorableEmailAddress(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= CLIENT_EMAIL_MAX_LENGTH &&
    value.indexOf("@") > 0 &&
    value.indexOf("@") < value.length - 1
  );
}

export const optionalClientEmailSchema = optionalTextSchema(
  CLIENT_EMAIL_MAX_LENGTH,
  `Email must be at most ${CLIENT_EMAIL_MAX_LENGTH} characters.`,
).refine((value) => value === null || isStorableEmailAddress(value), {
  error: "Enter a valid email address.",
});

export const optionalClientPhoneSchema = optionalTextSchema(
  CLIENT_PHONE_MAX_LENGTH,
  `Phone must be at most ${CLIENT_PHONE_MAX_LENGTH} characters.`,
);

export const optionalClientCompanySchema = optionalTextSchema(
  CLIENT_COMPANY_MAX_LENGTH,
  `Company must be at most ${CLIENT_COMPANY_MAX_LENGTH} characters.`,
);

export const optionalClientNotesSchema = optionalTextSchema(
  CLIENT_NOTES_MAX_LENGTH,
  `Notes must be at most ${CLIENT_NOTES_MAX_LENGTH} characters.`,
);

/**
 * The one payload for creating *and* updating a client.
 *
 * Note what is absent: there is no `user_id`, `owner_id` or `id` field. Ownership
 * is never accepted from the browser — the Server Action takes it from the
 * verified session and the DAL applies it to the statement.
 */
export const clientSchema = z.object({
  name: clientNameSchema,
  email: optionalClientEmailSchema,
  phone: optionalClientPhoneSchema,
  company: optionalClientCompanySchema,
  notes: optionalClientNotesSchema,
});

/** Primary key of a client, as it appears in a URL or a hidden form field. */
export const clientIdSchema = z.uuid({ error: "That client reference is not valid." });

export type ClientInput = z.infer<typeof clientSchema>;
export type ClientIdInput = z.infer<typeof clientIdSchema>;

/** `true` when `value` can be used as a client primary key. */
export function isClientId(value: string): boolean {
  return clientIdSchema.safeParse(value).success;
}
