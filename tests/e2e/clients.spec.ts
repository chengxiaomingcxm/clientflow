import { expect, test, type Page } from "@playwright/test";

/**
 * Clients end-to-end tests.
 *
 * The suite is split the same way the Phase 1 authentication suite is:
 *
 *  - **No credentials needed.** The protected-route behaviour of every client URL
 *    is exercised through the server, including that a visitor without a session
 *    is sent to the login page with a safe return path and never sees a client
 *    list. These tests run in CI.
 *  - **Live Supabase required.** Creating, reading, editing and deleting a client
 *    needs a real session and real rows. That block skips itself unless
 *    `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
 *    `CLIENTFLOW_E2E_EMAIL` and `CLIENTFLOW_E2E_PASSWORD` are all supplied (see
 *    `.env.example`), and it must never be reported as passing if it did not run.
 *
 * Nothing here weakens a security guarantee to make a test pass: tenant isolation
 * is proven in `tests/db/clients-rls.test.ts` against a real database as the
 * `authenticated` and `anon` roles.
 */

const email = process.env.CLIENTFLOW_E2E_EMAIL;
const password = process.env.CLIENTFLOW_E2E_PASSWORD;

const hasLiveCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  email &&
  password,
);

/** A syntactically valid UUID that no tenant owns. */
const UNKNOWN_CLIENT_ID = "00000000-0000-4000-8000-000000000000";

/** Reads `?next=` without depending on how the value was percent-encoded. */
function nextParam(url: string): string | null {
  return new URL(url).searchParams.get("next");
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("protected client routes", () => {
  test("sends a visitor without a session from /clients to the login page", async ({ page }) => {
    await page.goto("/clients");

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe("/clients");
  });

  test("sends a visitor without a session away from the create form", async ({ page }) => {
    await page.goto("/clients/new");

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe("/clients/new");
  });

  test("sends a visitor without a session away from a client detail URL", async ({ page }) => {
    await page.goto(`/clients/${UNKNOWN_CLIENT_ID}`);

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe(`/clients/${UNKNOWN_CLIENT_ID}`);
  });

  test("sends a visitor without a session away from the edit form", async ({ page }) => {
    await page.goto(`/clients/${UNKNOWN_CLIENT_ID}/edit`);

    await expect(page).toHaveURL(/\/login/);
    expect(nextParam(page.url())).toBe(`/clients/${UNKNOWN_CLIENT_ID}/edit`);
  });

  test("never renders client data without a session", async ({ page }) => {
    await page.goto("/clients");

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New client" })).toHaveCount(0);
  });
});

test.describe("live client management", () => {
  test.skip(
    !hasLiveCredentials,
    "NOT VERIFIED AGAINST LIVE SUPABASE - requires a linked Supabase project plus CLIENTFLOW_E2E_EMAIL / CLIENTFLOW_E2E_PASSWORD.",
  );

  test("renders the list page with its call to action", async ({ page }) => {
    await signIn(page);

    await page.goto("/clients");

    await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New client" })).toHaveAttribute(
      "href",
      "/clients/new",
    );

    // Exactly one of the two states is valid: rows, or the empty state. Both are
    // rendered by the server; which one appears depends on the tenant's data.
    const hasRows = (await page.getByRole("list", { name: "Clients" }).count()) > 0;
    const hasEmptyState = (await page.getByText("No clients yet").count()) > 0;

    expect(hasRows || hasEmptyState).toBe(true);
  });

  test("rejects an invalid submission without leaving the form", async ({ page }) => {
    await signIn(page);

    await page.goto("/clients/new");
    await page.getByLabel("Client name").fill("   ");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Create client" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByLabel("Client name")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/clients\/new$/);
  });

  test("creates, shows, edits and deletes a client", async ({ page }) => {
    const name = `E2E Client ${Date.now()}`;
    const renamed = `${name} renamed`;

    await signIn(page);

    // Create
    await page.goto("/clients/new");
    await page.getByLabel("Client name").fill(name);
    await page.getByLabel("Company").fill("E2E Ltd");
    await page.getByLabel("Email").fill("e2e@example.com");
    await page.getByLabel("Phone").fill("+44 20 7946 0000");
    await page.getByLabel("Notes").fill("Created by the Playwright suite.");
    await page.getByRole("button", { name: "Create client" }).click();

    // Detail
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("e2e@example.com")).toBeVisible();
    await expect(page.getByText("+44 20 7946 0000")).toBeVisible();

    // The list links to it
    await page.getByRole("link", { name: /Back to clients/ }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();

    // Edit
    await page.getByRole("link", { name }).click();
    await page.getByRole("link", { name: "Edit client" }).click();
    await expect(page.getByLabel("Client name")).toHaveValue(name);

    await page.getByLabel("Client name").fill(renamed);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

    // Delete, with an explicit confirmation step before anything is submitted
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();
    await page.getByRole("button", { name: `Yes, delete ${renamed}` }).click();

    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByRole("link", { name: renamed })).toHaveCount(0);
  });

  test("reports a client the signed-in user does not have as not found", async ({ page }) => {
    await signIn(page);

    const response = await page.goto(`/clients/${UNKNOWN_CLIENT_ID}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Client not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to clients" })).toBeVisible();
  });

  test("reports a client that cannot be edited as not found", async ({ page }) => {
    await signIn(page);

    const response = await page.goto(`/clients/${UNKNOWN_CLIENT_ID}/edit`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Edit client" })).toHaveCount(0);
  });
});
