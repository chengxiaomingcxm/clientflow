import { describe, expect, it } from "vitest";

import {
  CLIENT_COMPANY_MAX_LENGTH,
  CLIENT_EMAIL_MAX_LENGTH,
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_PHONE_MAX_LENGTH,
  clientIdSchema,
  clientSchema,
  isClientId,
} from "@/lib/validation/clients";

/**
 * Client validation suite.
 *
 * The schema is the single source of truth for both the create form and the edit
 * form, so these tests pin down the behaviour that makes the two interchangeable:
 * the same payload is accepted in both, blank optional fields normalise to `null`,
 * and nothing can exceed a database constraint.
 */

const VALID_CLIENT = {
  name: "Acme Corporation",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

describe("client name", () => {
  it("trims surrounding whitespace", () => {
    const result = clientSchema.safeParse({ ...VALID_CLIENT, name: "  Acme Corporation  " });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Acme Corporation");
  });

  it("rejects names that are empty or contain only whitespace", () => {
    for (const name of ["", "   ", "\n\t"]) {
      const result = clientSchema.safeParse({ ...VALID_CLIENT, name });

      expect(result.success, JSON.stringify(name)).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["name"]);
    }
  });

  it("rejects a name longer than the database constraint allows", () => {
    const result = clientSchema.safeParse({
      ...VALID_CLIENT,
      name: "a".repeat(CLIENT_NAME_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at most 200 characters/i);
  });

  it("accepts a name exactly at the limit", () => {
    const name = "a".repeat(CLIENT_NAME_MAX_LENGTH);

    expect(clientSchema.safeParse({ ...VALID_CLIENT, name }).success).toBe(true);
  });
});

describe("optional contact fields", () => {
  it("stores blank values as null rather than an empty string", () => {
    const result = clientSchema.parse({ ...VALID_CLIENT, email: "", phone: "  ", company: "" });

    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.company).toBeNull();
    expect(result.notes).toBeNull();
  });

  it("treats an absent field as null", () => {
    const result = clientSchema.parse({ name: "Acme" });

    expect(result).toEqual({
      name: "Acme",
      email: null,
      phone: null,
      company: null,
      notes: null,
    });
  });

  describe("client email", () => {
    it("rejects values that are not email addresses", () => {
      for (const email of ["acme", "@acme.example", "acme@", "no-at-sign.example"]) {
        const result = clientSchema.safeParse({ ...VALID_CLIENT, email });

        expect(result.success, email).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(["email"]);
      }
    });

    it("accepts an address the database will store", () => {
      expect(clientSchema.parse({ ...VALID_CLIENT, email: "ab@c" }).email).toBe("ab@c");
    });

    it("requires a domain part after the @ as well as a name before it", () => {
      // `clients_email_check` only requires an "@" that is not the first
      // character; the form is deliberately stricter, and both variants stay
      // inside what the column accepts.
      expect(clientSchema.safeParse({ ...VALID_CLIENT, email: "@example" }).success).toBe(false);
      expect(clientSchema.safeParse({ ...VALID_CLIENT, email: "acme@" }).success).toBe(false);
      expect(clientSchema.parse({ ...VALID_CLIENT, email: "a@b" }).email).toBe("a@b");
    });

    it("reports a field-level error the form can display", () => {
      const result = clientSchema.safeParse({ ...VALID_CLIENT, email: "acme" });

      expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
    });

    it("rejects an address longer than the database column allows", () => {
      const email = `${"a".repeat(CLIENT_EMAIL_MAX_LENGTH)}@acme.example`;

      expect(clientSchema.safeParse({ ...VALID_CLIENT, email }).success).toBe(false);
    });
  });

  describe("phone and company limits", () => {
    it("accepts a value exactly at the limit", () => {
      const result = clientSchema.safeParse({
        ...VALID_CLIENT,
        phone: "0".repeat(CLIENT_PHONE_MAX_LENGTH),
        company: "c".repeat(CLIENT_COMPANY_MAX_LENGTH),
      });

      expect(result.success).toBe(true);
    });

    it("rejects one character more than the limit", () => {
      expect(
        clientSchema.safeParse({ ...VALID_CLIENT, phone: "0".repeat(CLIENT_PHONE_MAX_LENGTH + 1) })
          .success,
      ).toBe(false);
      expect(
        clientSchema.safeParse({
          ...VALID_CLIENT,
          company: "c".repeat(CLIENT_COMPANY_MAX_LENGTH + 1),
        }).success,
      ).toBe(false);
    });
  });

  describe("notes", () => {
    it("keeps line breaks and inner spacing", () => {
      const notes = "Met at the conference.\n\nWants a quote by Friday.";

      expect(clientSchema.parse({ ...VALID_CLIENT, notes }).notes).toBe(notes);
    });

    it("bounds the amount of free text a form may submit", () => {
      expect(
        clientSchema.safeParse({ ...VALID_CLIENT, notes: "n".repeat(CLIENT_NOTES_MAX_LENGTH) })
          .success,
      ).toBe(true);
      expect(
        clientSchema.safeParse({ ...VALID_CLIENT, notes: "n".repeat(CLIENT_NOTES_MAX_LENGTH + 1) })
          .success,
      ).toBe(false);
    });
  });

  describe("ownership is not a form field", () => {
    it("drops an injected user_id instead of validating it", () => {
      const result = clientSchema.parse({
        ...VALID_CLIENT,
        user_id: "22222222-2222-4222-8222-222222222222",
      });

      expect(result).not.toHaveProperty("user_id");
      expect(Object.keys(result).sort()).toEqual(["company", "email", "name", "notes", "phone"]);
    });

    it("drops an injected owner_id and id", () => {
      const result = clientSchema.parse({
        ...VALID_CLIENT,
        owner_id: "22222222-2222-4222-8222-222222222222",
        id: "33333333-3333-4333-8333-333333333333",
      });

      expect(result).not.toHaveProperty("owner_id");
      expect(result).not.toHaveProperty("id");
    });
  });

  describe("client id", () => {
    it("accepts a UUID", () => {
      expect(clientIdSchema.safeParse("33333333-3333-4333-8333-333333333333").success).toBe(true);
      expect(isClientId("33333333-3333-4333-8333-333333333333")).toBe(true);
    });

    it("rejects anything that could not be a primary key", () => {
      for (const value of [
        "",
        "abc",
        "undefined",
        "33333333-3333-4333-8333-33333333333",
        "1 or 1=1",
      ]) {
        expect(isClientId(value), value).toBe(false);
      }
    });
  });

  it("keeps a real value, trimmed", () => {
    const result = clientSchema.parse({
      ...VALID_CLIENT,
      email: "  billing@acme.example  ",
      phone: "  +44 20 7946 0000  ",
      company: "  Acme Ltd  ",
    });

    expect(result.email).toBe("billing@acme.example");
    expect(result.phone).toBe("+44 20 7946 0000");
    expect(result.company).toBe("Acme Ltd");
  });
});
