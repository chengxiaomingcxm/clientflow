import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthFailure,
  describeAuthFailure,
  logAuthFailure,
  type AuthFailureCode,
  type AuthOperation,
} from "@/lib/auth/errors";

/**
 * Error-mapping suite.
 *
 * Two properties are asserted for every case: the mapped code is the expected
 * one, and the user-facing message never contains upstream text.
 */

/** A distinctive string placed in upstream messages to prove it never leaks. */
const UPSTREAM_SECRET = "upstream-internal-detail-9f3a";

function apiError(code: string, status = 400): AuthApiError {
  return new AuthApiError(UPSTREAM_SECRET, status, code as never);
}

type Case = {
  name: string;
  error: unknown;
  operation: AuthOperation;
  expected: AuthFailureCode;
};

const CASES: Case[] = [
  {
    name: "wrong password or unknown email",
    error: apiError("invalid_credentials"),
    operation: "sign_in",
    expected: "invalid_credentials",
  },
  {
    name: "invalid grant",
    error: apiError("invalid_grant"),
    operation: "sign_in",
    expected: "invalid_credentials",
  },
  {
    name: "unconfirmed email",
    error: apiError("email_not_confirmed"),
    operation: "sign_in",
    expected: "email_not_confirmed",
  },
  {
    name: "duplicate address during sign-up",
    error: apiError("email_exists", 422),
    operation: "sign_up",
    expected: "account_creation_failed",
  },
  {
    name: "duplicate address surfaced during sign-in",
    error: apiError("user_already_exists", 422),
    operation: "sign_in",
    expected: "invalid_credentials",
  },
  {
    name: "rejected password",
    error: new AuthWeakPasswordError(UPSTREAM_SECRET, 422, ["length"]),
    operation: "sign_up",
    expected: "weak_password",
  },
  {
    name: "rate limited by status",
    error: apiError("over_request_rate_limit", 429),
    operation: "sign_in",
    expected: "rate_limited",
  },
  {
    name: "rate limited by code only",
    error: apiError("over_email_send_rate_limit"),
    operation: "sign_up",
    expected: "rate_limited",
  },
  {
    name: "auth service failure",
    error: apiError("unexpected_failure", 503),
    operation: "sign_in",
    expected: "service_unavailable",
  },
  {
    name: "auth service unreachable",
    error: new AuthRetryableFetchError(UPSTREAM_SECRET, 0),
    operation: "load_user",
    expected: "service_unavailable",
  },
  {
    name: "network failure surfaced as TypeError",
    error: new TypeError("fetch failed"),
    operation: "load_user",
    expected: "service_unavailable",
  },
  {
    name: "no session on the request",
    error: new AuthSessionMissingError(),
    operation: "load_user",
    expected: "session_expired",
  },
  {
    name: "stale refresh token",
    error: apiError("refresh_token_not_found"),
    operation: "load_user",
    expected: "session_expired",
  },
  {
    name: "an unrecognised failure",
    error: new Error(UPSTREAM_SECRET),
    operation: "sign_in",
    expected: "unexpected",
  },
];

describe("describeAuthFailure", () => {
  it.each(CASES)("maps $name to $expected", ({ error, operation, expected }) => {
    expect(describeAuthFailure(error, operation).code).toBe(expected);
  });

  it("never exposes upstream text in the user-facing message", () => {
    for (const { error, operation } of CASES) {
      const failure = describeAuthFailure(error, operation);

      expect(failure.message, failure.code).not.toContain(UPSTREAM_SECRET);
      expect(failure.message, failure.code).not.toMatch(/AuthApiError|Error:/);
      expect(failure.diagnostic).not.toHaveProperty("message");
    }
  });

  it("keeps sanitised upstream metadata for server logs", () => {
    const failure = describeAuthFailure(apiError("email_not_confirmed", 400), "sign_up");

    expect(failure.diagnostic).toEqual({
      operation: "sign_up",
      upstreamName: "AuthApiError",
      upstreamCode: "email_not_confirmed",
      upstreamStatus: 400,
    });
  });

  it("uses one identical message for wrong password and unknown email", () => {
    const wrongPassword = describeAuthFailure(apiError("invalid_credentials"), "sign_in");
    const unknownEmail = describeAuthFailure(apiError("invalid_credentials"), "sign_in");

    expect(wrongPassword.message).toBe(unknownEmail.message);
    expect(wrongPassword.message).toBe("Incorrect email or password.");
  });

  it("does not confirm that an address is already registered", () => {
    const failure = describeAuthFailure(apiError("email_exists", 422), "sign_up");

    expect(failure.message).not.toMatch(/already (registered|exists|in use)/i);
    expect(failure.message).not.toContain("example.com");
  });

  it("reports a missing configuration as its own state", () => {
    const failure = createAuthFailure("not_configured", "sign_in");

    expect(failure.code).toBe("not_configured");
    expect(failure.message).toMatch(/not configured/i);
    expect(failure.diagnostic.upstreamName).toBe("none");
  });
});

describe("logAuthFailure", () => {
  // `restoreMocks` is enabled in vitest.config.mts, so the spy is created per
  // test rather than once at module scope.
  function spyOnConsoleError() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("logs only the operation and sanitised upstream metadata", () => {
    const errorSpy = spyOnConsoleError();

    logAuthFailure(describeAuthFailure(apiError("invalid_credentials"), "sign_in"));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0]?.[0]);

    expect(logged).toContain("sign_in");
    expect(logged).toContain("invalid_credentials");
    expect(logged).not.toContain(UPSTREAM_SECRET);
  });

  it("never logs credentials", () => {
    const errorSpy = spyOnConsoleError();

    logAuthFailure(describeAuthFailure(new Error("fetch failed"), "sign_in"));

    const logged = String(errorSpy.mock.calls[0]?.[0]);

    for (const secret of ["password", "token", "cookie", "jwt", "authorization"]) {
      expect(logged.toLowerCase(), secret).not.toContain(secret);
    }
  });
});
