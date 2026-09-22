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

/** True for a URL the upload pipeline produced. Used to validate merchant input. */
export function isUploadedImage(url: string): boolean {
  return /^\/uploads\/[0-9a-f]{16}\.(jpg|png|webp|avif|gif)$/.test(url.trim());
}
