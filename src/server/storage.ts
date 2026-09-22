import type { UploadedType } from "@/lib/uploads";

/**
 * Where uploaded images are stored.
 *
 * Two drivers, chosen from the environment rather than from a build flag so the same
 * artefact runs locally and in production:
 *
 * - **disk** — writes to `data/uploads/`, served by `src/app/uploads/[file]/route.ts`.
 *   Correct on a VPS or any long-running Node process with a persistent volume.
 * - **supabase** — writes to a public Supabase Storage bucket over its REST API and
 *   returns the CDN URL. Required on Netlify, Vercel or anything else with a read-only
 *   per-invocation filesystem.
 *
 * The bytes are handed to Supabase with plain `fetch`. `@supabase/supabase-js` wraps the
 * same two endpoints used here and pulls in a realtime client, a Postgres client and a
 * GoTrue client to do it; none of that is wanted on a route whose whole job is one PUT.
 *
 * ## Public bucket, on purpose
 *
 * Product photography is public the moment it appears on a product page, so signed URLs
 * would buy nothing and cost a round trip per image plus an expiry to manage. A public
 * bucket means images are served straight from Supabase's CDN and never touch a function
 * invocation. The service-role key is only ever used for *writes*, and only from server
 * code — it is deliberately not `NEXT_PUBLIC_`, because it bypasses row-level security.
 */

export type StorageDriver = "disk" | "supabase";

export interface SupabaseStorageConfig {
  /** Project URL, without a trailing slash. */
  origin: string;
  bucket: string;
  serviceRoleKey: string;
}

/** Trailing slashes make every later template string ambiguous. Strip once, here. */
function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Read the Supabase Storage settings, or null when they are not all present.
 *
 * All three or none: a half-configured bucket that silently falls back to disk is how
 * you discover in production that every image a merchant uploaded last week is gone.
 */
export function supabaseStorageConfig(): SupabaseStorageConfig | null {
  const origin = process.env.SUPABASE_URL?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!origin || !bucket || !serviceRoleKey) return null;
  return { origin: trimSlash(origin), bucket, serviceRoleKey };
}

/**
 * True when the process is running on a platform whose filesystem does not persist.
 *
 * Both platforms set these in every runtime. Detecting the host rather than checking
 * `NODE_ENV` matters because disk storage is entirely correct in production on a VPS —
 * the mistake is specifically disk storage *on a serverless host*, and that is worth
 * refusing to start over rather than discovering when the first upload disappears.
 */
function onEphemeralHost(): boolean {
  return Boolean(process.env.NETLIFY ?? process.env.VERCEL);
}

export function storageDriver(): StorageDriver {
  if (supabaseStorageConfig()) return "supabase";

  if (onEphemeralHost()) {
    throw new Error(
      "Image uploads would be written to a filesystem that does not persist on this host. " +
        "Set SUPABASE_URL, SUPABASE_STORAGE_BUCKET and SUPABASE_SERVICE_ROLE_KEY, or deploy " +
        "somewhere with a writable volume.",
    );
  }

  return "disk";
}

/** The CDN URL a stored object is readable at. Requires the bucket to be public. */
export function supabasePublicUrl(config: SupabaseStorageConfig, name: string): string {
  return `${config.origin}/storage/v1/object/public/${config.bucket}/${name}`;
}

export type PutResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Upload one object and return its public URL.
 *
 * `x-upsert` is set because names are content hashes: re-uploading the same image is the
 * same bytes at the same key, and a 409 in that case would be a confusing failure for
 * what is really a no-op.
 *
 * `cacheControl` is a year. Safe precisely because the key is derived from the contents —
 * an object at a given name can never change, so it can never be stale.
 */
export async function putObject(
  name: string,
  bytes: Uint8Array,
  contentType: UploadedType,
): Promise<PutResult> {
  const config = supabaseStorageConfig();
  if (!config) return { ok: false, error: "Supabase Storage is not configured." };

  const endpoint = `${config.origin}/storage/v1/object/${config.bucket}/${name}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "true",
      },
      /*
       * A Blob rather than the array. `Uint8Array`'s default buffer type allows a
       * `SharedArrayBuffer`, which is not a valid request body, so passing the view
       * directly fails to type-check without a cast.
       */
      body: new Blob([bytes as unknown as BlobPart], { type: contentType }),
      cache: "no-store",
    });
  } catch (error) {
    // Network-level failure. The merchant needs to know it was not their file.
    console.error("[storage] upload request failed:", error);
    return { ok: false, error: "Could not reach image storage. Try again." };
  }

  if (!response.ok) {
    /*
     * The body carries Supabase's own message, which is genuinely useful during setup —
     * "Bucket not found", "new row violates row-level security policy". It is logged
     * rather than returned, because it can name internal configuration.
     */
    const detail = await response.text().catch(() => "");
    console.error(`[storage] upload rejected (${response.status}): ${detail}`);

    if (response.status === 404) {
      return {
        ok: false,
        error: `The storage bucket "${config.bucket}" does not exist. Create it in Supabase and make it public.`,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Image storage rejected the credentials." };
    }
    return { ok: false, error: "Image storage refused the upload." };
  }

  return { ok: true, url: supabasePublicUrl(config, name) };
}
