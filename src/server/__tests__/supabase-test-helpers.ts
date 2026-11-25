/**
 * Shared helpers for tests that talk to a real Supabase project.
 *
 * These are integration tests, not unit tests: they exercise the actual behaviour
 * only Postgres and Supabase Storage provide — unique constraints, cascading
 * deletes, the `security definer` RPCs' transaction semantics — none of which can
 * be faithfully faked with a mock query builder without effectively rebuilding a
 * miniature Postgres in JavaScript. Rather than do that (or require a live
 * connection just to run `npm test`), every file that needs one calls
 * `requireSupabaseTestProject()` in a `beforeAll` and the whole suite reports as
 * skipped, with a clear reason, when no project is configured.
 *
 * ## Running these for real
 *
 * Point `.env.local` (or the environment) at a **disposable test project** —
 * never the production one, since these tests create and delete real rows. The
 * migrations in `supabase/migrations/` must already be applied to it.
 *
 * ## What "no project configured" means here
 *
 * Exactly what `src/server/supabase.ts`'s own `requireEnv` checks for:
 * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` both set. `SUPABASE_STORAGE_BUCKET`
 * is checked too, for the one file (`uploads.test.ts`) that needs Storage as well
 * as Postgres.
 */

export interface SupabaseTestProjectCheck {
  configured: boolean;
  reason: string;
}

function isConfigured(...names: string[]): SupabaseTestProjectCheck {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    return {
      configured: false,
      reason:
        `Skipped: ${missing.join(", ")} not set. These are integration tests against ` +
        "a real (disposable, non-production) Supabase project — see " +
        "src/server/__tests__/supabase-test-helpers.ts for how to run them.",
    };
  }
  return { configured: true, reason: "" };
}

/** For tests that only need Postgres. */
export function checkSupabaseDatabase(): SupabaseTestProjectCheck {
  return isConfigured("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
}

/** For tests that also upload to Supabase Storage. */
export function checkSupabaseStorage(): SupabaseTestProjectCheck {
  return isConfigured("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET");
}

/**
 * A short, collision-resistant tag for this test run's fixtures.
 *
 * Every row a suite creates carries this somewhere identifiable (a slug prefix, a
 * heading, an email local-part) so cleanup can delete "everything this run made"
 * with one filter, and so two runs racing against the same shared project (CI and
 * a developer's machine, say) cannot collide on a fixed slug like `test-hats`.
 */
export function testRunTag(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
