/**
 * Upload limits, shared by the browser and the server.
 *
 * These live here rather than in `src/server/uploads.ts` because the drop zone needs
 * them too, and that module imports `node:fs` and `node:crypto` — importing it from a
 * client component would drag Node built-ins into the browser bundle.
 *
 * The browser checks are a courtesy: they turn a wasted 6MB upload into an instant
 * message. The server repeats every one of them and does not trust any of this.
 */

/** Hard ceiling per file. Generous for photography, small enough to bound disk use. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * What the file picker advertises, and what the server's byte sniffer will accept.
 *
 * SVG is absent on purpose. It can contain `<script>`, and anything served from your own
 * origin runs in your origin — an uploaded SVG is stored cross-site scripting with a
 * friendly extension.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type UploadedType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** The `accept` attribute for a file input. */
export const UPLOAD_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/** Human-readable limit, for hint text and error messages. */
export const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`;

/**
 * True for a URL the upload pipeline produced.
 *
 * Uploads go to Supabase Storage (see `src/server/storage.ts`), so a valid
 * one is an `https://` URL on this project's Supabase host, under
 * `/storage/v1/object/public/<bucket>/`. Plain URL parsing rather than
 * anything from `@supabase/supabase-js`, since this file is imported by
 * client components (the drop zone) and must stay free of `node:` built-ins
 * and server-only SDKs.
 *
 * `NEXT_PUBLIC_SUPABASE_IMAGE_HOST` is what makes this answer the same way
 * on the server and in the browser — see the same variable's own note in
 * `src/lib/image-hosts.ts`, which this mirrors deliberately rather than
 * importing from (that module also accepts other optimiser hosts, which
 * are not necessarily uploaded images; this function specifically means
 * "did our own upload pipeline produce this URL").
 */
export function isUploadedImage(url: string): boolean {
  const value = url.trim();
  if (!value) return false;

  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  const host =
    process.env.NEXT_PUBLIC_SUPABASE_IMAGE_HOST?.trim() ||
    (() => {
      try {
        return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : "";
      } catch {
        return "";
      }
    })();

  if (!bucket || !host) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== host) return false;
    return parsed.pathname.startsWith(`/storage/v1/object/public/${bucket}/`);
  } catch {
    return false;
  }
}
