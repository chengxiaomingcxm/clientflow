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

import { createClientAction, deleteClientAction, updateClientAction } from "@/lib/clients/actions";
import { INITIAL_CLIENT_FORM_STATE, type ClientFormState } from "@/lib/clients/form-state";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

/**
 * Client Server Action suite.
 *
 * The actions run on the server with a `FormData` and the Supabase client, which
 * is exactly how Next.js invokes them. Every case asserts the two things that
 * matter for the security boundary: who is allowed to proceed, and what ends up
 * in the statement sent to the database.
 */

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "owner-a@example.com" };
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT_ID = "44444444-4444-4444-8444-444444444444";

const CLIENT_ROW = {
  id: CLIENT_ID,
  name: "Acme Corporation",
  email: "billing@acme.example",
  phone: null,
  company: "Acme Ltd",
  notes: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

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

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

/** A valid create/edit submission. */
function validSubmission(overrides: Record<string, string> = {}) {
  return formData({
    name: "Acme Corporation",
    email: "billing@acme.example",
    phone: "",
    company: "Acme Ltd",
    notes: "",
    ...overrides,
  });
}

type StubResult = { data: unknown; error: unknown };

type QueryStub = {
  select: (columns: string) => QueryStub;
  insert: (payload: unknown) => QueryStub;
  update: (payload: unknown) => QueryStub;
  delete: () => QueryStub;
  eq: (column: string, value: unknown) => QueryStub;
  order: (column: string, options: unknown) => QueryStub;
  single: () => Promise<StubResult>;
  maybeSingle: () => Promise<StubResult>;
  then: <TResult1 = StubResult, TResult2 = never>(
    onFulfilled?: ((value: StubResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

type FakeOptions = {
  user?: typeof USER | null;
  userError?: unknown;
  result?: StubResult;
  client?: unknown;
};

/**
 * One fake Supabase client serving both layers: `auth.getUser()` for the session
 * check and the `from("clients")` query builder for the DAL.
 */
function createFakeClient(options: FakeOptions = {}) {
  const calls = {
    tables: [] as string[],
    insert: undefined as unknown,
    update: undefined as unknown,
    deleted: false,
    filters: [] as [string, unknown][],
  };

  const result: StubResult = options.result ?? {
    data: options.client ?? CLIENT_ROW,
    error: null,
  };

  const stub: QueryStub = {
    select: () => stub,
    insert: (payload) => {
      calls.insert = payload;
      return stub;
    },
    update: (payload) => {
      calls.update = payload;
      return stub;
    },
    delete: () => {
      calls.deleted = true;
      return stub;
    },
    eq: (column, value) => {
      calls.filters.push([column, value]);
      return stub;
    },
    order: () => stub,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: options.userError ?? null,
      })),
    },
    from: (table: string) => {
      calls.tables.push(table);
      return stub;
    },
  };

  return { client, calls };
}

/** Runs an action and reports either the returned state or the redirect target. */
async function runAction(
  action: (state: ClientFormState, data: FormData) => Promise<ClientFormState>,
  data: FormData,
): Promise<{ state: ClientFormState | null; redirectTo: string | null }> {
  try {
    return { state: await action(INITIAL_CLIENT_FORM_STATE, data), redirectTo: null };
  } catch (error) {
    if (error instanceof NavigationSignal) {
      return { state: null, redirectTo: error.url };
    }

    throw error;
  }
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createServerSupabaseClientMock.mockReset();
  redirectMock.mockReset();
  revalidatePathMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new NavigationSignal(url);
  });
  // Server-side failures are logged for operators; the tests assert what is (and
  // is not) in that line, so the real console is not needed.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
});

describe("createClientAction", () => {
  it("rejects invalid input before authenticating or touching the database", async () => {
    stubConfigured();

    const { state } = await runAction(
      createClientAction,
      validSubmission({ name: "   ", email: "not-an-email" }),
    );

    expect(state?.status).toBe("error");
    expect(state?.fieldErrors.name?.length).toBeGreaterThan(0);
    expect(state?.fieldErrors.email?.length).toBeGreaterThan(0);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller without writing anything", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: null });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state, redirectTo } = await runAction(createClientAction, validSubmission());

    expect(state?.status).toBe("error");
    expect(state?.message).toMatch(/session has expired/i);
    expect(calls.tables).toEqual([]);
    expect(redirectTo).toBeNull();
  });

  it("writes the session owner and opens the new client", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { redirectTo } = await runAction(createClientAction, validSubmission());

    expect(calls.tables).toEqual(["clients"]);
    expect(calls.insert).toEqual({
      name: "Acme Corporation",
      email: "billing@acme.example",
      phone: null,
      company: "Acme Ltd",
      notes: null,
      user_id: USER.id,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/clients");
    expect(redirectTo).toBe(`/clients/${CLIENT_ID}`);
  });

  it("ignores an ownership value submitted with the form", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    await runAction(
      createClientAction,
      validSubmission({ user_id: OTHER_USER_ID, owner_id: OTHER_USER_ID }),
    );

    expect(calls.insert).toMatchObject({ user_id: USER.id });
    expect(JSON.stringify(calls.insert)).not.toContain(OTHER_USER_ID);
  });

  it("echoes the submitted values back so nothing has to be retyped", async () => {
    stubConfigured();
    const { client } = createFakeClient({
      user: USER,
      result: { data: null, error: { code: "23514", message: "rejected" } },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(
      createClientAction,
      validSubmission({ name: "  Globex  ", company: "Globex BV" }),
    );

    expect(state).toMatchObject({
      status: "error",
      values: { name: "  Globex  ", company: "Globex BV" },
    });
  });

  it("reports a rejected payload without leaking the constraint name", async () => {
    stubConfigured();
    const { client } = createFakeClient({
      user: USER,
      result: {
        data: null,
        error: {
          code: "23514",
          message: 'new row for relation "clients" violates check constraint "clients_name_check"',
        },
      },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state, redirectTo } = await runAction(createClientAction, validSubmission());

    expect(state?.status).toBe("error");
    expect(state?.message).toBe(
      "Those details were not accepted. Check the entries and try again.",
    );
    expect(state?.message).not.toContain("clients_name_check");
    expect(redirectTo).toBeNull();
  });
});

describe("updateClientAction", () => {
  it("rejects invalid input before authenticating", async () => {
    stubConfigured();

    const { state } = await runAction(
      updateClientAction,
      validSubmission({ clientId: CLIENT_ID, name: "" }),
    );

    expect(state?.status).toBe("error");
    expect(state?.fieldErrors.name?.length).toBeGreaterThan(0);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: null });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(updateClientAction, validSubmission({ clientId: CLIENT_ID }));

    expect(state?.status).toBe("error");
    expect(state?.message).toMatch(/session has expired/i);
    expect(calls.tables).toEqual([]);
  });

  it("updates the row scoped to the caller and returns to the detail page", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { redirectTo } = await runAction(
      updateClientAction,
      validSubmission({ clientId: CLIENT_ID }),
    );

    expect(calls.filters).toEqual([
      ["id", CLIENT_ID],
      ["user_id", USER.id],
    ]);
    expect(calls.update).toMatchObject({ name: "Acme Corporation" });
    expect(calls.update).not.toHaveProperty("user_id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/clients");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`);
    expect(redirectTo).toBe(`/clients/${CLIENT_ID}`);
  });

  it("cannot be pointed at another tenant's client", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER, result: { data: null, error: null } });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state, redirectTo } = await runAction(
      updateClientAction,
      validSubmission({ clientId: OTHER_CLIENT_ID, user_id: OTHER_USER_ID }),
    );

    // The predicate always carries the session owner as well as the id, so the
    // statement cannot match a row that belongs to somebody else.
    expect(calls.filters).toEqual([
      ["id", OTHER_CLIENT_ID],
      ["user_id", USER.id],
    ]);
    expect(state?.message).toBe("That client could not be found.");
    expect(state?.message).not.toMatch(/permission|denied|policy/i);
    expect(redirectTo).toBeNull();
  });

  it("treats a malformed client id as not found without querying the database", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(
      updateClientAction,
      validSubmission({ clientId: "not-a-uuid" }),
    );

    expect(state?.message).toBe("That client could not be found.");
    expect(calls.tables).toEqual([]);
  });
});

describe("deleteClientAction", () => {
  it("refuses a signed-out caller without deleting anything", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: null });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(deleteClientAction, formData({ clientId: CLIENT_ID }));

    expect(state?.status).toBe("error");
    expect(state?.message).toMatch(/session has expired/i);
    expect(calls.deleted).toBe(false);
  });

  it("deletes the caller's client and returns to the list", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER, client: { id: CLIENT_ID } });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { redirectTo } = await runAction(deleteClientAction, formData({ clientId: CLIENT_ID }));

    expect(calls.deleted).toBe(true);
    expect(calls.filters).toEqual([
      ["id", CLIENT_ID],
      ["user_id", USER.id],
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/clients");
    expect(redirectTo).toBe("/clients");
  });

  it("reports another tenant's client as not found and stays on the page", async () => {
    stubConfigured();
    const { client } = createFakeClient({ user: USER, result: { data: null, error: null } });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state, redirectTo } = await runAction(
      deleteClientAction,
      formData({ clientId: OTHER_CLIENT_ID }),
    );

    expect(state?.message).toBe("That client could not be found.");
    expect(redirectTo).toBeNull();
  });

  it("does not accept an id that is not a UUID", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ user: USER });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const { state } = await runAction(deleteClientAction, formData({ clientId: "1; drop table" }));

    expect(state?.message).toBe("That client could not be found.");
    expect(calls.deleted).toBe(false);
  });
});
