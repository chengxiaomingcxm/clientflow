import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

// `redirect()` works by throwing, and `revalidatePath()` is a cache side effect;
// both are replaced so the actions can be exercised as plain functions.
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { signInAction, signOutAction, signUpAction, updateProfileAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_FORM_STATE, type AuthFormState } from "@/lib/auth/form-state";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

/**
 * Server Action suite.
 *
 * The actions are called directly with a `FormData` and a mocked Supabase client,
 * which is how the server executes them. Every case asserts the two things that
 * matter: the state returned to the form, and whether a redirect happened.
 */

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "owner-a@example.com" };

/** Thrown by the `redirect` mock to emulate Next.js' control-flow signal. */
class NavigationSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.name = "NavigationSignal";
  }
}

function stubConfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
}

function stubUnconfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

type FakeClientOptions = {
  signInError?: unknown;
  signUpError?: unknown;
  signUpSession?: unknown;
  signOutError?: unknown;
  updateError?: unknown;
  user?: typeof USER | null;
  userError?: unknown;
};

function createFakeClient(options: FakeClientOptions = {}) {
  const updateEqMock = vi.fn(async () => ({ error: options.updateError ?? null }));
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));

  const client = {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { user: null, session: null },
        error: options.signInError ?? null,
      })),
      signUp: vi.fn(async () => ({
        data: { user: null, session: options.signUpSession ?? null },
        error: options.signUpError ?? null,
      })),
      signOut: vi.fn(async () => ({ error: options.signOutError ?? null })),
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: options.userError ?? null,
      })),
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({ update: updateMock })),
  };

  return { client, updateMock, updateEqMock };
}

/** Runs an action and reports either the returned state or the redirect target. */
async function runAction(
  action: (state: AuthFormState, data: FormData) => Promise<AuthFormState>,
  data: FormData,
): Promise<{ state: AuthFormState | null; redirectTo: string | null }> {
  try {
    return { state: await action(INITIAL_AUTH_FORM_STATE, data), redirectTo: null };
  } catch (error) {
    if (error instanceof NavigationSignal) {
      return { state: null, redirectTo: error.url };
    }

    throw error;
  }
}

beforeEach(() => {
  createServerSupabaseClientMock.mockReset();
  redirectMock.mockReset();
  revalidatePathMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new NavigationSignal(url);
  });

  // `logAuthFailure` writes to console.error on the failure paths under test.
  // No test here asserts on it, so it is silenced to keep the output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const VALID_CREDENTIALS = { email: "owner@example.com", password: "correct-horse1" };

describe("signInAction", () => {
  it("rejects an invalid email before touching Supabase", async () => {
    stubConfigured();

    const { state, redirectTo } = await runAction(
      signInAction,
      formData({ ...VALID_CREDENTIALS, email: "not-an-email" }),
    );

    expect(redirectTo).toBeNull();
    expect(state?.status).toBe("error");
    expect(state?.fieldErrors.email?.length).toBeGreaterThan(0);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects an empty password", async () => {
    stubConfigured();

    const { state } = await runAction(
      signInAction,
      formData({ ...VALID_CREDENTIALS, password: "" }),
    );

    expect(state?.fieldErrors.password?.length).toBeGreaterThan(0);
  });

  it("explains a missing configuration instead of calling Supabase", async () => {
    stubUnconfigured();

    const { state, redirectTo } = await runAction(signInAction, formData(VALID_CREDENTIALS));

    expect(redirectTo).toBeNull();
    expect(state?.status).toBe("error");
    expect(state?.message).toMatch(/not configured/i);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("redirects to the dashboard on success", async () => {
    stubConfigured();
    const { client } = createFakeClient();
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { redirectTo } = await runAction(signInAction, formData(VALID_CREDENTIALS));

    expect(redirectTo).toBe("/dashboard");
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct-horse1",
    });
  });

  it("returns the user to the requested page", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(createFakeClient().client);

    const { redirectTo } = await runAction(
      signInAction,
      formData({ ...VALID_CREDENTIALS, next: "/settings" }),
    );

    expect(redirectTo).toBe("/settings");
  });

  it("refuses to honour an off-site next value", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(createFakeClient().client);

    const { redirectTo } = await runAction(
      signInAction,
      formData({ ...VALID_CREDENTIALS, next: "//evil.example" }),
    );

    expect(redirectTo).toBe("/dashboard");
  });

  it("reports rejected credentials without revealing which part was wrong", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        signInError: new AuthApiError(
          "user not found: owner@example.com",
          400,
          "invalid_credentials" as never,
        ),
      }).client,
    );

    const { state, redirectTo } = await runAction(signInAction, formData(VALID_CREDENTIALS));

    expect(redirectTo).toBeNull();
    expect(state?.message).toBe("Incorrect email or password.");
    expect(state?.message).not.toContain("owner@example.com");
  });

  it("reports an Auth outage as a temporary problem", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockRejectedValue(new TypeError("fetch failed"));

    const { state, redirectTo } = await runAction(signInAction, formData(VALID_CREDENTIALS));

    expect(redirectTo).toBeNull();
    expect(state?.message).toMatch(/temporarily unavailable/i);
    expect(state?.message).not.toContain("fetch failed");
  });
});

describe("signUpAction", () => {
  it("rejects a password that fails the policy", async () => {
    stubConfigured();

    const { state, redirectTo } = await runAction(
      signUpAction,
      formData({ email: "new@example.com", password: "short", fullName: "" }),
    );

    expect(redirectTo).toBeNull();
    expect(state?.fieldErrors.password?.length).toBeGreaterThan(0);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("creates the account and forwards the display name as metadata", async () => {
    stubConfigured();
    const { client } = createFakeClient({ signUpSession: { access_token: "token" } });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { redirectTo } = await runAction(
      signUpAction,
      formData({ email: "new@example.com", password: "abcd1234", fullName: "Ada Lovelace" }),
    );

    expect(redirectTo).toBe("/dashboard");
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "abcd1234",
      options: { data: { full_name: "Ada Lovelace" } },
    });
  });

  it("asks for email confirmation when no session is returned", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(createFakeClient().client);

    const { state, redirectTo } = await runAction(
      signUpAction,
      formData({ email: "new@example.com", password: "abcd1234", fullName: "" }),
    );

    expect(redirectTo).toBeNull();
    expect(state?.status).toBe("notice");
    expect(state?.message).toMatch(/confirm/i);
  });

  it("never reveals that an address is already registered", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        signUpError: new AuthApiError(
          "User already registered",
          422,
          "user_already_exists" as never,
        ),
      }).client,
    );

    const { state, redirectTo } = await runAction(
      signUpAction,
      formData({ email: "taken@example.com", password: "abcd1234", fullName: "" }),
    );

    expect(redirectTo).toBeNull();
    expect(state?.status).toBe("error");
    expect(state?.message).not.toMatch(/already registered/i);
    expect(state?.message).not.toContain("taken@example.com");
  });

  it("honours a safe next path after a successful sign-up", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({ signUpSession: { access_token: "token" } }).client,
    );

    const { redirectTo } = await runAction(
      signUpAction,
      formData({
        email: "new@example.com",
        password: "abcd1234",
        fullName: "",
        next: "/settings",
      }),
    );

    expect(redirectTo).toBe("/settings");
  });
});

describe("signOutAction", () => {
  it("signs the user out and returns to the login page", async () => {
    stubConfigured();
    const { client } = createFakeClient();
    createServerSupabaseClientMock.mockResolvedValue(client);

    await expect(signOutAction()).rejects.toThrow(NavigationSignal);

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("still redirects when Supabase cannot be reached", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(signOutAction()).rejects.toThrow(NavigationSignal);

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("does not call Supabase when it is not configured", async () => {
    stubUnconfigured();

    await expect(signOutAction()).rejects.toThrow(NavigationSignal);

    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});

describe("updateProfileAction", () => {
  it("rejects a blank display name before touching the database", async () => {
    stubConfigured();

    const { state } = await runAction(updateProfileAction, formData({ fullName: "   " }));

    expect(state?.fieldErrors.fullName?.length).toBeGreaterThan(0);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(createFakeClient({ user: null }).client);

    const { state } = await runAction(updateProfileAction, formData({ fullName: "Ada" }));

    expect(state?.status).toBe("error");
    expect(state?.message).toMatch(/session has expired/i);
  });

  it("updates only the caller's own profile row", async () => {
    stubConfigured();
    const { client, updateMock, updateEqMock } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(
      updateProfileAction,
      formData({ fullName: "  Ada Lovelace  " }),
    );

    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith({ full_name: "Ada Lovelace" });
    // Scoped to the caller's own row, in addition to the RLS policy.
    expect(updateEqMock).toHaveBeenCalledWith("user_id", USER.id);
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
    expect(state?.status).toBe("notice");
    expect(state?.message).toBe("Profile updated.");
  });

  it("reports a database failure without leaking it", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        user: USER,
        updateError: { message: "permission denied for table profiles" },
      }).client,
    );

    const { state } = await runAction(updateProfileAction, formData({ fullName: "Ada" }));

    expect(state?.status).toBe("error");
    expect(state?.message).not.toContain("permission denied");
  });
});
