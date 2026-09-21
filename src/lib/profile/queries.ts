import "server-only";

import {
  createAuthFailure,
  describeAuthFailure,
  logAuthFailure,
  type AuthFailure,
} from "@/lib/auth/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Reads the signed-in user's own profile.
 *
 * The query is scoped by `user_id` **and** protected by the owner-only Row Level
 * Security policy on `public.profiles`, so it can only ever return the caller's
 * row even if the `user_id` predicate were removed.
 */

export type ProfileSummary = {
  email: string;
  fullName: string | null;
};

export type ProfileResult =
  { ok: true; profile: ProfileSummary } | { ok: false; failure: AuthFailure };

export async function getOwnProfile(userId: string): Promise<ProfileResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      const failure = describeAuthFailure(error, "load_user");
      logAuthFailure(failure);

      return { ok: false, failure };
    }

    if (!data) {
      // The `on_auth_user_created` trigger creates this row at sign-up, so a
      // missing row means something is genuinely wrong. Report it rather than
      // rendering a form that cannot save.
      const failure = createAuthFailure("unexpected", "load_user");
      logAuthFailure(failure);

      return { ok: false, failure };
    }

    return { ok: true, profile: { email: data.email, fullName: data.full_name } };
  } catch (error) {
    const failure = describeAuthFailure(error, "load_user");
    logAuthFailure(failure);

    return { ok: false, failure };
  }
}
