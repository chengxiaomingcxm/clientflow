import { z } from "zod";

/**
 * Public (browser-safe) environment configuration.
 *
 * Only `NEXT_PUBLIC_*` variables are used here: they are inlined into the
 * client bundle by Next.js. Server-only secrets must never be added to this
 * schema.
 *
 * Parsing is deliberately lazy (it happens when a Supabase client is created,
 * not at module load time) so that `next build` and unit tests can run without
 * a real Supabase project.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be the full project URL, e.g. https://<ref>.supabase.co",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({
      error:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY is required (Supabase dashboard -> Project Settings -> API -> anon/public key)",
    })
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY must not be empty" })
    .refine((value) => !looksLikeSecretKey(value), {
      error:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a secret/service-role key. Secret keys bypass Row Level Security and must never be sent to the browser.",
    }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Reads and validates the public environment variables from `process.env`.
 * Throws an aggregated, human-readable error when configuration is missing or
 * unsafe, so misconfiguration fails immediately and loudly.
 */
export function getPublicEnv(): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw new Error(
      `Invalid ClientFlow environment configuration:\n${z.prettifyError(result.error)}\n` +
        "Copy .env.example to .env.local and fill in your own Supabase project values.",
    );
  }

  return result.data;
}

/**
 * Guards against a Supabase secret key being pasted into a public variable.
 * Detects the newer `sb_secret_*` format and legacy JWTs whose payload has
 * `"role": "service_role"`. Anything undecodable is treated as harmless so
 * that the guard never blocks a legitimate publishable key.
 */
function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) {
    return true;
  }

  const payload = key.split(".")[1];
  if (!payload) {
    return false;
  }

  try {
    const decoded: unknown = JSON.parse(decodeBase64Url(payload));
    return (
      typeof decoded === "object" &&
      decoded !== null &&
      (decoded as { role?: unknown }).role === "service_role"
    );
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  return atob(base64.padEnd(base64.length + padding, "="));
}
