import { readFormString, type FieldErrors } from "@/lib/forms/form-state";

/**
 * Shape shared by the create, edit and delete client forms.
 *
 * As with `src/lib/auth/form-state.ts`, this lives outside `actions.ts` because
 * every export of a `"use server"` module must be an async function.
 *
 * `values` holds plain strings — those are what an HTML form can echo back. The
 * `null` an omitted optional column is stored as exists only in the validated
 * payload (`clientSchema`), never in form state.
 */
export type ClientFormValues = {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
};

export type ClientFormState = {
  status: "idle" | "error" | "notice";
  /** Safe, user-facing sentence. Never upstream error text. */
  message: string | null;
  /** Field-level messages, keyed by form field name. */
  fieldErrors: FieldErrors;
  /** Echoes submitted text back so the user does not retype it. */
  values: ClientFormValues;
};

export const EMPTY_CLIENT_FORM_VALUES: ClientFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

export const INITIAL_CLIENT_FORM_STATE: ClientFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: EMPTY_CLIENT_FORM_VALUES,
};

/** Builds an `error` state, optionally preserving submitted values. */
export function errorState(
  message: string,
  options: {
    fieldErrors?: FieldErrors;
    values?: Partial<ClientFormValues>;
  } = {},
): ClientFormState {
  return {
    status: "error",
    message,
    fieldErrors: options.fieldErrors ?? {},
    values: { ...EMPTY_CLIENT_FORM_VALUES, ...options.values },
  };
}

/** Builds a `notice` state (success or actionable information). */
export function noticeState(
  message: string,
  values: Partial<ClientFormValues> = {},
): ClientFormState {
  return {
    status: "notice",
    message,
    fieldErrors: {},
    values: { ...EMPTY_CLIENT_FORM_VALUES, ...values },
  };
}

/** Reads the five editable fields out of a submitted form. */
export function readClientFormValues(formData: FormData): ClientFormValues {
  return {
    name: readFormString(formData, "name"),
    email: readFormString(formData, "email"),
    phone: readFormString(formData, "phone"),
    company: readFormString(formData, "company"),
    notes: readFormString(formData, "notes"),
  };
}

/**
 * Seed values for editing an existing client.
 *
 * A `NULL` column (how "not given" is stored) becomes the empty string a form
 * control expects. The parameter is structurally typed rather than importing the
 * DAL's `Client`, so this module stays usable from Client Components without
 * pulling in the server-only data access layer.
 */
export function clientFormValuesFromClient(client: {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
}): ClientFormValues {
  return {
    name: client.name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    company: client.company ?? "",
    notes: client.notes ?? "",
  };
}
