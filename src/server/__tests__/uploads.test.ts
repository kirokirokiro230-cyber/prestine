import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { beforeAll, describe, it } from "vitest";
import { isUploadedImage } from "@/lib/uploads";
import { readImage, saveImage, sniffImageType } from "@/server/uploads";

/**
 * Image upload.
 *
 * File upload is the most reliably exploited surface in an admin panel, and none of
 * these failures are visible by using the feature: an SVG that uploads happily is
 * stored cross-site scripting, a trusted filename is a path traversal, and a trusted
 * `Content-Type` is both. So the tests are about what gets *refused*.
 */

const DIR = ".test-store/uploads";

beforeAll(() => {
  process.env.PRESTINE_UPLOAD_DIR = DIR;

  // Fresh directory per run: these assertions count files on disk, so leftovers from a
  // previous run would make them pass or fail for the wrong reason.
  rmSync(DIR, { recursive: true, force: true });
});

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

describe("saving", () => {
  it("stores an image and returns a URL for it", async () => {
    const result = await saveImage(file(PNG, "photo.png", "image/png"));

    assert.ok(result.ok, "ok" in result && !result.ok ? result.error : "");
    if (!result.ok) return;

    assert.equal(result.type, "image/png");
    assert.ok(isUploadedImage(result.url), result.url);
  });

  it("names the file from its contents, never from the client", async () => {
    // A filename is attacker-controlled input. If it reached the filesystem, this is
    // how it would get out of the uploads directory.
    const result = await saveImage(
      file(PNG, "../../../../.env", "image/png"),
    );

    assert.ok(result.ok);
    if (!result.ok) return;

    assert.ok(!result.url.includes(".."), result.url);
    assert.ok(!result.url.includes(".env"), result.url);
    assert.match(result.url, /^\/uploads\/[0-9a-f]{16}\.png$/);
  });

  it("gives the same URL to identical bytes, so one image is stored once", async () => {
    const first = await saveImage(file(PNG, "a.png", "image/png"));
    const second = await saveImage(file(PNG, "b.png", "image/png"));

    assert.ok(first.ok && second.ok);
    if (!first.ok || !second.ok) return;
    assert.equal(first.url, second.url);

    const names = await readdir(DIR);
    assert.equal(
      names.filter((name) => name.endsWith(".png")).length,
      1,
      "the same image was written twice",
    );
  });

  it("ignores the declared type and trusts the bytes", async () => {
    // A PNG announced as a JPEG is still stored as a PNG...
    const honest = await saveImage(file(PNG, "x.jpg", "image/jpeg"));
    assert.ok(honest.ok);
    if (honest.ok) assert.equal(honest.type, "image/png");

    // ...and a script announced as a PNG is refused outright.
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
});

describe("reading back", () => {
  it("serves a stored image", async () => {
    const saved = await saveImage(file(JPEG, "photo.jpg", "image/jpeg"));
    assert.ok(saved.ok);
    if (!saved.ok) return;

    const name = saved.url.replace("/uploads/", "");
    const image = await readImage(name);

    assert.ok(image.ok);
    if (image.ok) assert.equal(image.type, "image/jpeg");
  });

  it("refuses traversal, however it is spelled", async () => {
    for (const name of [
      "../store.json",
      "..%2Fstore.json",
      "../../.env",
      "/etc/passwd",
      "sub/dir/file.png",
      "a".repeat(16) + ".png",
      "0123456789abcdef.svg",
      "0123456789ABCDEF.png",
      "0123456789abcdef.png.exe",
    ]) {
      const image = await readImage(name);
      assert.equal(image.ok, false, `accepted ${name}`);
    }
  });

  it("reports a missing file as absent, not as an error", async () => {
    const image = await readImage("00112233445566aa.png");
    assert.equal(image.ok, false);
  });
});

describe("URL validation", () => {
  it("accepts what the pipeline produces", () => {
    assert.equal(isUploadedImage("/uploads/0123456789abcdef.jpg"), true);
    assert.equal(isUploadedImage("/uploads/0123456789abcdef.webp"), true);
  });

  it("rejects anything else", () => {
    for (const url of [
      "/uploads/../store.json",
      "/uploads/evil.svg",
      "uploads/0123456789abcdef.jpg",
      "https://example.test/0123456789abcdef.jpg",
      "javascript:alert(1)",
      "/uploads/0123456789abcdef.jpg?x=1",
      "",
    ]) {
      assert.equal(isUploadedImage(url), false, `accepted ${url}`);
    }
  });
});
