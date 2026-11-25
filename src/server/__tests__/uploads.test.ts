import assert from "node:assert/strict";
import { afterAll, describe, it } from "vitest";
import { isUploadedImage } from "@/lib/uploads";
import { saveImage, sniffImageType } from "@/server/uploads";
import { db } from "@/server/supabase";
import { storageBucket } from "@/server/storage";
import { checkSupabaseStorage, testRunTag } from "./supabase-test-helpers";

/**
 * Image upload.
 *
 * `sniffImageType`'s own tests (type sniffing below) are pure — magic-byte
 * detection touches no network — and run everywhere, including CI. `saveImage`
 * itself is an integration test: it uploads to a real Supabase Storage bucket,
 * so it needs `checkSupabaseStorage()` (see `supabase-test-helpers.ts`) and is
 * skipped with a clear reason when no bucket is configured.
 *
 * File upload is the most reliably exploited surface in an admin panel, and none
 * of these failures are visible by using the feature: an SVG that uploads happily
 * is stored cross-site scripting, and a trusted `Content-Type` is too. So the
 * sniffing tests are about what gets *refused*, and they need no bucket at all —
 * `sniffImageType` runs before anything is ever uploaded.
 */

/** A real 1x1 PNG. Anything shorter than a valid header would not prove much. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000", "latin1");

function webp(): Buffer {
  const bytes = Buffer.alloc(16);
  bytes.write("RIFF", 0, "latin1");
  bytes.write("WEBP", 8, "latin1");
  return bytes;
}

function avif(): Buffer {
  const bytes = Buffer.alloc(16);
  bytes.write("ftyp", 4, "latin1");
  bytes.write("avif", 8, "latin1");
  return bytes;
}

function file(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("type sniffing", () => {
  it("recognises the formats it accepts", () => {
    assert.equal(sniffImageType(new Uint8Array(PNG)), "image/png");
    assert.equal(sniffImageType(new Uint8Array(JPEG)), "image/jpeg");
    assert.equal(sniffImageType(new Uint8Array(GIF)), "image/gif");
    assert.equal(sniffImageType(new Uint8Array(webp())), "image/webp");
    assert.equal(sniffImageType(new Uint8Array(avif())), "image/avif");
  });

  it("refuses SVG", () => {
    // The whole reason the sniffer exists. An SVG can carry <script>, and anything
    // served from our own origin runs in our origin.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    assert.equal(sniffImageType(new Uint8Array(svg)), null);
  });

  it("refuses things that merely start like text", () => {
    assert.equal(sniffImageType(new Uint8Array(Buffer.from("not an image"))), null);
    assert.equal(sniffImageType(new Uint8Array(Buffer.from("RIFFxxxxAVI "))), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
  });

  it("refuses a truncated header", () => {
    // The first two bytes of a JPEG are not a JPEG.
    assert.equal(sniffImageType(new Uint8Array(Buffer.from([0xff, 0xd8]))), null);
  });
});

const { configured, reason } = checkSupabaseStorage();
const tag = testRunTag();
const uploadedPaths: string[] = [];

describe.skipIf(!configured)("saving to Supabase Storage", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  afterAll(async () => {
    if (uploadedPaths.length > 0) {
      await db().storage.from(storageBucket()).remove(uploadedPaths);
    }
  });

  function pathFromUrl(url: string): string {
    const marker = `/object/public/${storageBucket()}/`;
    const index = url.indexOf(marker);
    return index === -1 ? url : url.slice(index + marker.length);
  }

  it("stores an image and returns a public URL for it", async () => {
    const result = await saveImage(file(PNG, `${tag}.png`, "image/png"));

    assert.ok(result.ok, "ok" in result && !result.ok ? result.error : "");
    if (!result.ok) return;
    uploadedPaths.push(pathFromUrl(result.url));

    assert.equal(result.type, "image/png");
    assert.ok(isUploadedImage(result.url), result.url);
  });

  it("names the object from its contents, never from the client", async () => {
    // A filename is attacker-controlled input. The pipeline never uses it — the
    // object path is a hash of the bytes — so a traversal attempt in the
    // filename has nowhere to reach.
    const result = await saveImage(file(PNG, "../../../../.env", "image/png"));

    assert.ok(result.ok);
    if (!result.ok) return;
    uploadedPaths.push(pathFromUrl(result.url));

    assert.ok(!result.url.includes(".."), result.url);
    assert.ok(!result.url.includes(".env"), result.url);
    assert.match(result.url, /\/products\/[0-9a-f]{16}\.png$/);
  });

  it("gives the same URL to identical bytes, so one image is stored once", async () => {
    const first = await saveImage(file(PNG, "a.png", "image/png"));
    const second = await saveImage(file(PNG, "b.png", "image/png"));

    assert.ok(first.ok && second.ok);
    if (!first.ok || !second.ok) return;
    assert.equal(first.url, second.url);
    uploadedPaths.push(pathFromUrl(first.url));
  });

  it("ignores the declared type and trusts the bytes", async () => {
    // A PNG announced as a JPEG is still stored as a PNG...
    const honest = await saveImage(file(PNG, "x.jpg", "image/jpeg"));
    assert.ok(honest.ok);
    if (honest.ok) {
      assert.equal(honest.type, "image/png");
      uploadedPaths.push(pathFromUrl(honest.url));
    }

    // ...and a script announced as a PNG is refused outright, before any upload.
    const lying = await saveImage(
      file(Buffer.from("<script>alert(1)</script>"), "x.png", "image/png"),
    );
    assert.ok(!lying.ok);
    if (!lying.ok) assert.match(lying.error, /supported image/i);
  });

  it("refuses an empty file", async () => {
    const result = await saveImage(file(Buffer.alloc(0), "empty.png", "image/png"));
    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.error, /empty/i);
  });

  it("refuses a file over the size limit", async () => {
    // A valid PNG header followed by enough padding to exceed the cap, so the rejection
    // can only be about size.
    const huge = Buffer.concat([PNG, Buffer.alloc(7 * 1024 * 1024)]);
    const result = await saveImage(file(huge, "huge.png", "image/png"));

    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.error, /limit is/i);
  });

  it("names SVG explicitly when refusing it", async () => {
    // A merchant trying a logo SVG deserves to know why, not "unsupported file".
    const result = await saveImage(
      file(Buffer.from("<svg></svg>"), "logo.svg", "image/svg+xml"),
    );

    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.error, /SVG/);
  });

  it("serves a stored image back with matching bytes", async () => {
    const saved = await saveImage(file(JPEG, "photo.jpg", "image/jpeg"));
    assert.ok(saved.ok);
    if (!saved.ok) return;
    uploadedPaths.push(pathFromUrl(saved.url));

    const response = await fetch(saved.url);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.equals(JPEG));
  });
});

describe("URL validation", () => {
  it("rejects things that are not this project's storage URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://example.test/0123456789abcdef.jpg",
      "",
      "/uploads/0123456789abcdef.jpg",
    ]) {
      assert.equal(isUploadedImage(url), false, `accepted ${url}`);
    }
  });
});
