import "server-only";

import { isPublicEnvConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { isClientId, type ClientInput } from "@/lib/validation/clients";

import {
  createClientFailure,
  describeClientFailure,
  logClientFailure,
  type ClientFailure,
} from "./errors";

/**
 * Data access layer for `public.clients`.
 *
 * Every function here takes the owner's `user_id` as an argument and scopes the
 * statement with `.eq("user_id", userId)`. That predicate is **not** the security
 * boundary — Row Level Security is (see `supabase/migrations`) — but it makes the
 * intent explicit at the call site and keeps a widened policy from silently
 * returning another tenant's rows.
 *
 * The `userId` always comes from the verified session
 * (`requireAuthenticatedUser` in the Server Action), never from a form field, a
 * URL or a header, so a browser cannot choose whose account a row belongs to.
 *
 * Failures are returned as a discriminated union instead of throwing, and never
 * carry upstream error text; see `./errors`.
 */

type ClientRow = Omit<Database["public"]["Tables"]["clients"]["Row"], "user_id">;

/**
 * The projection every read uses, so all responses have the same shape. `user_id`
 * is deliberately absent: the application never needs the ownership column (every
 * row already belongs to the caller), so it cannot be rendered, logged or posted
 * back by accident.
 */
const CLIENT_COLUMNS = "id, name, email, phone, company, notes, created_at, updated_at";

/** A client as the application uses it (camelCase, no tenant/ownership column). */
export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientListResult =
  { ok: true; clients: Client[] } | { ok: false; failure: ClientFailure };

export type ClientResult = { ok: true; client: Client } | { ok: false; failure: ClientFailure };

export type ClientDeleteResult = { ok: true } | { ok: false; failure: ClientFailure };

/**
 * `user_id` is deliberately not part of {@link Client}: the application never
 * needs it (every row already belongs to the caller) and leaving it out means it
 * cannot be rendered, logged or posted back by accident.
 */
function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The caller's clients, newest first. */
export async function listClients(userId: string): Promise<ClientListResult> {
  if (!isPublicEnvConfigured()) {
    return { ok: false, failure: createClientFailure("not_configured", "list_clients") };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      const failure = describeClientFailure(error, "list_clients");
      logClientFailure(failure);

      return { ok: false, failure };
    }

    return { ok: true, clients: (data ?? []).map(toClient) };
  } catch (error) {
    const failure = describeClientFailure(error, "list_clients");
    logClientFailure(failure);

    return { ok: false, failure };
  }
}

/**
 * One client by primary key, or `not_found`.
 *
 * A client that does not exist, a client that belongs to another tenant and a
 * malformed id are all reported as `not_found` with the same sentence, so the
 * response cannot be used to probe for the existence of somebody else's data.
 */
export async function getClientById(userId: string, clientId: string): Promise<ClientResult> {
  if (!isPublicEnvConfigured()) {
    return { ok: false, failure: createClientFailure("not_configured", "load_client") };
  }

  if (!isClientId(clientId)) {
    // Not a UUID, so no row can match. Answering without a query keeps the
    // deliberately uniform "not found" response and avoids asking PostgreSQL for
    // a 22P02 error we would then have to hide. Not logged: this is an ordinary
    // not-found outcome, not a fault.
    return { ok: false, failure: createClientFailure("not_found", "load_client") };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      const failure = describeClientFailure(error, "load_client");
      logClientFailure(failure);

      return { ok: false, failure };
    }

    if (!data) {
      return { ok: false, failure: createClientFailure("not_found", "load_client") };
    }

    return { ok: true, client: toClient(data) };
  } catch (error) {
    const failure = describeClientFailure(error, "load_client");
    logClientFailure(failure);

    return { ok: false, failure };
  }
}

/**
 * Inserts a client owned by `userId` and returns the stored row.
 *
 * `user_id` is written **last**, from the session value, so no field of the
 * validated payload can override ownership even if `ClientInput` were extended
 * later. Row Level Security's `clients_insert_own` policy re-checks the same
 * condition in the database.
 */
export async function createClient(userId: string, input: ClientInput): Promise<ClientResult> {
  if (!isPublicEnvConfigured()) {
    return { ok: false, failure: createClientFailure("not_configured", "create_client") };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        notes: input.notes,
        user_id: userId,
      })
      .select(CLIENT_COLUMNS)
      .single();

    if (error) {
      const failure = describeClientFailure(error, "create_client");
      logClientFailure(failure);

      return { ok: false, failure };
    }

    return { ok: true, client: toClient(data) };
  } catch (error) {
    const failure = describeClientFailure(error, "create_client");
    logClientFailure(failure);

    return { ok: false, failure };
  }
}

/**
 * Updates one client owned by `userId`.
 *
 * The payload lists the writable columns explicitly — never `...input` — so
 * `id` and `user_id` cannot travel through an update and re-parent a row. A
 * statement that matches no row (because the id does not exist or belongs to
 * another tenant) is reported as `not_found`.
 */
export async function updateClient(
  userId: string,
  clientId: string,
  input: ClientInput,
): Promise<ClientResult> {
  if (!isPublicEnvConfigured()) {
    return { ok: false, failure: createClientFailure("not_configured", "update_client") };
  }

  if (!isClientId(clientId)) {
    return { ok: false, failure: createClientFailure("not_found", "update_client") };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .update({
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        notes: input.notes,
      })
      .eq("id", clientId)
      .eq("user_id", userId)
      .select(CLIENT_COLUMNS)
      .maybeSingle();

    if (error) {
      const failure = describeClientFailure(error, "update_client");
      logClientFailure(failure);

      return { ok: false, failure };
    }

    if (!data) {
      return { ok: false, failure: createClientFailure("not_found", "update_client") };
    }

    return { ok: true, client: toClient(data) };
  } catch (error) {
    const failure = describeClientFailure(error, "update_client");
    logClientFailure(failure);

    return { ok: false, failure };
  }
}

/**
 * Deletes one client owned by `userId`.
 *
 * `.select("id")` makes PostgREST return the deleted rows, which is how a
 * statement that matched nothing is distinguished from a successful delete. As
 * with the other operations, "no such row" and "another tenant's row" produce
 * the same `not_found` failure.
 *
 * The composite foreign keys from `projects` and `tasks` are `NO ACTION` (see the
 * Phase 0 migration), so a client that still has projects cannot be deleted:
 * PostgreSQL refuses the statement and the failure is reported as `unexpected`
 * rather than leaked. Projects arrive in Phase 3, which will replace this with an
 * explicit, explained outcome.
 */
export async function deleteClient(userId: string, clientId: string): Promise<ClientDeleteResult> {
  if (!isPublicEnvConfigured()) {
    return { ok: false, failure: createClientFailure("not_configured", "delete_client") };
  }

  if (!isClientId(clientId)) {
    return { ok: false, failure: createClientFailure("not_found", "delete_client") };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      const failure = describeClientFailure(error, "delete_client");
      logClientFailure(failure);

      return { ok: false, failure };
    }

    if (!data) {
      return { ok: false, failure: createClientFailure("not_found", "delete_client") };
    }

    return { ok: true };
  } catch (error) {
    const failure = describeClientFailure(error, "delete_client");
    logClientFailure(failure);

    return { ok: false, failure };
  }
}
