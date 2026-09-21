import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for browser (Client Component) code.
 *
 * Phase 0 only wires up the integration: no authentication flow, no session
 * handling and no data access are implemented yet. `@supabase/ssr`
 * (`createBrowserClient`) is used instead of `@supabase/supabase-js` directly
 * because it stores the session in cookies, which is what the server client in
 * `./server.ts` reads.
 *
 * `createBrowserClient` returns a memoised instance per project URL, so this
 * factory is cheap to call from many components.
 */
export function createBrowserSupabaseClient() {
  const env = getPublicEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
