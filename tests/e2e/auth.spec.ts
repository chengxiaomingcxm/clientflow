import { expect, test } from "@playwright/test";

/**
 * Authentication end-to-end tests that need **no live Supabase project**.
 *
 * Everything here is exercised through the server: the protected-layout
 * redirect, the accessible forms, and the validation messages that the Server
 * Actions produce before any credential is exchanged. The suite therefore runs in
 * CI, where no Supabase credentials exist.
 *
 * Flows that genuinely require Supabase Auth live in `auth-live.spec.ts`, which
 * skips itself unless credentials are provided.
 */

/** Matches the server's configuration, because `next start` inherits this env. */
const supabaseIsConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Reads `?next=` without depending on how the value was percent-encoded. */
function nextParam(url: string): string | null {
  return new URL(url).searchParams.get("next");
}

test.describe("protected routes", () => {
  test("sends a visitor without a session from /dashboard to the login page", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe("/dashboard");
  });

  test("remembers where the visitor was heading", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe("/settings");
  });

  test("never renders protected content without a session", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toHaveCount(0);
  });

  test("carries a safe next value into the form", async ({ page }) => {
    await page.goto("/login?next=%2Fsettings");

    await expect(page.locator('input[name="next"]')).toHaveValue("/settings");
  });

  test("refuses to carry an off-site next value into the form", async ({ page }) => {
    await page.goto("/login?next=//evil.example");

    // `sanitizeNextPath` rejects protocol-relative targets, so the form has no
    // return path to submit and sign-in cannot become an open redirect.
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.locator('input[name="next"]')).toHaveValue("");
  });

  test("refuses to carry an encoded off-site next value into the form", async ({ page }) => {
    await page.goto("/login?next=%2F%2Fevil.example");

    await expect(page.locator('input[name="next"]')).toHaveValue("");
  });
});

test.describe("sign-in page", () => {
  test("renders an accessible form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expect(page.getByRole("link", { name: /create one/i })).toBeVisible();
  });

  test("reports an invalid email", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("some-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("reports an empty password", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("owner@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter your password.")).toBeVisible();
  });

  test("loads without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("does not overflow horizontally on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe("registration page", () => {
  test("renders an accessible form with the password policy", async ({ page }) => {
    await page.goto("/register");

    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeVisible();
    await expect(page.getByLabel("Name (optional)")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-describedby", /password-hint/);
    await expect(page.getByText(/including a letter and a number/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("rejects a password with no number", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("Email").fill("new@example.com");
    await page.getByLabel("Password").fill("abcdefgh");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Password must include at least one number.")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  });

  test("rejects an invalid email", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("Email").fill("nope");
    await page.getByLabel("Password").fill("abcd1234");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });
});

test.describe("email confirmation callback", () => {
  test("routes a link without a code to the login page with a safe message", async ({ page }) => {
    await page.goto("/auth/confirm");

    await expect(page).toHaveURL(/\/login\?confirm=/);
    await expect(
      page.getByText(/confirmation link is invalid|could not confirm your email/i),
    ).toBeVisible();
  });

  test("never reflects Supabase error parameters back to the user", async ({ page }) => {
    await page.goto("/auth/confirm?error=access_denied&error_description=LEAKED_INTERNAL_DETAIL");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("LEAKED_INTERNAL_DETAIL")).toHaveCount(0);
  });
});

test.describe("degraded mode without Supabase credentials", () => {
  test.skip(supabaseIsConfigured, "Supabase is configured in this environment");

  test("explains the missing configuration on the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText(/not configured for this environment/i)).toBeVisible();
    // The form is still shown, and nothing internal is leaked.
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByText(/NEXT_PUBLIC_SUPABASE_ANON_KEY is required/i)).toHaveCount(0);
  });
});
