import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicEnv } from "@/lib/env";
import { ANON_KEY, PUBLIC_ENV, SECRET_KEY, SERVICE_ROLE_KEY, SUPABASE_URL } from "../fixtures/env";

type EnvOverrides = Partial<Record<keyof typeof PUBLIC_ENV, string | undefined>>;

/**
 * Stubs the public environment. Overrides replace the defaults, including when
 * they are explicitly `undefined` (which is how a missing variable is
 * simulated).
 */
function stubPublicEnv(overrides: EnvOverrides = {}) {
  const values = { ...PUBLIC_ENV, ...overrides };

  for (const [name, value] of Object.entries(values)) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicEnv", () => {
  it("returns the validated public configuration", () => {
    stubPublicEnv();

    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    });
  });

  it("fails with an actionable message when the URL is missing", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined });

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*\.env\.example/);
  });

  it("fails when the anon key is missing", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined });

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("fails when the URL is not a URL", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });

    expect(() => getPublicEnv()).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL must be the full project URL/,
    );
  });

  it("rejects a legacy service_role JWT placed in the public anon key variable", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_ROLE_KEY });

    expect(() => getPublicEnv()).toThrowError(/secret\/service-role key/);
  });

  it("rejects an sb_secret_ key placed in the public anon key variable", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_KEY });

    expect(() => getPublicEnv()).toThrowError(/secret\/service-role key/);
  });

  it("accepts a publishable (anon) key", () => {
    stubPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY });

    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(ANON_KEY);
  });
});
