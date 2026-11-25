import { createHash } from "node:crypto";
import {
  ACCEPTED_IMAGE_TYPES,
  isUploadedImage,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  type UploadedType,
} from "@/lib/uploads";
import { uploadToStorage } from "./storage";

export { ACCEPTED_IMAGE_TYPES, isUploadedImage, MAX_UPLOAD_BYTES };

/**
 * Image storage for the admin panel.
 *
 * ## Where files go
 *
 * Every uploaded image goes to the Supabase Storage bucket named by
 * `SUPABASE_STORAGE_BUCKET` (see `src/server/storage.ts`), served straight
 * from Supabase's CDN rather than a route handler this app owns. There is
 * no local disk path any more — every host this app runs on now reads and
 * writes the same bucket, which is what makes an uploaded photo look
 * identical whether the app is on a VPS or on Vercel.
 *
 * ## Why the checks are what they are
 *
 * File upload is the most reliably exploited surface in an admin panel, so:
 *
 * - **The declared type is ignored.** `File.type` comes from the browser and is trivial
 *   to forge. The real type is sniffed from the leading bytes.
 * - **SVG is refused.** An SVG can contain `<script>`, and anything served from your own
 *   origin runs in your origin — an uploaded SVG is stored cross-site scripting with a
 *   friendly file extension. There is no safe way to serve arbitrary SVG inline, so it
 *   is rejected rather than sanitised.
 * - **The client never names the file.** The name is a hash of the contents, so
 *   path traversal cannot be expressed, and two uploads of the same image collapse into
 *   one object in the bucket.
 * - **Size is capped** before anything is uploaded.
 */

const EXTENSIONS: Record<UploadedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Identify an image from its leading bytes.
 *
 * Returns null for anything not recognised, which includes SVG — it is text, has no
 * magic number, and is refused on purpose.
 */
export function sniffImageType(bytes: Uint8Array): UploadedType | null {
  const at = (offset: number, signature: number[]) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  // FF D8 FF
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // 89 "PNG" CR LF SUB LF
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // "GIF8"
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return "image/gif";

  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  // RIFF container with a WEBP fourcc.
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";

  // ISO base media file: "ftyp" at 4, brand at 8. AVIF images and sequences.
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  return null;
}

export type SaveResult =
  | { ok: true; url: string; type: UploadedType; bytes: number }
  | { ok: false; error: string };

/**
 * Validate and store one image, returning the public URL to reference it by.
 *
 * Never throws for bad input — a merchant dropping a PDF is an ordinary event, not an
 * exception, and the caller needs the message to show them.
 */
export async function saveImage(file: File): Promise<SaveResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  if (file.size > MAX_UPLOAD_BYTES) {
    const size = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `That image is ${size}MB. The limit is ${MAX_UPLOAD_LABEL}.` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);

  if (!type) {
    return {
      ok: false,
      // Named explicitly, because "unsupported file" leaves a merchant guessing —
      // and SVG in particular is a reasonable thing to try.
      error:
        "That is not a supported image. Use JPEG, PNG, WebP, AVIF or GIF. SVG is not accepted.",
    };
  }

  /**
   * Content-addressed name: same bytes, same file, uploaded once. Sixteen hex
   * characters of SHA-256 is 64 bits — far beyond collision range for a product
   * catalogue, and short enough to stay readable in a URL. Prefixed with a fixed
   * folder inside the bucket rather than left flat, purely so the bucket's own file
   * browser in the Supabase dashboard is navigable — it has no bearing on the URL a
   * merchant or the storefront ever sees.
   */
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const name = `products/${digest}.${EXTENSIONS[type]}`;

  const result = await uploadToStorage(name, bytes, type);
  if (!result.ok) {
    return { ok: false, error: `Could not upload that image: ${result.error}` };
  }

  return { ok: true, url: result.url, type, bytes: file.size };
}
