// @vitest-environment node
import type { Client, QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  asAnon,
  connectToDatabase,
  describeWithDatabase,
  queryAsUser as runQueryAsUser,
  resetDatabase,
  warnWhenDatabaseIsUnset,
} from "./support";

warnWhenDatabaseIsUnset();

/**
 * Client isolation integration tests (Phase 2).
 *
 * They apply the real migrations to a real PostgreSQL instance and then act as the
 * `authenticated` and `anon` roles, which is exactly how PostgREST executes a
 * request. That makes `auth.uid()` inside the Row Level Security policies behave
 * as it does in production, so these tests prove the guarantees the application
 * relies on rather than restating them:
 *
 *  - tenant A can select, insert, update and delete its own clients;
 *  - tenant B can do none of those things to tenant A's client — the row is
 *    invisible, and an UPDATE or DELETE simply matches nothing;
 *  - a client cannot be re-parented onto (or created for) another user;
 *  - the `anon` role has no access to tenant data at all.
 *
 * They are skipped when `TEST_DATABASE_URL` is not configured; CI always
 * configures it.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let admin: Client;
let app: Client;

let clientA: string;
let clientB: string;

/** Inserts an auth user the way GoTrue would. */
async function insertAuthUser(id: string, email: string) {
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/**
 * {@link runQueryAsUser} bound to this suite's impersonating connection, so every
 * statement below runs as `authenticated` with `auth.uid()` set to that tenant —
 * the same way PostgREST executes an application request.
 */
function queryAsUser<T extends QueryResultRow>(
  userId: string,
  text: string,
  values: unknown[] = [],
) {
  return runQueryAsUser<T>(app, userId, text, values);
}

async function insertClientAs(userId: string, name: string): Promise<string> {
  const result = await queryAsUser<{ id: string }>(
    userId,
    "insert into public.clients (user_id, name) values ($1, $2) returning id",
    [userId, name],
  );

  return result.rows[0].id;
}

/** Reads a client with RLS bypassed, so the stored row can be inspected. */
async function readClientAsAdmin(id: string) {
  const result = await admin.query<{ name: string; user_id: string }>(
    "select name, user_id from public.clients where id = $1",
    [id],
  );

  return result.rows[0];
}

describeWithDatabase("client tenant isolation", () => {
  beforeAll(async () => {
    ({ admin, app } = await connectToDatabase());
  });

  afterAll(async () => {
    await admin.end();
    await app.end();
  });

  beforeEach(async () => {
    await resetDatabase(admin);
    await insertAuthUser(USER_A, "tenant-a@example.com");
    await insertAuthUser(USER_B, "tenant-b@example.com");

    clientA = await insertClientAs(USER_A, "Acme Corporation");
    clientB = await insertClientAs(USER_B, "Globex");
  });

  describe("a tenant's own client", () => {
    it("can be read, and only that tenant's rows are visible", async () => {
      const result = await queryAsUser<{ id: string; user_id: string }>(
        USER_A,
        "select id, user_id from public.clients",
      );

      expect(result.rows).toEqual([{ id: clientA, user_id: USER_A }]);
      expect(result.rows.map((row) => row.id)).not.toContain(clientB);
    });

    it("can be updated", async () => {
      const updated = await queryAsUser(
        USER_A,
        "update public.clients set name = $1, company = $2 where id = $3",
        ["Acme Corporation (renamed)", "Acme Ltd", clientA],
      );

      expect(updated.rowCount).toBe(1);
      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation (renamed)",
        user_id: USER_A,
      });
    });

    it("can be deleted, leaving no row behind", async () => {
      const deleted = await queryAsUser(USER_A, "delete from public.clients where id = $1", [
        clientA,
      ]);

      expect(deleted.rowCount).toBe(1);
      expect(await readClientAsAdmin(clientA)).toBeUndefined();

      const remaining = await admin.query<{ count: number }>(
        "select count(*)::int as count from public.clients where user_id = $1",
        [USER_A],
      );
      expect(remaining.rows[0].count).toBe(0);
    });

    it("can be inserted repeatedly, and each one stays visible to its owner", async () => {
      const second = await insertClientAs(USER_A, "Northwind Traders");

      const rows = await queryAsUser<{ id: string }>(
        USER_A,
        "select id from public.clients order by name",
      );

      expect(rows.rows.map((row) => row.id)).toEqual([clientA, second]);
    });
  });

  describe("another tenant's client", () => {
    it("is invisible to a SELECT, which returns no rows and no error", async () => {
      const result = await queryAsUser<{ id: string }>(
        USER_B,
        "select id from public.clients where id = $1",
        [clientA],
      );

      // Row Level Security filters the row out rather than refusing the query, so
      // the caller cannot tell "not yours" from "does not exist".
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);

      const count = await queryAsUser<{ count: number }>(
        USER_B,
        "select count(*)::int as count from public.clients",
      );
      expect(count.rows[0].count).toBe(1);
    });

    it("cannot be updated: the statement matches no row", async () => {
      const updated = await queryAsUser(
        USER_B,
        "update public.clients set name = 'hijacked' where id = $1",
        [clientA],
      );

      expect(updated.rowCount).toBe(0);
      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation",
        user_id: USER_A,
      });
    });

    it("cannot be deleted: the statement matches no row", async () => {
      const deleted = await queryAsUser(USER_B, "delete from public.clients where id = $1", [
        clientA,
      ]);

      expect(deleted.rowCount).toBe(0);
      expect(await readClientAsAdmin(clientA)).toBeDefined();
    });

    it("cannot be claimed by inserting a row that pretends to be the owner", async () => {
      await expect(
        queryAsUser(USER_B, "insert into public.clients (user_id, name) values ($1, 'stolen')", [
          USER_A,
        ]),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot be taken over by another tenant", async () => {
      // Row Level Security's USING clause hides A's row from B, so there is
      // nothing for the UPDATE to match: no error, no change.
      const attempted = await queryAsUser(
        USER_B,
        "update public.clients set user_id = $1 where id = $2",
        [USER_B, clientA],
      );

      expect(attempted.rowCount).toBe(0);
      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation",
        user_id: USER_A,
      });
    });

    it("cannot be handed over by its own owner", async () => {
      // Here the row *is* visible (it belongs to A), so the WITH CHECK clause is
      // what refuses the write: ownership can never leave the tenant it belongs to.
      await expect(
        queryAsUser(USER_A, "update public.clients set user_id = $1 where id = $2", [
          USER_B,
          clientA,
        ]),
      ).rejects.toThrow(/row-level security/i);

      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation",
        user_id: USER_A,
      });
    });

    it("is not affected by the other tenant deleting their own client", async () => {
      await queryAsUser(USER_B, "delete from public.clients where id = $1", [clientB]);

      expect(await readClientAsAdmin(clientB)).toBeUndefined();
      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation",
        user_id: USER_A,
      });
    });
  });

  describe("the anonymous role", () => {
    it("cannot read tenant data", async () => {
      await expect(
        asAnon(app, () => app.query("select count(*) from public.clients")),
      ).rejects.toThrow(/permission denied/i);
    });

    it("cannot insert, update or delete anything", async () => {
      await expect(
        asAnon(app, () =>
          app.query("insert into public.clients (user_id, name) values ($1, 'anon')", [USER_A]),
        ),
      ).rejects.toThrow(/permission denied|row-level security/i);

      await expect(
        asAnon(app, () =>
          app.query("update public.clients set name = 'anon' where id = $1", [clientA]),
        ),
      ).rejects.toThrow(/permission denied|row-level security/i);

      await expect(
        asAnon(app, () => app.query("delete from public.clients where id = $1", [clientA])),
      ).rejects.toThrow(/permission denied|row-level security/i);

      expect(await readClientAsAdmin(clientA)).toEqual({
        name: "Acme Corporation",
        user_id: USER_A,
      });
    });
  });
});
