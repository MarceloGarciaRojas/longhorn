import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error sharp 0.35 declarations are outside its ESM export map
import sharp from "sharp";
import { LocalObjectStorage } from "../../scripts/media/local-storage";
import {
  MediaRejectedError,
  processMediaBytes,
} from "../../scripts/media/processor";

const IDS = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  siteId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
};

const STATIC_IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
];

async function listStaticImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listStaticImages(path);
      return STATIC_IMAGE_EXTENSIONS.some((extension) =>
        entry.name.toLowerCase().endsWith(extension)
      )
        ? [path]
        : [];
    }),
  );
  return results.flat();
}

test("JPEG, PNG and WebP are normalized without metadata into three variants", async () => {
  process.env.APP_ENV = "test";
  const root = resolve(
    await mkdtemp(resolve(tmpdir(), "nexi-media-processing-")),
    "nexi-media-storage",
  );
  const storage = new LocalObjectStorage(root);
  for (const [format, mime] of [
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const) {
    const pipeline = sharp({
      create: { width: 640, height: 400, channels: 4, background: "#217a68" },
    }).withMetadata({ orientation: 6 });
    const bytes = await pipeline[format]().toBuffer();
    const result = await processMediaBytes({
      ...IDS,
      assetId: IDS.assetId.replace(/3/g, format === "jpeg" ? "3" : format === "png" ? "4" : "5"),
      filename: `synthetic.${format}`,
      declaredMimeType: mime,
      bytes,
      storage,
    });
    assert.equal(result.detectedMimeType, mime);
    assert.deepEqual(Object.keys(result.variants).sort(), ["card", "hero", "thumbnail"]);
    const normalized = await storage.read(result.original.storageKey);
    const metadata = await sharp(normalized.body).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.ok(result.variants.thumbnail.width <= 320);
    assert.ok(result.variants.card.width <= 640);
    assert.ok(result.variants.hero.width <= 640);
  }
  await storage.cleanTestRoot();
});

test("spoofed MIME, SVG, GIF and malformed input are rejected", async () => {
  process.env.APP_ENV = "test";
  const png = await sharp({
    create: { width: 32, height: 32, channels: 4, background: "#000" },
  }).png().toBuffer();
  await assert.rejects(
    () => processMediaBytes({
      ...IDS,
      filename: "fake.jpg",
      declaredMimeType: "image/jpeg",
      bytes: png,
    }),
    (error: unknown) =>
      error instanceof MediaRejectedError && error.code === "media_mime_mismatch",
  );
  for (const [filename, mime, bytes] of [
    ["unsafe.svg", "image/png", new TextEncoder().encode("<svg><script/></svg>")],
    ["animated.gif", "image/png", new TextEncoder().encode("GIF89a")],
    ["broken.png", "image/png", new Uint8Array([1, 2, 3])],
  ] as const) {
    await assert.rejects(
      () => processMediaBytes({ ...IDS, filename, declaredMimeType: mime, bytes }),
      MediaRejectedError,
    );
  }
});

test("Longhorn does not require vinext static image metadata support", async () => {
  const images = (await Promise.all([
    listStaticImages(resolve(process.cwd(), "app")),
    listStaticImages(resolve(process.cwd(), "src")),
  ])).flat();
  assert.deepEqual(
    images,
    [],
    "Static app/src images require restoring a safe image metadata implementation",
  );
});
