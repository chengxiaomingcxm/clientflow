import { expect, test, type Page } from "@playwright/test";

/**
 * Authentication end-to-end tests that REQUIRE a live Supabase project.
 *
 * ============================================================================
 * NOT VERIFIED AGAINST LIVE SUPABASE
 * ============================================================================
 * ClientFlow has no Supabase project linked yet, so this suite **skips itself**
 * unless the variables below are supplied. It must never be reported as passing
 * unless it actually ran: the skip reason says so explicitly.
 *
 * Required (an existing, already-confirmed account):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   CLIENTFLOW_E2E_EMAIL, CLIENTFLOW_E2E_PASSWORD
 *
 * Optional (a second tenant, to prove cross-tenant isolation in a real browser):
 *   CLIENTFLOW_E2E_OTHER_EMAIL, CLIENTFLOW_E2E_OTHER_PASSWORD
 */

const email = process.env.CLIENTFLOW_E2E_EMAIL;
const password = process.env.CLIENTFLOW_E2E_PASSWORD;
const otherEmail = process.env.CLIENTFLOW_E2E_OTHER_EMAIL;
const otherPassword = process.env.CLIENTFLOW_E2E_OTHER_PASSWORD;

const hasLiveCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  email &&
  password,
);

test.skip(
  !hasLiveCredentials,
  "NOT VERIFIED AGAINST LIVE SUPABASE - requires a linked Supabase project plus CLIENTFLOW_E2E_EMAIL / CLIENTFLOW_E2E_PASSWORD.",
);

async function signIn(page: Page, address: string, secret: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(secret);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("live sign-in", () => {
  test("rejects a wrong password with the neutral message", async ({ page }) => {
    await signIn(page, email ?? "", "definitely-not-the-password-1");

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    await signIn(page, email ?? "", password ?? "");

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });

  test("returns to the originally requested protected page", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email ?? "");
    await page.getByLabel("Password").fill(password ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/settings/);
  });

  test("shows the profile created at sign-up and persists a display-name change", async ({
    page,
  }) => {
    await signIn(page, email ?? "", password ?? "");
    await page.goto("/settings");

    await expect(page.getByText(email ?? "")).toBeVisible();

    const newName = `E2E name ${Date.now()}`;
    await page.getByLabel("Display name").fill(newName);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile updated.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue(newName);
  });

  test("cannot reach a protected route after signing out", async ({ page }) => {
    await signIn(page, email ?? "", password ?? "");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("visit /login while already signed in goes to the dashboard", async ({ page }) => {
    await signIn(page, email ?? "", password ?? "");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/login");

    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("live cross-tenant isolation", () => {
  test.skip(
    !otherEmail || !otherPassword,
    "Set CLIENTFLOW_E2E_OTHER_EMAIL / CLIENTFLOW_E2E_OTHER_PASSWORD for a second tenant to verify isolation.",
  );

  test("the second tenant sees their own profile, never the first tenant's", async ({ page }) => {
    await signIn(page, otherEmail ?? "", otherPassword ?? "");
    await page.goto("/settings");

    await expect(page.getByText(otherEmail ?? "")).toBeVisible();
    await expect(page.getByText(email ?? "", { exact: true })).toHaveCount(0);
  });
});

test.describe("live registration", () => {
  test("creates an account, or asks for email confirmation", async ({ page }) => {
    const uniqueEmail = `clientflow-e2e-${Date.now()}@example.com`;

    await page.goto("/register");
    await page.getByLabel("Name (optional)").fill("E2E Signup");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByLabel("Password").fill("e2e-password-1");
    await page.getByRole("button", { name: "Create account" }).click();

    // Which outcome is correct depends on the project's email-confirmation
    // setting, so both are accepted — and only those two.
    await expect(
      page
        .getByRole("heading", { level: 1, name: "Dashboard" })
        .or(page.getByText(/check your inbox/i)),
    ).toBeVisible();
  });
});
