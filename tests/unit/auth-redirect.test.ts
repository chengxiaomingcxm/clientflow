import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTHENTICATED_PATH,
  buildLoginPath,
  firstSearchParam,
  resolveNextPath,
  sanitizeNextPath,
} from "@/lib/auth/redirect";

/**
 * Open-redirect regression suite.
 *
 * `next` is attacker-controllable, so these tests pin down exactly what is
 * accepted (same-origin absolute paths) and what is refused.
 */
describe("sanitizeNextPath", () => {
  it("accepts same-origin absolute paths", () => {
    for (const path of [
      "/dashboard",
      "/settings",
      "/clients?page=2&sort=name",
      "/projects/8f1c#tasks",
      "/tasks?filter=done",
    ]) {
      expect(sanitizeNextPath(path), path).toBe(path);
    }
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeNextPath("  /dashboard  ")).toBe("/dashboard");
  });

  it("rejects values that are not strings or are empty", () => {
    for (const value of [undefined, null, 42, {}, [], "", "   "]) {
      expect(sanitizeNextPath(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("rejects absolute URLs and scheme-based payloads", () => {
    for (const value of [
      "https://evil.example",
      "http://evil.example/login",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:someone@example.com",
    ]) {
      expect(sanitizeNextPath(value), value).toBeNull();
    }
  });

  it("rejects protocol-relative and backslash variants", () => {
    for (const value of [
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "/\\/evil.example",
    ]) {
      expect(sanitizeNextPath(value), value).toBeNull();
    }
  });

  it("rejects percent-encoded variants of the above", () => {
    for (const value of ["/%2F%2Fevil.example", "/%5Cevil.example", "/%2f%2fevil.example"]) {
      expect(sanitizeNextPath(value), value).toBeNull();
    }
  });

  it("rejects relative paths without a leading slash", () => {
    for (const value of ["dashboard", "settings?tab=1", "../etc/passwd"]) {
      expect(sanitizeNextPath(value), value).toBeNull();
    }
  });

  it("rejects control characters, whitespace and malformed encoding", () => {
    for (const value of ["/dash\nboard", "/dash board", "/dash\tboard", "/%", "/%zz"]) {
      expect(sanitizeNextPath(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("rejects an over-long value", () => {
    expect(sanitizeNextPath(`/${"a".repeat(5000)}`)).toBeNull();
  });
});

describe("resolveNextPath", () => {
  it("falls back to the dashboard for anything unusable", () => {
    expect(resolveNextPath(undefined)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(resolveNextPath("//evil.example")).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it("passes a safe path through", () => {
    expect(resolveNextPath("/settings")).toBe("/settings");
  });
});

describe("buildLoginPath", () => {
  it("encodes the return path as a query parameter", () => {
    expect(buildLoginPath("/projects/1?tab=tasks")).toBe(
      "/login?next=%2Fprojects%2F1%3Ftab%3Dtasks",
    );
  });

  it("omits the parameter when the path is unsafe", () => {
    expect(buildLoginPath("//evil.example")).toBe("/login");
  });

  it("round-trips through sanitizeNextPath", () => {
    const loginPath = buildLoginPath("/settings");
    const encoded = loginPath.slice("/login?next=".length);

    expect(sanitizeNextPath(decodeURIComponent(encoded))).toBe("/settings");
  });
});

describe("firstSearchParam", () => {
  it("returns a single value unchanged", () => {
    expect(firstSearchParam("/settings")).toBe("/settings");
  });

  it("returns the first of a repeated parameter", () => {
    expect(firstSearchParam(["/a", "/b"])).toBe("/a");
  });

  it("returns undefined when absent", () => {
    expect(firstSearchParam(undefined)).toBeUndefined();
  });
});
