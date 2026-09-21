import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * - `tests/unit`   unit/component tests (jsdom + React Testing Library)
 * - `tests/db`     Row Level Security / schema integration tests that talk to a
 *                  real PostgreSQL database (`TEST_DATABASE_URL`); they skip
 *                  themselves when no database is configured.
 * - `tests/e2e`    Playwright, deliberately excluded here.
 *
 * `fileParallelism` is disabled because the database suite resets the schema
 * before it runs, which must not race with other test files.
 *
 * `server-only` resolves to a module that throws outside the React Server
 * Components bundle, so it is aliased to an empty stub for unit tests. The
 * production guard is unaffected: `next build` still fails if server-only code
 * is imported from a Client Component.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 resolves the `@/*` alias from tsconfig.json natively, so the
    // vite-tsconfig-paths plugin is not needed.
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/db/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    globals: false,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
