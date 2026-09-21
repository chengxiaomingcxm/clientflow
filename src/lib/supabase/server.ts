import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** The cookie store of the current request, as exposed by `next/headers`. */
type SupabaseCookieStore = Awaited<ReturnType<typeof cookies>>;

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Adapts Next.js' cookie store to the interface expected by `@supabase/ssr`.
 * Extracted so it can be unit tested directly (see
 * `tests/unit/supabase-clients.test.ts`).
 */
export function createSupabaseCookieAdapter(cookieStore: SupabaseCookieStore) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: CookieToSet[]) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components can only read cookies. Refreshed session cookies are
        // written by the auth proxy introduced in Phase 1, so this branch is not
        // reachable in normal operation. Ignoring the failure keeps rendering
        // possible instead of crashing the request.
      }
    },
  };
}

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * The client reads the Supabase auth cookies from the incoming request, so it
 * acts with the permissions of the signed-in user and is therefore subject to
 * Row Level Security (see `supabase/migrations`).
 *
 * `import "server-only"` turns any accidental client-side import into a build
 * error, and the anon key used here is never a secret: authorization is
 * enforced by RLS in the database.
 *
 * Phase 0 only wires up the integration; session refreshing (Next.js `proxy`)
 * and the sign-in/sign-out flows belong to Phase 1.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: createSupabaseCookieAdapter(cookieStore) },
  );
}
