// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));

import { NextRequest } from "next/server";

import { PATHNAME_HEADER } from "@/lib/auth/request-path";
import { config, proxy } from "@/proxy";

import { ANON_KEY, SUPABASE_URL } from "../fixtures/env";

/**
 * Proxy suite (Next.js 16's `proxy` replaces `middleware`).
 *
 * The proxy only refreshes session cookies. These tests pin down that it makes
 * no authorization decisions, never throws, and keeps working when Supabase is
 * not configured — all of which the CI environment depends on.
 */

type CapturedCookies = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};

let capturedCookies: CapturedCookies | undefined;

function stubConfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
}

function stubUnconfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

function createRequest(url = "http://localhost:3000/dashboard", cookie?: string) {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

/** Installs a client whose `getUser` behaves as `impl` describes. */
function mockSupabaseClient(impl?: () => void) {
  createServerClientMock.mockImplementation(
    (_url: string, _key: string, options: { cookies: CapturedCookies }) => {
      capturedCookies = options.cookies;

      return {
        auth: {
          getUser: vi.fn(async () => {
            impl?.();
            return { data: { user: null }, error: null };
          }),
        },
      };
    },
  );
}

beforeEach(() => {
  createServerClientMock.mockReset();
  capturedCookies = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("passes the request through when Supabase is not configured", async () => {
    stubUnconfigured();

    const response = await proxy(createRequest());

    expect(createServerClientMock).not.toHaveBeenCalled();
    // A pass-through, not a redirect: the proxy never authorizes.
    expect(response.headers.get("location")).toBeNull();
  });

  it("refreshes the session when Supabase is configured", async () => {
    stubConfigured();
    mockSupabaseClient();

    await proxy(createRequest());

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock.mock.calls[0]?.[0]).toBe(SUPABASE_URL);
    expect(createServerClientMock.mock.calls[0]?.[1]).toBe(ANON_KEY);
  });

  it("exposes the requested path to Server Components", async () => {
    stubConfigured();
    mockSupabaseClient();

    const response = await proxy(createRequest("http://localhost:3000/settings?tab=profile"));

    const entry = [...response.headers.entries()].find(([name]) =>
      name.includes(PATHNAME_HEADER.toLowerCase()),
    );

    expect(entry?.[1]).toBe("/settings?tab=profile");
  });

  it("reads the incoming cookies and writes refreshed ones back", async () => {
    stubConfigured();
    const request = createRequest("http://localhost:3000/dashboard", "sb-existing=value");

    mockSupabaseClient(() => {
      capturedCookies?.setAll([
        { name: "sb-refreshed", value: "new-session", options: { path: "/" } },
      ]);
    });

    const response = await proxy(request);

    expect(capturedCookies?.getAll()).toContainEqual({ name: "sb-existing", value: "value" });
    expect(response.headers.get("set-cookie")).toContain("sb-refreshed=new-session");
    // The refreshed cookie is also visible to the render happening right after.
    expect(request.cookies.get("sb-refreshed")?.value).toBe("new-session");
  });

  it("continues the request when the Auth service is unreachable", async () => {
    stubConfigured();
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, options: { cookies: CapturedCookies }) => {
        capturedCookies = options.cookies;

        return {
          auth: {
            getUser: vi.fn(async () => {
              throw new TypeError("fetch failed");
            }),
          },
        };
      },
    );

    await expect(proxy(createRequest())).resolves.toBeDefined();
  });

  it("does not redirect anywhere itself", async () => {
    stubConfigured();
    mockSupabaseClient();

    const response = await proxy(createRequest("http://localhost:3000/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves static assets out of the matcher", () => {
    const pattern = String(config.matcher[0]);

    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("favicon.ico");
  });
});
