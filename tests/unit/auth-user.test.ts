import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { getCurrentUser, requireAuthenticatedUser } from "@/lib/auth/user";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

/**
 * `getCurrentUser` suite.
 *
 * The important behaviour is the distinction between "signed out" and "the Auth
 * service is broken": both must deny access, but only the latter is a fault.
 */

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "owner-a@example.com" };

/**
 * `restoreMocks` is enabled in vitest.config.mts, so console spies are created
 * per test instead of once at module scope (a module-scope spy would already
 * have been restored by the time the test body runs).
 */
function spyOnConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

function stubConfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
}

function stubUnconfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

/**
 * Minimal stand-in for the server Supabase client. `getSession` records calls
 * but is never expected to be used for authorization.
 */
function fakeClient(result: { user?: typeof USER | null; error?: unknown }) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: result.user ?? null },
        error: result.error ?? null,
      })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
  };
}

beforeEach(() => {
  createServerSupabaseClientMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCurrentUser", () => {
  it("reports a missing configuration instead of throwing", async () => {
    stubUnconfigured();

    const result = await getCurrentUser();

    expect(result.status).toBe("not_configured");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("returns the verified user", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(fakeClient({ user: USER }));

    const result = await getCurrentUser();

    expect(result).toEqual({
      status: "authenticated",
      user: { id: USER.id, email: USER.email },
    });
  });

  it("verifies the session with getUser and never getSession", async () => {
    stubConfigured();
    const client = fakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    await getCurrentUser();

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it("treats an empty response as signed out", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(fakeClient({ user: null }));

    expect((await getCurrentUser()).status).toBe("unauthenticated");
  });

  it("treats a missing session as signed out without logging an error", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      fakeClient({ error: new AuthSessionMissingError() }),
    );
    const errorSpy = spyOnConsoleError();

    const result = await getCurrentUser();

    expect(result.status).toBe("unauthenticated");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fails closed and logs when the Auth service returns an error", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      fakeClient({
        error: new AuthApiError("internal detail", 503, "unexpected_failure" as never),
      }),
    );
    const errorSpy = spyOnConsoleError();

    const result = await getCurrentUser();

    // Crucially *not* "unauthenticated": a broken Auth service is a fault.
    expect(result.status).toBe("unavailable");
    expect(result.status === "unavailable" && result.failure.code).toBe("service_unavailable");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain("internal detail");
  });

  it("fails closed when the client cannot be constructed", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockRejectedValue(new Error("boom"));
    const errorSpy = spyOnConsoleError();

    const result = await getCurrentUser();

    expect(result.status).toBe("unavailable");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockRejectedValue("not even an Error");

    await expect(getCurrentUser()).resolves.toMatchObject({ status: "unavailable" });
  });
});

describe("requireAuthenticatedUser", () => {
  it("authorizes a verified user", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(fakeClient({ user: USER }));

    const result = await requireAuthenticatedUser("update_profile");

    expect(result).toMatchObject({ ok: true, user: { id: USER.id } });
  });

  it("refuses a signed-out caller", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(fakeClient({ user: null }));

    const result = await requireAuthenticatedUser("update_profile");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("session_expired");
  });

  it("keeps the failure code when the Auth service is unavailable", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await requireAuthenticatedUser("update_profile");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("service_unavailable");
    // The operation is recorded for the log line.
    expect(result.ok === false && result.failure.diagnostic.operation).toBe("update_profile");
  });

  it("refuses when Supabase is not configured", async () => {
    stubUnconfigured();

    const result = await requireAuthenticatedUser("update_profile");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("not_configured");
  });
});
