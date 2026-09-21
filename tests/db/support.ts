// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, type QueryResultRow } from "pg";
import { describe } from "vitest";

/**
 * Shared harness for the PostgreSQL integration suites.
 *
 * The suites apply the real migrations to a throwaway database and then act as
 * `authenticated`/`anon` through `set role` plus `request.jwt.claims`, which is
 * how PostgREST executes a request. That makes `auth.uid()` inside the Row Level
 * Security policies behave exactly as it does in production.
 *
 * The database is only ever a throwaway one (see `.env.example`): the suite
 * drops and recreates the `public` schema.
 */

export const databaseUrl = process.env.TEST_DATABASE_URL;

const testsDirectory = fileURLToPath(new URL(".", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

/**
 * `describe` when a database is configured, `describe.skip` otherwise. A skipped
 * suite prints a warning instead of failing, so the same command works in a
 * checkout without a local database. CI always configures one.
 */
export const describeWithDatabase = databaseUrl ? describe : describe.skip;

export function warnWhenDatabaseIsUnset(): void {
  if (!databaseUrl) {
    console.warn("TEST_DATABASE_URL is not set - skipping the PostgreSQL integration suite.");
  }
}

export type DatabaseClients = {
  /** Superuser connection used to set up fixtures and inspect stored rows. */
  admin: Client;
  /** Connection whose role is switched to exercise RLS policies. */
  app: Client;
};

export async function connectToDatabase(): Promise<DatabaseClients> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const app = new Client({ connectionString: databaseUrl });
  await app.connect();

  return { admin, app };
}

/**
 * A clean slate: schema, Supabase stand-ins, then every migration in filename
 * order.
 */
export async function resetDatabase(admin: Client): Promise<void> {
  await admin.query("drop schema if exists public cascade");
  await admin.query("create schema public");
  await admin.query(readFileSync(join(testsDirectory, "bootstrap.sql"), "utf8"));
  await admin.query("delete from auth.users");

  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (migrations.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
  }

  for (const migration of migrations) {
    await admin.query(readFileSync(join(migrationsDirectory, migration), "utf8"));
  }
}

/** Runs `callback` with the SQL session impersonating a signed-in user. */
export async function asRole<T>(
  app: Client,
  role: string,
  userId: string | null,
  callback: () => Promise<T>,
): Promise<T> {
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

export function asUser<T>(app: Client, userId: string, callback: () => Promise<T>) {
  return asRole(app, "authenticated", userId, callback);
}

export function asAnon<T>(app: Client, callback: () => Promise<T>) {
  return asRole(app, "anon", null, callback);
}

export function queryAsUser<T extends QueryResultRow>(
  app: Client,
  userId: string,
  text: string,
  values: unknown[] = [],
) {
  return asUser(app, userId, () => app.query<T>(text, values));
}
