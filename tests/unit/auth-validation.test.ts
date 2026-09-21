import { describe, expect, it } from "vitest";

import {
  EMAIL_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  loginSchema,
  optionalFullNameSchema,
  registerSchema,
  updateProfileSchema,
} from "@/lib/validation/auth";

const VALID_REGISTRATION = {
  email: "owner@example.com",
  password: "correct-horse1",
  fullName: "",
};

describe("email field", () => {
  it("normalises surrounding whitespace and upper case", () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      email: "  Owner@Example.COM  ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("owner@example.com");
  });

  it("rejects values that are not email addresses", () => {
    for (const email of ["", "   ", "owner", "owner@", "@example.com", "owner@example"]) {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, email }).success, email).toBe(false);
    }
  });

  it("rejects an address longer than the database column allows", () => {
    const localPart = "a".repeat(EMAIL_MAX_LENGTH);
    const tooLong = `${localPart}@example.com`;

    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, email: tooLong }).success).toBe(false);
  });

  it("reports a field-level error the form can display", () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTRATION, email: "nope" });

    expect(result.error?.issues[0]?.path).toEqual(["email"]);
    expect(result.error?.issues[0]?.message).toMatch(/valid email/i);
  });
});

describe("password policy for new accounts", () => {
  it("accepts a password that satisfies the policy", () => {
    expect(registerSchema.safeParse(VALID_REGISTRATION).success).toBe(true);
  });

  it("rejects passwords that are too short or too long", () => {
    expect(
      registerSchema.safeParse({
        ...VALID_REGISTRATION,
        password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        ...VALID_REGISTRATION,
        password: `a1${"b".repeat(PASSWORD_MAX_LENGTH)}`,
      }).success,
    ).toBe(false);
  });

  it("requires both a letter and a number", () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, password: "abcdefgh" }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, password: "12345678" }).success).toBe(
      false,
    );
  });
});

describe("sign-in validation", () => {
  it("does not impose the new-account policy on an existing password", () => {
    // An account created before the policy must still be able to sign in.
    const result = loginSchema.safeParse({ email: "owner@example.com", password: "old" });

    expect(result.success).toBe(true);
  });

  it("still rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "owner@example.com", password: "" }).success).toBe(false);
  });
});

describe("display name", () => {
  it("treats an empty or whitespace-only value as not provided", () => {
    expect(optionalFullNameSchema.parse("")).toBeNull();
    expect(optionalFullNameSchema.parse("   ")).toBeNull();
  });

  it("trims and keeps a real name", () => {
    expect(optionalFullNameSchema.parse("  Ada Lovelace  ")).toBe("Ada Lovelace");
  });

  it("rejects a name longer than the database constraint allows", () => {
    expect(optionalFullNameSchema.safeParse("a".repeat(FULL_NAME_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  it("requires a non-empty name when updating the profile", () => {
    expect(updateProfileSchema.safeParse({ fullName: "   " }).success).toBe(false);
    expect(updateProfileSchema.parse({ fullName: "  Ada  " })).toEqual({ fullName: "Ada" });
  });
});

describe("registration payload", () => {
  it("defaults the optional name to null", () => {
    const result = registerSchema.safeParse({ email: "owner@example.com", password: "abcd1234" });

    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBeNull();
  });

  it("carries a sanitised next path through unchanged for later checks", () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTRATION, next: "/settings" });

    expect(result.data?.next).toBe("/settings");
  });
});
