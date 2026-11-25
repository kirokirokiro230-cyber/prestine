import { db } from "./supabase";

/**
 * Where uploaded images are stored: Supabase Storage, exclusively.
 *
 * The README's original design gave this file two drivers — disk on a host
 * with a persistent filesystem, Supabase Storage everywhere else — chosen at
 * runtime by `storageDriver()`. That branch is gone: every other read and
 * write in this app now goes through Supabase Postgres, and leaving
 * uploaded photography on local disk would mean the one remaining piece of
 * merchant content not actually "in the database" this migration asked for.
 * Product photography, banner art and category tiles all live in the bucket
 * named by `SUPABASE_STORAGE_BUCKET` from here on, on every host.
 *
 * The bucket must be public — see `supabase/README.md` for why (signing
 * every URL would break CDN caching and `next/image` for no security
 * benefit, since product photos are meant to be public).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and set the name of the ` +
        "public Supabase Storage bucket product photography uploads to.",
    );
  }
  return value;
}

/** The configured bucket name, e.g. `product-images`. */
export function storageBucket(): string {
  return requireEnv("SUPABASE_STORAGE_BUCKET");
}

export interface StorageUploadResult {
  ok: true;
  /** Full public URL, e.g. `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`. */
  url: string;
}

export interface StorageFailure {
  ok: false;
  error: string;
}

/**
 * Upload bytes to the configured bucket and return their public URL.
 *
 * `path` is expected to already be a safe, content-addressed name (see
 * `sniffImageType`/the digest naming in `src/server/uploads.ts`) — this
 * function does not sanitise it further, since the one caller already
 * guarantees that invariant and duplicating the check here would be the
 * same validation trusted twice, which is the kind of duplication that
 * drifts.
 *
 * `upsert: true` — the name is a hash of the content, so re-uploading the
 * same bytes under the same name is expected (two merchants dragging in the
 * same stock photo) and should succeed quietly rather than erroring on a
 * duplicate key.
 */
export async function uploadToStorage(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<StorageUploadResult | StorageFailure> {
  const bucket = storageBucket();

  const { error } = await db().storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const { data } = db().storage.from(bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Delete an uploaded file. Used when an admin removes a photo, not on every edit. */
export async function deleteFromStorage(path: string): Promise<void> {
  const bucket = storageBucket();
  await db().storage.from(bucket).remove([path]);
}
