import { isUploadedImage } from "@/lib/uploads";
import {
  storageDriver,
  supabasePublicUrl,
  supabaseStorageConfig,
} from "@/server/storage";
import { readImage } from "@/server/uploads";

/**
 * Serves merchant-uploaded images.
 *
 * They are not in `public/` — see `src/server/uploads.ts` for why — so they need a
 * handler. Everything risky about serving user-supplied files is dealt with in
 * `readImage`: the name must match the exact content-hash pattern the writer produces,
 * and the bytes are re-sniffed so a file can never be served with a `Content-Type` taken
 * from its extension.
 *
 * A single dynamic segment rather than a catch-all, deliberately. Uploads live in one
 * flat directory, so there is no legitimate request containing a slash, and refusing to
 * accept one removes traversal from the conversation entirely.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  /**
   * Under the Supabase driver new uploads are stored as absolute CDN URLs, so nothing
   * written today reaches this handler. Records created while the store ran on disk
   * still hold `/uploads/…`, and the objects were migrated to the bucket under the same
   * names, so the two shapes reconcile with a redirect rather than a broken image.
   *
   * 308 and not 302: permanent and method-preserving, so it can be cached by the browser
   * and by any CDN in front of the app instead of costing an invocation every time.
   */
  if (storageDriver() === "supabase") {
    const config = supabaseStorageConfig();
    // `isUploadedImage` is what stops this becoming an open redirect: only a bare
    // content-hash filename is ever interpolated into the target URL.
    if (config && isUploadedImage(`/uploads/${file}`)) {
      return Response.redirect(supabasePublicUrl(config, file), 308);
    }
    return new Response("Not found", { status: 404 });
  }

  const image = await readImage(file);

  // No distinction between "not a valid name" and "not on disk". Both are 404s, and
  // telling them apart only helps someone probing the directory.
  if (!image.ok) return new Response("Not found", { status: 404 });

  /**
   * Wrapped in a `Blob` rather than handed over as a `Uint8Array`. A typed array may be
   * backed by a `SharedArrayBuffer`, which is not a valid response body, so the types
   * reject it — and a `Blob` is the honest way to say "these bytes, this type" instead of
   * casting the problem away.
   */
  return new Response(new Blob([image.bytes], { type: image.type }), {
    headers: {
      "Content-Type": image.type,
      /**
       * The name is a hash of the contents, so a given URL can never point at
       * different bytes. That makes it safe to cache permanently, which is what keeps
       * this route off the hot path despite not being a static file.
       */
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(image.bytes.byteLength),
      /**
       * Belt and braces on top of the sniffed `Content-Type`: never let a browser
       * decide for itself what an uploaded file is, and never let one render as a
       * document in this origin.
       */
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
