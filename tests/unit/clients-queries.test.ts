import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import type { ClientFailure } from "@/lib/clients/errors";
import {
  createClient,
  deleteClient,
  getClientById,
  listClients,
  updateClient,
} from "@/lib/clients/queries";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

/**
 * Clients data access suite.
 *
 * Every case asserts what the DAL sends to PostgREST — the table, the `user_id`
 * predicate, the payload — because that is where ownership and tenant isolation
 * are established. Failures are asserted to be safe: no upstream message, table
 * name, constraint name or policy name may reach the caller, and the `not_found`
 * answer must be identical for a missing row and for another tenant's row.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const NOT_A_UUID = "not-a-uuid";

const ROW = {
  id: CLIENT_ID,
  name: "Acme Corporation",
  email: "billing@acme.example",
  phone: "+44 20 7946 0000",
  company: "Acme Ltd",
  notes: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
};

const VALID_INPUT = {
  name: "Acme Corporation",
  email: "billing@acme.example",
  phone: "+44 20 7946 0000",
  company: "Acme Ltd",
  notes: null,
};

type StubResult = { data: unknown; error: unknown };

/** A thenable stand-in for the Supabase/PostgREST query builder. */
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

type StubCalls = {
  tables: string[];
  selects: string[];
  insert: unknown;
  update: unknown;
  deleted: boolean;
  filters: [string, unknown][];
  order: [string, unknown] | null;
};

function createFakeClient(result: StubResult = { data: null, error: null }) {
  const calls: StubCalls = {
    tables: [],
    selects: [],
    insert: undefined,
    update: undefined,
    deleted: false,
    filters: [],
    order: null,
  };

  const stub: QueryStub = {
    select: (columns) => {
      calls.selects.push(columns);
      return stub;
    },
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
    order: (column, options) => {
      calls.order = [column, options];
      return stub;
    },
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  const client = {
    from: (table: string) => {
      calls.tables.push(table);
      return stub;
    },
  };

  return { client, calls };
}

function stubConfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
}

function stubUnconfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

/** The failure of a call that was expected to fail. */
function failureOf(result: { ok: boolean; failure?: ClientFailure }): ClientFailure {
  if (result.ok || !result.failure) {
    throw new Error("Expected the operation to fail");
  }

  return result.failure;
}

describe("listClients", () => {
  it("scopes the query to the caller and returns camelCase clients", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ data: [ROW], error: null });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const result = await listClients(USER);

    expect(calls.tables).toEqual(["clients"]);
    expect(calls.filters).toEqual([["user_id", USER]]);
    expect(calls.order).toEqual(["created_at", { ascending: false }]);
    expect(result).toEqual({
      ok: true,
      clients: [
        {
          id: CLIENT_ID,
          name: "Acme Corporation",
          email: "billing@acme.example",
          phone: "+44 20 7946 0000",
          company: "Acme Ltd",
          notes: null,
          createdAt: ROW.created_at,
          updatedAt: ROW.updated_at,
        },
      ],
    });
  });

  it("does not expose the ownership column to the UI layer", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({ data: [ROW], error: null }).client,
    );

    const result = await listClients(USER);

    expect(result.ok && result.clients[0]).not.toHaveProperty("user_id");
  });

  it("treats a null payload as an empty list", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({ data: null, error: null }).client,
    );

    expect(await listClients(USER)).toEqual({ ok: true, clients: [] });
  });

  it("reports a database failure with a fixed, safe message", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        data: null,
        error: { code: "42P01", message: 'relation "public.clients" does not exist' },
      }).client,
    );

    const failure = failureOf(await listClients(USER));

    expect(failure.code).toBe("unexpected");
    expect(failure.message).toBe("Something went wrong. Please try again.");
  });

  it("logs a sanitised diagnostic instead of the upstream message", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        data: null,
        error: { code: "42P01", message: 'relation "public.clients" does not exist' },
      }).client,
    );

    await listClients(USER);

    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("[clientflow:clients] list_clients failed (unexpected)");
    expect(logged).toContain("code=42P01");
    expect(logged).not.toContain("public.clients");
  });

  it("reports missing configuration without creating a client", async () => {
    stubUnconfigured();

    expect(failureOf(await listClients(USER)).code).toBe("not_configured");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});

describe("getClientById", () => {
  it("scopes the lookup to the id and the caller", async () => {
    stubConfigured();
    const { client, calls } = createFakeClient({ data: ROW, error: null });
    createServerSupabaseClientMock.mockResolvedValue(client);

    const result = await getClientById(USER, CLIENT_ID);

    expect(calls.tables).toEqual(["clients"]);
    expect(calls.filters).toEqual([
      ["id", CLIENT_ID],
      ["user_id", USER],
    ]);
    expect(result).toMatchObject({ ok: true, client: { id: CLIENT_ID, name: "Acme Corporation" } });
  });

  it("reports a row that is not visible as not found", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({ data: null, error: null }).client,
    );

    const failure = failureOf(await getClientById(USER, CLIENT_ID));

    expect(failure.code).toBe("not_found");
    expect(failure.message).toBe("That client could not be found.");
  });

  it("answers a missing row and another tenant's row identically", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({ data: null, error: null }).client,
    );

    const missing = await getClientById(USER, CLIENT_ID);
    const foreign = await getClientById(USER, OTHER_CLIENT_ID);

    expect(missing).toEqual(foreign);
  });

  describe("createClient", () => {
    it("writes the session owner, not a submitted one", async () => {
      stubConfigured();
      const { client, calls } = createFakeClient({ data: ROW, error: null });
      createServerSupabaseClientMock.mockResolvedValue(client);

      const result = await createClient(USER, VALID_INPUT);

      expect(calls.tables).toEqual(["clients"]);
      expect(calls.insert).toEqual({
        name: "Acme Corporation",
        email: "billing@acme.example",
        phone: "+44 20 7946 0000",
        company: "Acme Ltd",
        notes: null,
        user_id: USER,
      });
      expect(result).toMatchObject({ ok: true, client: { id: CLIENT_ID } });
    });

    it("maps a check-constraint violation to a validation failure", async () => {
      stubConfigured();
      createServerSupabaseClientMock.mockResolvedValue(
        createFakeClient({
          data: null,
          error: {
            code: "23514",
            message:
              'new row for relation "clients" violates check constraint "clients_name_check"',
          },
        }).client,
      );

      const failure = failureOf(await createClient(USER, VALID_INPUT));

      expect(failure.code).toBe("invalid_input");
      expect(failure.message).not.toContain("clients_name_check");
    });

    it("maps a Row Level Security rejection to an expired session", async () => {
      stubConfigured();
      createServerSupabaseClientMock.mockResolvedValue(
        createFakeClient({
          data: null,
          error: {
            code: "42501",
            message: 'new row violates row-level security policy for table "clients"',
          },
        }).client,
      );

      const failure = failureOf(await createClient(USER, VALID_INPUT));

      expect(failure.code).toBe("session_expired");
      expect(failure.message).not.toContain("row-level security");
    });

    it("reports an unreachable Supabase as temporarily unavailable", async () => {
      stubConfigured();
      createServerSupabaseClientMock.mockRejectedValue(new TypeError("fetch failed"));

      const failure = failureOf(await createClient(USER, VALID_INPUT));

      expect(failure.code).toBe("service_unavailable");
      expect(failure.message).not.toContain("fetch failed");
    });

    it("reports missing configuration without creating a client", async () => {
      stubUnconfigured();

      expect(failureOf(await createClient(USER, VALID_INPUT)).code).toBe("not_configured");
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    });
  });

  describe("updateClient", () => {
    it("scopes the statement to the id and the caller without rewriting ownership", async () => {
      stubConfigured();
      const { client, calls } = createFakeClient({ data: ROW, error: null });
      createServerSupabaseClientMock.mockResolvedValue(client);

      const result = await updateClient(USER, CLIENT_ID, VALID_INPUT);

      expect(calls.filters).toEqual([
        ["id", CLIENT_ID],
        ["user_id", USER],
      ]);
      expect(calls.update).toEqual({
        name: "Acme Corporation",
        email: "billing@acme.example",
        phone: "+44 20 7946 0000",
        company: "Acme Ltd",
        notes: null,
      });
      expect(calls.update).not.toHaveProperty("user_id");
      expect(result).toMatchObject({ ok: true, client: { id: CLIENT_ID } });
    });

    it("reports another tenant's client as not found", async () => {
      stubConfigured();
      createServerSupabaseClientMock.mockResolvedValue(
        createFakeClient({ data: null, error: null }).client,
      );

      const failure = failureOf(await updateClient(USER, OTHER_CLIENT_ID, VALID_INPUT));

      expect(failure.code).toBe("not_found");
      expect(failure.message).toBe("That client could not be found.");
    });

    it("does not touch the database with a malformed id", async () => {
      stubConfigured();

      expect(failureOf(await updateClient(USER, NOT_A_UUID, VALID_INPUT)).code).toBe("not_found");
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteClient", () => {
    it("deletes the row scoped to the id and the caller", async () => {
      stubConfigured();
      const { client, calls } = createFakeClient({ data: { id: CLIENT_ID }, error: null });
      createServerSupabaseClientMock.mockResolvedValue(client);

      const result = await deleteClient(USER, CLIENT_ID);

      expect(calls.deleted).toBe(true);
      expect(calls.tables).toEqual(["clients"]);
      expect(calls.filters).toEqual([
        ["id", CLIENT_ID],
        ["user_id", USER],
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("reports a statement that matched no row as not found", async () => {
      stubConfigured();
      createServerSupabaseClientMock.mockResolvedValue(
        createFakeClient({ data: null, error: null }).client,
      );

      const failure = failureOf(await deleteClient(USER, OTHER_CLIENT_ID));

      expect(failure.code).toBe("not_found");
      expect(failure.message).toBe("That client could not be found.");
    });

    it("does not touch the database with a malformed id", async () => {
      stubConfigured();

      expect(failureOf(await deleteClient(USER, NOT_A_UUID)).code).toBe("not_found");
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    });
  });

  it("maps PostgREST's no-rows response to not found", async () => {
    stubConfigured();
    createServerSupabaseClientMock.mockResolvedValue(
      createFakeClient({
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        },
      }).client,
    );

    expect(failureOf(await getClientById(USER, CLIENT_ID)).code).toBe("not_found");
  });

  it("does not query the database with a malformed id", async () => {
    stubConfigured();

    const failure = failureOf(await getClientById(USER, NOT_A_UUID));

    expect(failure.code).toBe("not_found");
    // A syntactically invalid id cannot match a row, so there is nothing to ask
    // PostgreSQL, and no "invalid input syntax for type uuid" to hide.
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createServerSupabaseClientMock.mockReset();
  // Failures are logged for operators, and the log line itself is asserted
  // below, so the real console is not needed.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
});
