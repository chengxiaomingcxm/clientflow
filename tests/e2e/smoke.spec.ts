import { expect, test } from "@playwright/test";

/**
 * Phase 0 smoke tests.
 *
 * They verify that the application shell renders, that the production server
 * responds correctly and that the page does not break at mobile width. Business
 * flows (auth, clients, projects, tasks) are covered in later phases.
 */
test("renders the ClientFlow Phase 0 status page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ClientFlow foundation");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Phase 0");
  await expect(page).toHaveTitle(/ClientFlow/);
});

test("returns a 404 response for unknown routes", async ({ page }) => {
  const response = await page.goto("/no-such-page");

  expect(response?.status()).toBe(404);
});

test("loads without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("does not overflow horizontally on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
