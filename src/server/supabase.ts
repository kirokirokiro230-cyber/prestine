import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { Database } from "./database.types";

/**
 * A `PostgrestFilterBuilder` typed loosely enough to sidestep the inference
 * break described below, but concretely enough that `.overrideTypes()`,
 * `.eq()`, `.select()` and friends remain callable, generic-argument-
 * accepting methods rather than becoming "untyped function calls" (which
 * TypeScript refuses to pass explicit type arguments to).
 *
 * Every generic slot here is `any`, including `Row` — narrowing `Row` to
 * something more specific (`Record<string, unknown>` was tried) makes it
 * covariantly incompatible with the real, broken-inference builder the
 * client's own `.from()` returns (which carries `never` in that slot), so
 * assigning a real query into this type fails before a caller ever reaches
 * `.overrideTypes()`. `any` is the one variance-safe choice; every caller
 * still recovers full type safety by narrowing the *result* explicitly with
 * `.overrideTypes<Row, { merge: false }>()`, which is the actual safety net
 * this whole file exists to provide.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFilterBuilder = PostgrestFilterBuilder<any, any, any, any>;

/**
 * The server-side Supabase client.
 *
 * Every repository in `src/server/repositories/` — and `auth.ts`, `audit.ts`,
 * `customers.ts`, `otp.ts`, `metrics.ts` — talks to Postgres exclusively
 * through the client returned by `db()`. Nothing above that layer imports
 * `@supabase/supabase-js` directly, the same discipline the old
 * `src/server/store.ts` documented for itself: the port is contained to
 * `src/server/`, no page or component changes.
 *
 * ## Why the service role key, always
 *
 * This client is constructed with `SUPABASE_SERVICE_ROLE_KEY`, never the anon
 * key. The service role bypasses Row Level Security entirely, which is
 * correct here: every read and write this app performs already goes through
 * a Next.js server action, route handler or server component, which is
 * itself gated by `requireAdmin` / `requirePermission`
 * (`src/server/session.ts`) or the customer claim-ticket pattern
 * (`src/app/actions/orders.ts`). That authorization check is the actual
 * security boundary — RLS in `supabase/migrations/00000000000002_rls.sql` is
 * a backstop against the anon key ever being used directly from the browser,
 * which today it is not.
 *
 * Getting this backwards — using the anon key here — would mean every
 * "service-role only" table (admins, customers, orders, audit_log, ...)
 * silently returns zero rows to server code, because RLS has no policy
 * granting the anon role access to them. That failure mode is quiet (empty
 * results, not an error), which is exactly why this file exists as the one
 * place the choice is made, rather than leaving each repository to construct
 * its own client and risk picking the wrong key.
 *
 * This module lives under `src/server/`, which no client component imports
 * from — the same boundary the rest of this directory (auth.ts, store.ts
 * before it) has always relied on, rather than a build-time guard package.
 */

let client: SupabaseClient<Database> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill in your ` +
        "Supabase project's URL and service role key (Project Settings → API).",
    );
  }
  return value;
}

/**
 * The shared Supabase client for server-side use.
 *
 * Lazily constructed and cached for the lifetime of the process — the same
 * "read once, reuse" shape `readStore()` used for the JSON document, kept so
 * every call site in the repository layer stays a one-line `db()` rather than
 * threading a client through every function signature.
 */
export function db(): SupabaseClient<Database> {
  if (client) return client;

  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  client = createClient<Database>(url, serviceRoleKey, {
    auth: {
      // This client never signs a user in and never needs to persist a
      // session of its own — every request constructs it fresh (or reuses
      // the process-lifetime singleton above) and authorizes through this
      // app's own admin/customer cookies, not a Supabase Auth session.
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  return client;
}

/**
 * Unwrap a Supabase `{ data, error }` result, throwing on error.
 *
 * `supabase-js` never throws on a query error by default — it returns it
 * alongside `data: null`. Every repository function in this codebase is
 * written in the "throw on failure, return the value on success" style the
 * JSON-store repositories already used (`mutateStore` rejects, callers
 * `await` and let it propagate), so this helper is the one place that
 * difference is bridged rather than every call site remembering to check
 * `error` by hand.
 *
 * ## `.overrideTypes()` is mandatory before calling this
 *
 * As of the `supabase-js`/`postgrest-js` versions pinned in `package.json`,
 * the compile-time string parser that turns a `.select("*")` (or any select
 * string) into a row type does not resolve against a hand-authored
 * `Database` type the way it does against one generated by
 * `supabase gen types` — every query in this repository layer that went
 * through inference alone came back typed `never`, confirmed by isolated
 * reproduction against the installed package's own `.d.mts` (traced through
 * `SupabaseClient`'s and `PostgrestClient`'s generic defaults, which resolve
 * correctly in isolation; the failure is specific to the `GetResult` select-
 * string parser downstream of `.select()`, not to this file's `Database`
 * shape). Regenerating `database.types.ts` for real from a linked project
 * (see the comment at the top of that file) may resolve this on its own,
 * since the CLI's output is what that parser is tested against — but until
 * that has been done and verified, every query passed to `unwrap()` MUST
 * end its chain with `.overrideTypes<Row, { merge: false }>()` (or
 * `Row[]` for a query without `.single()`/`.maybeSingle()`), naming the
 * exact row type from `database.types.ts` it expects back. Without it,
 * `unwrap`'s own generic `T` has nothing correctly-typed to infer from and
 * every field access downstream silently becomes `never`.
 *
 * @example
 * ```ts
 * const row = unwrap(
 *   await db()
 *     .from("products")
 *     .select("*")
 *     .eq("id", id)
 *     .maybeSingle()
 *     .overrideTypes<ProductRow, { merge: false }>(),
 * );
 * ```
 */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  // A null data with no error means "zero rows", which callers that expect
  // exactly one row (e.g. `.single()`) should already be distinguishing with
  // `.maybeSingle()` if absence is a valid outcome — so this cast is safe for
  // every call site in the repository layer, which always knows which shape
  // it asked for.
  return result.data as T;
}

/* ------------------------------------------------------------------ */
/* Typed insert/update payload helpers                                 */
/* ------------------------------------------------------------------ */

/**
 * The same inference break described in `unwrap()`'s doc comment also
 * affects `.insert()`/`.update()`'s *argument* type — where `.overrideTypes()`
 * only fixes the return side, the parameter constraint (`Relation['Insert']`)
 * resolves to `never` before a caller's object literal is ever checked
 * against it. `.overrideTypes()` has nothing to override there.
 *
 * These two helpers exist so that break is fixed in exactly one place rather
 * than an unsafe `as unknown as never[]` cast at every call site in every
 * repository file. Each still fully type-checks its `values`/`patch`
 * argument against the real `Insert`/`Update` shape from `Database` — the
 * cast happens only on the way into the actual (broken-inference) builder
 * call, where TypeScript can no longer usefully check anything anyway.
 *
 * Usage stays inside `src/server/repositories/`, mirroring `db()`/`unwrap()`:
 *
 * ```ts
 * unwrap(
 *   await insertInto(db(), "product_colors", rows)
 *     .overrideTypes<ProductColorRow[], { merge: false }>(),
 * );
 * ```
 */
export function insertInto<TableName extends keyof Database["public"]["Tables"]>(
  client: SupabaseClient<Database>,
  table: TableName,
  values:
    | Database["public"]["Tables"][TableName]["Insert"]
    | Database["public"]["Tables"][TableName]["Insert"][],
): AnyFilterBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from(table as any) as any).insert(values as never) as AnyFilterBuilder;
}

/** Same workaround as `insertInto`, for `.upsert()`. */
export function upsertInto<TableName extends keyof Database["public"]["Tables"]>(
  client: SupabaseClient<Database>,
  table: TableName,
  values:
    | Database["public"]["Tables"][TableName]["Insert"]
    | Database["public"]["Tables"][TableName]["Insert"][],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
): AnyFilterBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from(table as any) as any).upsert(values as never, options) as AnyFilterBuilder;
}

export function updateTable<TableName extends keyof Database["public"]["Tables"]>(
  client: SupabaseClient<Database>,
  table: TableName,
  patch: Database["public"]["Tables"][TableName]["Update"],
): AnyFilterBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from(table as any) as any).update(patch as never) as AnyFilterBuilder;
}

/**
 * Call a `security definer` RPC (see
 * `supabase/migrations/00000000000003_functions.sql`) with the same
 * inference workaround as `insertInto`/`updateTable`: `.rpc()`'s argument
 * type resolves against `Database["public"]["Functions"][Name]["Args"]`
 * through the same broken chain, so a plain `db().rpc("name", args)` call
 * types `args` as `undefined` no matter what is actually declared for that
 * function. This still fully checks `args` against the real `Args` shape
 * before the cast, and returns the real `Returns` type on the result — only
 * the one call into `.rpc()` itself is unchecked.
 */
export async function callRpc<
  FnName extends keyof Database["public"]["Functions"],
>(
  client: SupabaseClient<Database>,
  fn: FnName,
  args: Database["public"]["Functions"][FnName]["Args"],
): Promise<{
  data: Database["public"]["Functions"][FnName]["Returns"] | null;
  error: { message: string } | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.rpc as any)(fn, args);
}
