import { z } from "zod";

/**
 * Shared validation schemas for the authentication and profile forms.
 *
 * The same schemas run in the browser (immediate feedback) and inside the
 * Server Actions (authoritative). Client-side validation is a convenience only:
 * the server always re-validates the submitted values, and the database
 * constraints in `supabase/migrations` are the final backstop.
 *
 * The numeric limits mirror the SQL constraints so the UI can never submit a
 * value the database would reject:
 *
 *  - `profiles_email_check` — 3..320 characters containing "@"
 *  - `profiles_full_name_check` — 1..120 characters after trimming
 */

export const EMAIL_MAX_LENGTH = 320;
export const FULL_NAME_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 8;
/** Supabase Auth rejects longer passwords and bcrypt only reads the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

/** Redirect targets submitted with a form; the value is sanitised before use. */
export const NEXT_PATH_MAX_LENGTH = 2048;

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .min(3, { error: "Enter a valid email address." })
  .max(EMAIL_MAX_LENGTH, { error: `Email must be at most ${EMAIL_MAX_LENGTH} characters.` })
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

/**
 * Password policy for *new* accounts.
 *
 * Deliberately not applied when signing in: an existing account may predate the
 * policy, and rejecting a correct password for being "too weak" would lock the
 * user out.
 */
export const passwordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, {
    error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  .regex(/[A-Za-z]/, { error: "Password must include at least one letter." })
  .regex(/[0-9]/, { error: "Password must include at least one number." });

/** Login only checks that something was typed, for the reason explained above. */
const loginPasswordSchema = z
  .string({ error: "Enter your password." })
  .min(1, { error: "Enter your password." })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  });

export const fullNameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, { error: "Name must be at least 1 character." })
  .max(FULL_NAME_MAX_LENGTH, {
    error: `Name must be at most ${FULL_NAME_MAX_LENGTH} characters.`,
  });

/**
 * Optional display name. An absent, empty or whitespace-only value means "not
 * given" and is normalised to `null` rather than rejected.
 */
export const optionalFullNameSchema = z
  .string()
  .trim()
  .max(FULL_NAME_MAX_LENGTH, {
    error: `Name must be at most ${FULL_NAME_MAX_LENGTH} characters.`,
  })
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const nextPathSchema = z.string().max(NEXT_PATH_MAX_LENGTH).optional();

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  next: nextPathSchema,
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: optionalFullNameSchema,
  next: nextPathSchema,
});

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
