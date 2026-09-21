/**
 * Test stub for the `server-only` package.
 *
 * The real package resolves to a module that throws unless it is bundled with
 * the React Server Components condition. Vitest resolves the default condition,
 * so `vitest.config.mts` aliases `server-only` to this empty stub, which lets
 * the server-side code be unit tested without weakening the production guard
 * (`next build` still fails if server code is imported into a Client Component).
 */
export {};
