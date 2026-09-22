import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests cover the pure domain logic — order maths, filtering, validation, query
 * parsing — plus the server layer that the admin panel writes through.
 *
 * `PRESTINE_STORE_PATH` redirects the JSON store to a scratch file so a test run
 * never touches `data/store.json`. Each test file gets its own copy because
 * vitest isolates files in separate workers, and the store seeds itself on first
 * read, so no fixture needs committing.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
    env: {
      // Safety net: a test that forgets to scope itself still cannot overwrite
      // the real catalogue. Files that mutate set their own path in `beforeAll`.
      PRESTINE_STORE_PATH: ".test-store/default.json",
      ADMIN_SESSION_SECRET: "test-secret-not-used-in-production",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
