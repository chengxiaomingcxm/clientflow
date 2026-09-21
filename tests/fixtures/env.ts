/**
 * Shared test fixtures.
 *
 * These values are obviously fake placeholders: no real Supabase project or
 * credential is ever referenced by the test suite.
 */

export const SUPABASE_URL = "https://clientflow-test.supabase.co";

/**
 * A syntactically valid JWT whose payload has `"role": "anon"`, i.e. what a
 * real Supabase publishable key looks like. The signature is meaningless.
 */
export const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.fake-signature";

/** JWT payload carrying the privileged `service_role`. Must never be public. */
export const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.fake-signature";

/** New-style Supabase secret key prefix (never browser-safe). */
export const SECRET_KEY = "sb_secret_placeholder_value";

export const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
} as const;
