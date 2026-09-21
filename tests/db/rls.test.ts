// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, type QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Row Level Security integration tests.
 *
 * These tests apply the real migration to a real PostgreSQL database and then
 * verify what a tenant can and cannot do through the `authenticated` role. The
 * suite is skipped when `TEST_DATABASE_URL` is not configured (see
 * `.env.example`); CI always configures it, so the guarantees are enforced on
 * every push.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const testsDirectory = fileURLToPath(new URL(".", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

if (!databaseUrl) {
  console.warn("TEST_DATABASE_URL is not set - skipping the Row Level Security integration suite.");
}

let admin: Client;
let app: Client;

let clientA: string;
let clientB: string;
let projectA: string;
let projectB: string;
let taskA: string;

/** Runs `callback` with the SQL session impersonating a signed-in user. */
async function asRole<T>(role: string, userId: string | null, callback: () => Promise<T>) {
  await app.query(`set role ${role}`);

  if (userId) {
    await app.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: userId, role }),
    ]);
  }

  try {
    return await callback();
  } finally {
    await app.query("select set_config('request.jwt.claims', '', false)");
    await app.query("reset role");
  }
}

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return asRole("authenticated", userId, callback);
}

function asAnon<T>(callback: () => Promise<T>) {
  return asRole("anon", null, callback);
}

async function queryAsUser<T extends QueryResultRow>(
  userId: string,
  text: string,
  values: unknown[] = [],
) {
  return asUser(userId, () => app.query<T>(text, values));
}

async function insertClient(userId: string, name: string) {
  const result = await queryAsUser<{ id: string }>(
    userId,
    "insert into public.clients (user_id, name) values ($1, $2) returning id",
    [userId, name],
  );

  return result.rows[0].id;
}

async function insertProject(userId: string, clientId: string, name: string) {
  const result = await queryAsUser<{ id: string }>(
    userId,
    "insert into public.projects (user_id, client_id, name) values ($1, $2, $3) returning id",
    [userId, clientId, name],
  );

  return result.rows[0].id;
}

async function insertTask(userId: string, projectId: string, title: string) {
  const result = await queryAsUser<{ id: string }>(
    userId,
    "insert into public.tasks (user_id, project_id, title) values ($1, $2, $3) returning id",
    [userId, projectId, title],
  );

  return result.rows[0].id;
}

const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("database schema and Row Level Security", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    app = new Client({ connectionString: databaseUrl });
    await app.connect();

    // A clean slate: schema, Supabase stand-ins, then the real migrations.
    await admin.query("drop schema if exists public cascade");
    await admin.query("create schema public");
    await admin.query(readFileSync(join(testsDirectory, "bootstrap.sql"), "utf8"));
    await admin.query("delete from auth.users");

    const migrations = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      await admin.query(readFileSync(join(migrationsDirectory, migration), "utf8"));
    }
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    // `delete from auth.users` cascades to every tenant-owned table.
    await admin.query("delete from auth.users");
    await admin.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [
      USER_A,
      "owner-a@example.com",
      USER_B,
      "owner-b@example.com",
    ]);

    clientA = await insertClient(USER_A, "Client A");
    clientB = await insertClient(USER_B, "Client B");
    projectA = await insertProject(USER_A, clientA, "Project A");
    projectB = await insertProject(USER_B, clientB, "Project B");
    taskA = await insertTask(USER_A, projectA, "Task A");
  });

  describe("tenant isolation through the authenticated role", () => {
    it("only returns rows owned by the signed-in user", async () => {
      const clients = await queryAsUser<{ id: string }>(USER_A, "select id from public.clients");
      expect(clients.rows.map((row) => row.id)).toEqual([clientA]);

      const projects = await queryAsUser<{ id: string }>(USER_A, "select id from public.projects");
      expect(projects.rows.map((row) => row.id)).toEqual([projectA]);

      const tasks = await queryAsUser<{ id: string }>(USER_A, "select id from public.tasks");
      expect(tasks.rows.map((row) => row.id)).toEqual([taskA]);
    });

    it("cannot read another tenant's row even when its primary key is known", async () => {
      const result = await queryAsUser<{ id: string }>(
        USER_A,
        "select id from public.clients where id = $1",
        [clientB],
      );

      expect(result.rows).toEqual([]);
    });

    it("cannot update another tenant's row", async () => {
      const result = await queryAsUser(
        USER_A,
        "update public.clients set name = 'hijacked' where id = $1",
        [clientB],
      );

      expect(result.rowCount).toBe(0);
      const stored = await admin.query<{ name: string }>(
        "select name from public.clients where id = $1",
        [clientB],
      );
      expect(stored.rows[0].name).toBe("Client B");
    });

    it("cannot delete another tenant's row", async () => {
      const result = await queryAsUser(USER_A, "delete from public.clients where id = $1", [
        clientB,
      ]);

      expect(result.rowCount).toBe(0);
      const stored = await admin.query<{ count: number }>(
        "select count(*)::int as count from public.clients where id = $1",
        [clientB],
      );
      expect(stored.rows[0].count).toBe(1);
    });

    it("cannot insert a row that claims another owner (INSERT WITH CHECK)", async () => {
      await expect(
        queryAsUser(USER_A, "insert into public.clients (user_id, name) values ($1, 'forged')", [
          USER_B,
        ]),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot reassign one of its own rows to another user (UPDATE WITH CHECK)", async () => {
      await expect(
        queryAsUser(USER_A, "update public.clients set user_id = $1 where id = $2", [
          USER_B,
          clientA,
        ]),
      ).rejects.toThrow(/row-level security/i);

      const stored = await admin.query<{ user_id: string }>(
        "select user_id from public.clients where id = $1",
        [clientA],
      );
      expect(stored.rows[0].user_id).toBe(USER_A);
    });

    it("cannot attach a project to another tenant's client", async () => {
      await expect(
        queryAsUser(
          USER_A,
          "insert into public.projects (user_id, client_id, name) values ($1, $2, 'cross tenant')",
          [USER_A, clientB],
        ),
      ).rejects.toThrow(/row-level security|foreign key/i);
    });

    it("cannot attach a task to another tenant's project", async () => {
      await expect(
        queryAsUser(
          USER_A,
          "insert into public.tasks (user_id, project_id, title) values ($1, $2, 'cross tenant')",
          [USER_A, projectB],
        ),
      ).rejects.toThrow(/row-level security|foreign key/i);
    });

    it("cannot re-parent its own project onto another tenant's client", async () => {
      await expect(
        queryAsUser(USER_A, "update public.projects set client_id = $1 where id = $2", [
          clientB,
          projectA,
        ]),
      ).rejects.toThrow(/row-level security|foreign key/i);

      const stored = await admin.query<{ client_id: string }>(
        "select client_id from public.projects where id = $1",
        [projectA],
      );
      expect(stored.rows[0].client_id).toBe(clientA);
    });

    it("only exposes a profile to its owner", async () => {
      await queryAsUser(USER_A, "insert into public.profiles (user_id, email) values ($1, $2)", [
        USER_A,
        "owner-a@example.com",
      ]);

      const ownProfile = await queryAsUser<{ user_id: string }>(
        USER_A,
        "select user_id from public.profiles",
      );
      expect(ownProfile.rows.map((row) => row.user_id)).toEqual([USER_A]);

      const otherProfile = await queryAsUser<{ user_id: string }>(
        USER_B,
        "select user_id from public.profiles",
      );
      expect(otherProfile.rows).toEqual([]);
    });

    it("gives the anon role no access at all", async () => {
      await expect(asAnon(() => app.query("select count(*) from public.clients"))).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  describe("database-level tenant guarantees with RLS bypassed", () => {
    it("rejects a cross-tenant client reference through the composite foreign key", async () => {
      await expect(
        admin.query(
          "insert into public.projects (user_id, client_id, name) values ($1, $2, 'fk')",
          [USER_A, clientB],
        ),
      ).rejects.toThrow(/projects_client_tenant_fkey|foreign key/i);
    });

    it("rejects a cross-tenant project reference for tasks", async () => {
      await expect(
        admin.query("insert into public.tasks (user_id, project_id, title) values ($1, $2, 'fk')", [
          USER_A,
          projectB,
        ]),
      ).rejects.toThrow(/tasks_project_tenant_fkey|foreign key/i);
    });

    it("blocks deleting a client that still owns projects", async () => {
      await expect(
        admin.query("delete from public.clients where id = $1", [clientA]),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it("removes every tenant row when the owning account is deleted", async () => {
      await admin.query("delete from auth.users where id = $1", [USER_A]);

      for (const table of ["clients", "projects", "tasks"] as const) {
        const remaining = await admin.query<{ count: number }>(
          `select count(*)::int as count from public.${table} where user_id = $1`,
          [USER_A],
        );
        expect(remaining.rows[0].count, table).toBe(0);
      }

      const otherTenant = await admin.query<{ count: number }>(
        "select count(*)::int as count from public.clients where user_id = $1",
        [USER_B],
      );
      expect(otherTenant.rows[0].count).toBe(1);
    });
  });

  describe("data integrity constraints", () => {
    it("applies the documented defaults", async () => {
      const project = await queryAsUser<{ status: string; value: string }>(
        USER_A,
        "select status, value from public.projects where id = $1",
        [projectA],
      );
      expect(project.rows[0].status).toBe("planning");
      expect(Number(project.rows[0].value)).toBe(0);

      const task = await queryAsUser<{ status: string; priority: string }>(
        USER_A,
        "select status, priority from public.tasks where id = $1",
        [taskA],
      );
      expect(task.rows[0]).toEqual({ status: "todo", priority: "medium" });
    });

    it("rejects a project status outside the documented enum", async () => {
      await expect(
        queryAsUser(USER_A, "update public.projects set status = 'archived' where id = $1", [
          projectA,
        ]),
      ).rejects.toThrow(/invalid input value for enum/i);
    });

    it("rejects a negative project value", async () => {
      await expect(
        queryAsUser(USER_A, "update public.projects set value = -1 where id = $1", [projectA]),
      ).rejects.toThrow(/projects_value_check/);
    });

    it("rejects a blank client name", async () => {
      await expect(
        queryAsUser(USER_A, "insert into public.clients (user_id, name) values ($1, '   ')", [
          USER_A,
        ]),
      ).rejects.toThrow(/clients_name_check/);
    });

    it("rejects a due date that precedes the start date", async () => {
      await expect(
        queryAsUser(
          USER_A,
          "update public.projects set start_date = '2026-02-01', due_date = '2026-01-01' where id = $1",
          [projectA],
        ),
      ).rejects.toThrow(/projects_dates_check/);
    });

    it("rejects a task priority outside the documented enum", async () => {
      await expect(
        queryAsUser(USER_A, "update public.tasks set priority = 'urgent' where id = $1", [taskA]),
      ).rejects.toThrow(/invalid input value for enum/i);
    });

    it("maintains updated_at automatically on update", async () => {
      const before = await queryAsUser<{ updated_at: Date }>(
        USER_A,
        "select updated_at from public.clients where id = $1",
        [clientA],
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      await queryAsUser(
        USER_A,
        "update public.clients set name = 'Client A renamed' where id = $1",
        [clientA],
      );

      const after = await queryAsUser<{ updated_at: Date }>(
        USER_A,
        "select updated_at from public.clients where id = $1",
        [clientA],
      );

      expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(before.rows[0].updated_at).getTime(),
      );
    });
  });
});
