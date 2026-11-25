import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests cover the pure domain logic — order maths, filtering, validation, query
 * parsing, HTML-escaping and token substitution in email rendering — plus a
 * smaller set of integration tests that exercise the repository layer against a
 * real Supabase project.
 *
 * The pure-logic files need nothing here and run everywhere, including CI. The
 * integration files (see `src/server/__tests__/supabase-test-helpers.ts`) check
 * for `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` themselves and report as skipped
 * — with a clear reason — when no test project is configured, rather than this
 * file trying to stand one up or fake one.
 *
 * `ADMIN_SESSION_SECRET` is still set globally: `src/server/tokens.ts` requires
 * one at least 32 characters long outside development, and `NODE_ENV` is `test`
 * during a vitest run, not `development`, so the dev-only fallback does not apply.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
    env: {
      ADMIN_SESSION_SECRET: "test-secret-not-used-in-production-aaaaaaaaaaaaaaaaaaaaaaaaaa",
      CUSTOMER_SESSION_SECRET: "test-secret-not-used-in-production-bbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
