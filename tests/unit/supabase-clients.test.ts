import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createServerSupabaseClient, createSupabaseCookieAdapter } from "@/lib/supabase/server";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

type CookieStore = Parameters<typeof createSupabaseCookieAdapter>[0];

function createFakeCookieStore(overrides: { set?: (name: string, value: string) => void } = {}) {
  const store = {
    getAll: vi.fn(() => [{ name: "sb-auth-token", value: "fake-session" }]),
    set: vi.fn(overrides.set),
  };

  return store;
}

function stubPublicEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
}

afterEach(() => {
  vi.unstubAllEnvs();
  cookiesMock.mockReset();
});

describe("createBrowserSupabaseClient", () => {
  it("builds a browser client from the public environment variables", () => {
    stubPublicEnv();

    const client = createBrowserSupabaseClient();

    expect(typeof client.from).toBe("function");
    expect(client.auth).toBeDefined();
  });

  it("fails loudly when the public environment is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(() => createBrowserSupabaseClient()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("createServerSupabaseClient", () => {
  it("builds a server client from the request cookie store", async () => {
    stubPublicEnv();
    cookiesMock.mockResolvedValue(createFakeCookieStore());

    const client = await createServerSupabaseClient();

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(typeof client.from).toBe("function");
    expect(client.auth).toBeDefined();
  });
});

describe("createSupabaseCookieAdapter", () => {
  it("reads every cookie from the Next.js cookie store", () => {
    const store = createFakeCookieStore();

    const adapter = createSupabaseCookieAdapter(store as unknown as CookieStore);

    expect(adapter.getAll()).toEqual([{ name: "sb-auth-token", value: "fake-session" }]);
  });

  it("writes refreshed session cookies back to the store", () => {
    const store = createFakeCookieStore();

    const adapter = createSupabaseCookieAdapter(store as unknown as CookieStore);
    adapter.setAll([{ name: "sb-auth-token", value: "refreshed", options: { path: "/" } }]);

    expect(store.set).toHaveBeenCalledExactlyOnceWith("sb-auth-token", "refreshed", { path: "/" });
  });

  it("does not crash rendering when the store is read-only (Server Component)", () => {
    const store = createFakeCookieStore({
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action or Route Handler");
      },
    });

    const adapter = createSupabaseCookieAdapter(store as unknown as CookieStore);

    expect(() =>
      adapter.setAll([{ name: "sb-auth-token", value: "refreshed", options: {} }]),
    ).not.toThrow();
  });
});
