// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  asAnon,
  connectToDatabase,
  describeWithDatabase,
  queryAsUser,
  resetDatabase,
  warnWhenDatabaseIsUnset,
} from "./support";

warnWhenDatabaseIsUnset();

/**
 * Profile lifecycle integration tests.
 *
 * They prove two things against a real PostgreSQL instance running the real
 * migrations:
 *
 *  1. `public.handle_new_user()` creates exactly one profile per auth user, with
 *     the metadata normalised, and cascades on account deletion.
 *  2. A tenant can only ever reach their **own** profile through the
 *     `authenticated` role — the guarantee that makes the `user_id` primary key
 *     meaningful.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let admin: Client;
let app: Client;

/** Inserts an auth user the way GoTrue would, metadata included. */
async function insertAuthUser(
  id: string,
  email: string,
  metadata: Record<string, unknown> | null = null,
) {
  await admin.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    metadata === null ? null : JSON.stringify(metadata),
  ]);
}

type StoredProfile = { user_id: string; email: string; full_name: string | null };

/** Reads a profile with RLS bypassed, so the stored row can be inspected. */
async function readProfile(userId: string): Promise<StoredProfile | undefined> {
  const result = await admin.query<StoredProfile>(
    "select user_id, email, full_name from public.profiles where user_id = $1",
    [userId],
  );

  return result.rows[0];
}

describeWithDatabase("profile lifecycle", () => {
  beforeAll(async () => {
    ({ admin, app } = await connectToDatabase());
    await resetDatabase(admin);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    // Cascades to every tenant-owned table, including profiles.
    await admin.query("delete from auth.users");
  });

  describe("creating a profile from sign-up", () => {
    it("creates the profile in the same transaction as the auth user", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", { full_name: "Ada Lovelace" });

      expect(await readProfile(USER_A)).toEqual({
        user_id: USER_A,
        email: "owner-a@example.com",
        full_name: "Ada Lovelace",
      });
    });

    it("stores a null display name when the metadata omits it", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com");

      expect((await readProfile(USER_A))?.full_name).toBeNull();
    });

    it("normalises a blank display name to null", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", { full_name: "   " });

      expect((await readProfile(USER_A))?.full_name).toBeNull();
    });

    it("trims a padded display name", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", { full_name: "  Ada  " });

      expect((await readProfile(USER_A))?.full_name).toBe("Ada");
    });

    it("truncates an over-long display name instead of failing the sign-up", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", { full_name: "a".repeat(400) });

      // 120 is the limit enforced by profiles_full_name_check.
      expect((await readProfile(USER_A))?.full_name).toHaveLength(120);
    });

    it("reads only full_name from the sign-up metadata", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", {
        full_name: "Ada",
        role: "admin",
        user_id: USER_B,
      });

      expect(await readProfile(USER_A)).toEqual({
        user_id: USER_A,
        email: "owner-a@example.com",
        full_name: "Ada",
      });
    });

    it("creates exactly one profile per user", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com");
      await insertAuthUser(USER_B, "owner-b@example.com");

      const count = await admin.query<{ count: number }>(
        "select count(*)::int as count from public.profiles",
      );

      expect(count.rows[0].count).toBe(2);
    });

    it("is idempotent, so the backfill statement can be re-run", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com");

      await admin.query(`
        insert into public.profiles (user_id, email)
        select id, email from auth.users
        where email is not null
        on conflict (user_id) do nothing
      `);

      const count = await admin.query<{ count: number }>(
        "select count(*)::int as count from public.profiles where user_id = $1",
        [USER_A],
      );

      expect(count.rows[0].count).toBe(1);
    });

    it("removes the profile when the owning account is deleted", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com");

      await admin.query("delete from auth.users where id = $1", [USER_A]);

      expect(await readProfile(USER_A)).toBeUndefined();
    });
  });

  describe("profile access through the authenticated role", () => {
    beforeEach(async () => {
      await insertAuthUser(USER_A, "owner-a@example.com", { full_name: "Owner A" });
      await insertAuthUser(USER_B, "owner-b@example.com", { full_name: "Owner B" });
    });

    it("lets a user read their own profile", async () => {
      const result = await queryAsUser<{ user_id: string; email: string }>(
        app,
        USER_A,
        "select user_id, email from public.profiles",
      );

      expect(result.rows).toEqual([{ user_id: USER_A, email: "owner-a@example.com" }]);
    });

    it("cannot read another user's profile even when its id is known", async () => {
      const result = await queryAsUser<{ user_id: string }>(
        app,
        USER_A,
        "select user_id from public.profiles where user_id = $1",
        [USER_B],
      );

      expect(result.rows).toEqual([]);
    });

    it("lets a user update their own display name", async () => {
      const result = await queryAsUser(
        app,
        USER_A,
        "update public.profiles set full_name = 'Ada' where user_id = $1",
        [USER_A],
      );

      expect(result.rowCount).toBe(1);
      expect((await readProfile(USER_A))?.full_name).toBe("Ada");
    });

    it("cannot modify another user's profile", async () => {
      const result = await queryAsUser(
        app,
        USER_A,
        "update public.profiles set full_name = 'hijacked' where user_id = $1",
        [USER_B],
      );

      expect(result.rowCount).toBe(0);
      expect((await readProfile(USER_B))?.full_name).toBe("Owner B");
    });

    it("cannot delete another user's profile", async () => {
      const result = await queryAsUser(
        app,
        USER_A,
        "delete from public.profiles where user_id = $1",
        [USER_B],
      );

      expect(result.rowCount).toBe(0);
      expect(await readProfile(USER_B)).toBeDefined();
    });

    it("cannot insert a profile for somebody else", async () => {
      // Removed first so that the primary key cannot be the reason for the
      // failure: Row Level Security must be what refuses the write.
      await admin.query("delete from public.profiles where user_id = $1", [USER_B]);

      await expect(
        queryAsUser(app, USER_A, "insert into public.profiles (user_id, email) values ($1, $2)", [
          USER_B,
          "forged@example.com",
        ]),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot hand its own profile to another user", async () => {
      await admin.query("delete from public.profiles where user_id = $1", [USER_B]);

      await expect(
        queryAsUser(app, USER_A, "update public.profiles set user_id = $1 where user_id = $2", [
          USER_B,
          USER_A,
        ]),
      ).rejects.toThrow(/row-level security/i);
    });

    it("gives the anon role no access to profiles", async () => {
      await expect(
        asAnon(app, () => app.query("select count(*) from public.profiles")),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe("trigger function privileges", () => {
    it("is not executable by the API roles", async () => {
      const result = await admin.query<{
        public_can_execute: boolean;
        anon_can_execute: boolean;
        authenticated_can_execute: boolean;
      }>(`
        select
          has_function_privilege('public', 'public.handle_new_user()', 'execute') as public_can_execute,
          has_function_privilege('anon', 'public.handle_new_user()', 'execute') as anon_can_execute,
          has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as authenticated_can_execute
      `);

      expect(result.rows[0]).toEqual({
        public_can_execute: false,
        anon_can_execute: false,
        authenticated_can_execute: false,
      });
    });

    it("refuses a direct call from an authenticated user", async () => {
      await insertAuthUser(USER_A, "owner-a@example.com");

      await expect(queryAsUser(app, USER_A, "select public.handle_new_user()")).rejects.toThrow(
        /permission denied for function handle_new_user/i,
      );
    });
  });
});
