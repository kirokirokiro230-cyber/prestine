import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  isUploadedImage,
  type UploadedType,
} from "@/lib/uploads";
import { putObject, storageDriver } from "./storage";

export { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, isUploadedImage };

/**
 * Image storage for the admin panel.
 *
 * ## Where files go
 *
 * Two destinations, chosen at runtime by `storageDriver()` — see `src/server/storage.ts`
 * for the selection rules:
 *
 * - **disk**: `data/uploads/`, next to `data/store.json`, served by the route handler at
 *   `src/app/uploads/[file]/route.ts`. Files deliberately do **not** live in `public/`:
 *   that directory is build *input*, and mixing merchant content into it means a deploy
 *   either wipes the uploads or bakes them into the image.
 * - **supabase**: a public Storage bucket, returning its CDN URL directly. Required on
 *   Netlify and Vercel, where the filesystem is read-only and per-invocation.
 *
 * Callers get a URL and nothing else. Validation, naming and sniffing are identical on
 * both paths — only the final write differs, which is the whole point of the split.
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
 *   `../../.env` and friends cannot be expressed, and two uploads of the same image
 *   collapse into one file.
 * - **Size is capped** before anything is written.
 */

const EXTENSIONS: Record<UploadedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Where the bytes live, and the path to one file inside it.
 *
 * Both are written as a single fully-spelled-out `path.join` so the build can prove the
 * result stays under `data/uploads`. Composing them — joining a directory helper with a
 * filename — reads better but defeats that analysis, and Turbopack then traces the entire
 * project into the server output because it cannot tell which paths are reachable.
 *
 * The `PRESTINE_UPLOAD_DIR` override exists only for the test suite, which does not run
 * through the bundler, so that branch carries the ignore marker instead.
 */
function uploadDir(): string {
  const override = process.env.PRESTINE_UPLOAD_DIR;
  if (!override) return path.join(process.cwd(), "data", "uploads");

  return path.join(/* turbopackIgnore: true */ process.cwd(), override);
}

function uploadPath(name: string): string {
  const override = process.env.PRESTINE_UPLOAD_DIR;
  if (!override) return path.join(process.cwd(), "data", "uploads", name);

  return path.join(/* turbopackIgnore: true */ process.cwd(), override, name);
}

/** The public path a saved file is reachable at. */
const PUBLIC_PREFIX = "/uploads/";

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
 * Validate and store one image, returning the URL to reference it by.
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
   * catalogue, and short enough to stay readable in a URL.
   */
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const name = `${digest}.${EXTENSIONS[type]}`;

  if (storageDriver() === "supabase") {
    const stored = await putObject(name, bytes, type);
    if (!stored.ok) return { ok: false, error: stored.error };
    return { ok: true, url: stored.url, type, bytes: file.size };
  }

  await mkdir(uploadDir(), { recursive: true });
  await writeFile(uploadPath(name), bytes);

  return { ok: true, url: `${PUBLIC_PREFIX}${name}`, type, bytes: file.size };
}

export type ReadResult =
  /**
   * `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`. The default type parameter is
   * `ArrayBufferLike`, which allows a `SharedArrayBuffer` — and a shared buffer is not a
   * valid response body, so the serving route would not type-check. Being specific here
   * is what keeps the route free of casts.
   */
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; type: UploadedType }
  | { ok: false };

/**
 * Read a stored image for the serving route.
 *
 * The requested name is matched against the exact pattern this module writes rather
 * than being joined onto a path and hoped for. `..`, absolute paths, encoded
 * separators and every other traversal trick fail the pattern, so no path arithmetic
 * is ever performed on caller-supplied text.
 */
export async function readImage(name: string): Promise<ReadResult> {
  if (!isUploadedImage(`${PUBLIC_PREFIX}${name}`)) return { ok: false };

  const extension = name.slice(name.lastIndexOf(".") + 1);
  const type = (Object.keys(EXTENSIONS) as UploadedType[]).find(
    (candidate) => EXTENSIONS[candidate] === extension,
  );
  if (!type) return { ok: false };

  try {
    /*
     * The join is spelled out here rather than taken from `uploadPath`, because the
     * build's static analysis cannot see through a function call — and a `readFile` it
     * cannot resolve is what makes it trace the entire project into the server bundle.
     * Writing does not have this problem; only reading pulls files into the trace.
     */
    const override = process.env.PRESTINE_UPLOAD_DIR;
    const raw = override
      ? await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), override, name))
      : await readFile(path.join(process.cwd(), "data", "uploads", name));

    const bytes = new Uint8Array(raw);
    // Re-sniff on the way out. A file that is not what its extension claims must not
    // be served with a Content-Type derived from that claim.
    if (sniffImageType(bytes) !== type) return { ok: false };
    return { ok: true, bytes, type };
  } catch {
    return { ok: false };
  }
}
