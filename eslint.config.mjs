import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-prettier` is applied last so that formatting is owned by
 * Prettier only (`next build` no longer runs linting as of Next.js 16, so the
 * `lint` script calls the ESLint CLI directly).
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build and test artifacts:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
