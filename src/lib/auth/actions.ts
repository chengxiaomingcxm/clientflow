"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isPublicEnvConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema, updateProfileSchema } from "@/lib/validation/auth";

import { createAuthFailure, describeAuthFailure, logAuthFailure } from "./errors";
import {
  type AuthFormState,
  errorState,
  noticeState,
  readFormString,
  toFieldErrors,
} from "./form-state";
import { DEFAULT_AUTHENTICATED_PATH, resolveNextPath } from "./redirect";
import { requireAuthenticatedUser } from "./user";

/**
 * Authentication Server Actions.
 *
 * Everything security-relevant happens here, on the server:
 *
 *  - input is re-validated with the shared Zod schemas (the browser copy is only
 *    a convenience);
 *  - credentials are exchanged for a session by the server Supabase client, so
 *    the session cookie is written with `httpOnly`-equivalent server control and
 *    never touched by client code;
 *  - failures are mapped to safe messages by `./errors` and logged without
 *    credentials.
 *
 * `redirect()` throws a control-flow signal (`NEXT_REDIRECT`), so it is always
 * called *outside* `try`/`catch` — otherwise the redirect would be swallowed as
 * an error.
 */

const CHECK_FIELDS_MESSAGE = "Check the highlighted fields and try again.";

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submittedEmail = readFormString(formData, "email");

  const parsed = loginSchema.safeParse({
    email: submittedEmail,
    password: readFormString(formData, "password"),
    next: readFormString(formData, "next") || undefined,
  });

  if (!parsed.success) {
    return errorState(CHECK_FIELDS_MESSAGE, {
      fieldErrors: toFieldErrors(parsed.error),
      values: { email: submittedEmail },
    });
  }

  if (!isPublicEnvConfigured()) {
    const failure = createAuthFailure("not_configured", "sign_in");
    logAuthFailure(failure);

    return errorState(failure.message, { values: { email: submittedEmail } });
  }

  let destination: string;

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      const failure = describeAuthFailure(error, "sign_in");
      logAuthFailure(failure);

      return errorState(failure.message, { values: { email: submittedEmail } });
    }

    destination = resolveNextPath(parsed.data.next);
  } catch (error) {
    const failure = describeAuthFailure(error, "sign_in");
    logAuthFailure(failure);

    return errorState(failure.message, { values: { email: submittedEmail } });
  }

  redirect(destination);
}

/**
 * Creates an account.
 *
 * The `profiles` row is created by the `on_auth_user_created` database trigger,
 * never by this action: a client cannot be the only mechanism that establishes
 * ownership. The display name is passed as sign-up metadata and read by the
 * trigger.
 *
 * When the Supabase project has email confirmation enabled there is no session
 * yet, so the user is told to confirm their address instead of being redirected.
 */
export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submittedEmail = readFormString(formData, "email");
  const submittedFullName = readFormString(formData, "fullName");
  const submitted = { email: submittedEmail, fullName: submittedFullName };

  const parsed = registerSchema.safeParse({
    email: submittedEmail,
    password: readFormString(formData, "password"),
    fullName: submittedFullName,
    next: readFormString(formData, "next") || undefined,
  });

  if (!parsed.success) {
    return errorState(CHECK_FIELDS_MESSAGE, {
      fieldErrors: toFieldErrors(parsed.error),
      values: submitted,
    });
  }

  if (!isPublicEnvConfigured()) {
    const failure = createAuthFailure("not_configured", "sign_up");
    logAuthFailure(failure);

    return errorState(failure.message, { values: submitted });
  }

  let destination: string | null = null;
  let needsEmailConfirmation = false;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: parsed.data.fullName ? { data: { full_name: parsed.data.fullName } } : undefined,
    });

    if (error) {
      // A duplicate address is reported by Supabase, but the message is
      // deliberately generic so the form cannot be used to enumerate accounts.
      const failure = describeAuthFailure(error, "sign_up");
      logAuthFailure(failure);

      return errorState(failure.message, { values: submitted });
    }

    if (data.session) {
      destination = resolveNextPath(parsed.data.next);
    } else {
      needsEmailConfirmation = true;
    }
  } catch (error) {
    const failure = describeAuthFailure(error, "sign_up");
    logAuthFailure(failure);

    return errorState(failure.message, { values: submitted });
  }

  if (needsEmailConfirmation) {
    return noticeState("Account created. Check your inbox for a confirmation link, then sign in.", {
      email: parsed.data.email,
      fullName: submittedFullName,
    });
  }

  redirect(destination ?? DEFAULT_AUTHENTICATED_PATH);
}

/**
 * Signs the current user out.
 *
 * Exposed as a Server Action so the browser uses a POST request: a plain link
 * would let a prefetch or an <img> tag sign the user out.
 *
 * Failure to reach Supabase is logged but never blocks the redirect — the user
 * asked to leave, and the proxy will clear any unusable session on the next
 * request.
 */
export async function signOutAction(): Promise<void> {
  if (isPublicEnvConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        logAuthFailure(describeAuthFailure(error, "sign_out"));
      }
    } catch (error) {
      logAuthFailure(describeAuthFailure(error, "sign_out"));
    }
  }

  redirect("/login");
}

/**
 * Updates the signed-in user's display name.
 *
 * Authorization is layered: {@link requireAuthenticatedUser} fails closed unless
 * the caller has a verified session, Row Level Security restricts the UPDATE to
 * the caller's own `profiles` row, and the `user_id` predicate keeps the
 * statement scoped even if a policy were ever widened by mistake.
 */
export async function updateProfileAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submittedFullName = readFormString(formData, "fullName");
  const submitted = { fullName: submittedFullName };

  const parsed = updateProfileSchema.safeParse({ fullName: submittedFullName });

  if (!parsed.success) {
    return errorState(CHECK_FIELDS_MESSAGE, {
      fieldErrors: toFieldErrors(parsed.error),
      values: submitted,
    });
  }

  const auth = await requireAuthenticatedUser("update_profile");

  if (!auth.ok) {
    logAuthFailure(auth.failure);

    return errorState(auth.failure.message, { values: submitted });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.fullName })
      .eq("user_id", auth.user.id);

    if (error) {
      const failure = describeAuthFailure(error, "update_profile");
      logAuthFailure(failure);

      return errorState(failure.message, { values: submitted });
    }
  } catch (error) {
    const failure = describeAuthFailure(error, "update_profile");
    logAuthFailure(failure);

    return errorState(failure.message, { values: submitted });
  }

  revalidatePath("/settings");

  return noticeState("Profile updated.", { fullName: parsed.data.fullName });
}
