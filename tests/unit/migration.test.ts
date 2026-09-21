// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Architectural regression tests for the database migration.
 *
 * These assertions read the SQL that ships in the repository and fail if a
 * future change drops an ownership column, a composite tenant key, Row Level
 * Security or a policy clause. They complement `tests/db/rls.test.ts`, which
 * proves the same guarantees against a real PostgreSQL instance.
 */
const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

/** Removes `--` SQL comments so only executable statements are inspected. */
function stripSqlComments(source: string): string {
  return source.replace(/--[^\n]*/g, "");
}

function readMigrations(): string {
  const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"));

  if (files.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
  }

  return stripSqlComments(
    files
      .sort()
      .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
      .join("\n"),
  );
}

const sql = readMigrations();
const TENANT_TABLES = ["profiles", "clients", "projects", "tasks"] as const;

type Policy = { table: string; command: string; role: string; body: string };

function parsePolicies(source: string): Policy[] {
  const policies: Policy[] = [];
  const pattern = /create policy "([^"]+)" on public\.(\w+)\s+for (\w+) to (\w+)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const end = source.indexOf(";", match.index);
    policies.push({
      table: match[2],
      command: match[3],
      role: match[4],
      body: source.slice(match.index, end),
    });
  }

  return policies;
}

const policies = parsePolicies(sql);

describe("initial migration", () => {
  it("creates every entity of the ClientFlow data model", () => {
    for (const table of TENANT_TABLES) {
      expect(sql).toMatch(new RegExp(`create table public\\.${table} \\(`));
    }
  });

  it("gives every tenant-owned table a user_id owner column", () => {
    for (const table of TENANT_TABLES) {
      const tableDefinition = sql.match(
        new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`),
      )?.[1];

      expect(tableDefinition, `table ${table} not found`).toBeDefined();
      expect(tableDefinition).toMatch(/user_id uuid/);
    }
  });

  it("ties ownership to auth.users so orphaned rows cannot exist", () => {
    expect(sql.match(/references auth\.users \(id\) on delete cascade/g)).toHaveLength(4);
  });

  it("uses composite unique keys so tenant foreign keys can be validated", () => {
    expect(sql.match(/unique \(id, user_id\)/g)).toHaveLength(2);
  });

  it("validates tenant ownership with composite foreign keys", () => {
    expect(sql).toContain("foreign key (client_id, user_id)");
    expect(sql).toContain("references public.clients (id, user_id)");
    expect(sql).toContain("foreign key (project_id, user_id)");
    expect(sql).toContain("references public.projects (id, user_id)");
  });

  it("enables Row Level Security on every tenant table", () => {
    for (const table of TENANT_TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
    }
  });

  it("grants table access to authenticated and service_role only", () => {
    for (const table of TENANT_TABLES) {
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from anon;`));
      expect(sql).toMatch(
        new RegExp(
          `grant select, insert, update, delete on table public\\.${table} to authenticated;`,
        ),
      );
      expect(sql).toMatch(new RegExp(`grant all on table public\\.${table} to service_role;`));
    }
  });
});

describe("Row Level Security policies", () => {
  it("defines select, insert, update and delete policies for every tenant table", () => {
    for (const table of TENANT_TABLES) {
      for (const command of ["select", "insert", "update", "delete"]) {
        expect(
          policies.some((policy) => policy.table === table && policy.command === command),
          `missing ${command} policy on ${table}`,
        ).toBe(true);
      }
    }
  });

  it("never exposes a policy to the anon role", () => {
    expect(policies.filter((policy) => policy.role !== "authenticated")).toEqual([]);
  });

  it("uses USING to restrict which existing rows are visible or mutable", () => {
    for (const command of ["select", "update", "delete"]) {
      const matching = policies.filter((policy) => policy.command === command);

      expect(matching).toHaveLength(4);
      for (const policy of matching) {
        expect(policy.body, `${policy.table} ${command}`).toMatch(/\busing \(/);
      }
    }
  });

  it("uses WITH CHECK to validate inserted rows", () => {
    const inserts = policies.filter((policy) => policy.command === "insert");

    expect(inserts).toHaveLength(4);
    for (const policy of inserts) {
      expect(policy.body, policy.table).toMatch(/\bwith check \(/);
      expect(policy.body, policy.table).toMatch(/user_id = auth\.uid\(\)/);
    }
  });

  it("uses both USING and WITH CHECK on updates so rows cannot be transferred", () => {
    const updates = policies.filter((policy) => policy.command === "update");

    expect(updates).toHaveLength(4);
    for (const policy of updates) {
      expect(policy.body, policy.table).toMatch(/\busing \(/);
      expect(policy.body, policy.table).toMatch(/\bwith check \(/);
      expect(policy.body, policy.table).toMatch(/user_id = auth\.uid\(\)/);
    }
  });

  it("scopes child tables to the owner of the parent row as well", () => {
    for (const table of ["projects", "tasks"] as const) {
      const insert = policies.find(
        (policy) => policy.table === table && policy.command === "insert",
      );

      expect(insert?.body, table).toMatch(/exists \(/);
      expect(insert?.body, table).toMatch(/c\.user_id = auth\.uid\(\)|p\.user_id = auth\.uid\(\)/);
    }
  });

  it("does not use WITH CHECK on delete policies, which create no new row", () => {
    const deletes = policies.filter((policy) => policy.command === "delete");

    expect(deletes).toHaveLength(4);
    for (const policy of deletes) {
      expect(policy.body, policy.table).not.toMatch(/with check/);
    }
  });
});
