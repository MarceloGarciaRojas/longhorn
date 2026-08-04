import { createHash } from "node:crypto";

// Sharp 0.35 ships declarations outside its ESM export map. Runtime support is
// verified by the media test suite while this narrow import remains Node-only.
// @ts-expect-error sharp 0.35 does not expose its bundled types through exports
import sharp from "sharp";

import { loadMediaConfig } from "../../src/media/config";
import type {
  ObjectStorage,
  ProcessedMediaObject,
  ProcessedMediaResult,
} from "../../src/media/storage";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  type MediaAllowedMimeType,
  type MediaVariantName,
} from "../../src/media/types";
import { LocalObjectStorage } from "./local-storage";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMAT_TO_MIME: Record<string, MediaAllowedMimeType | undefined> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const WIDTHS: Record<MediaVariantName, number> = {
  thumbnail: 320,
  card: 768,
  hero: 1600,
};

export class MediaRejectedError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaRejectedError";
  }
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function controlledKey(
  tenantId: string,
  siteId: string,
  assetId: string,
  sourceChecksum: string,
  name: "original" | MediaVariantName,
): string {
  for (const value of [tenantId, siteId, assetId]) {
    if (!UUID.test(value)) throw new MediaRejectedError("media_identifier_invalid");
  }
  return `${tenantId}/${siteId}/${assetId}/${sourceChecksum}/${
    name === "original" ? "original.webp" : `variants/${name}.webp`
  }`;
}

async function objectMetadata(
  bytes: Uint8Array,
  key: string,
): Promise<ProcessedMediaObject> {
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) {
    throw new MediaRejectedError("media_dimensions_invalid");
  }
  return {
    storageKey: key,
    byteSize: bytes.byteLength,
    width: metadata.width,
    height: metadata.height,
    checksum: checksum(bytes),
    mimeType: "image/webp",
  };
}

export async function processMediaBytes(input: {
  tenantId: string;
  siteId: string;
  assetId: string;
  filename: string;
  declaredMimeType: string;
  bytes: Uint8Array;
  storage?: ObjectStorage;
}): Promise<ProcessedMediaResult> {
  const config = loadMediaConfig();
  if (
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength > config.uploadMaxBytes
  ) {
    throw new MediaRejectedError("media_file_too_large");
  }
  if (
    !MEDIA_ALLOWED_MIME_TYPES.includes(
      input.declaredMimeType as MediaAllowedMimeType,
    )
  ) {
    throw new MediaRejectedError("media_mime_not_allowed");
  }
  if (
    decodeURIComponent(encodeURIComponent(input.filename)).trim().length > 120
  ) {
    throw new MediaRejectedError("media_filename_invalid");
  }

  let metadata: {
    format?: string;
    width?: number;
    height?: number;
    orientation?: number;
  };
  try {
    metadata = await sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: config.maxPixels,
      animated: false,
    }).metadata();
  } catch {
    throw new MediaRejectedError("media_decode_failed");
  }
  const detectedMimeType = metadata.format
    ? FORMAT_TO_MIME[metadata.format]
    : undefined;
  if (!detectedMimeType) {
    throw new MediaRejectedError(
      metadata.format === "svg"
        ? "media_svg_rejected"
        : metadata.format === "gif"
          ? "media_gif_rejected"
          : "media_format_rejected",
    );
  }
  if (detectedMimeType !== input.declaredMimeType) {
    throw new MediaRejectedError("media_mime_mismatch");
  }
  if (!metadata.width || !metadata.height) {
    throw new MediaRejectedError("media_dimensions_invalid");
  }
  const orientedWidth =
    metadata.orientation && metadata.orientation >= 5
      ? metadata.height
      : metadata.width;
  const orientedHeight =
    metadata.orientation && metadata.orientation >= 5
      ? metadata.width
      : metadata.height;
  if (
    orientedWidth > config.maxWidth ||
    orientedHeight > config.maxHeight ||
    orientedWidth * orientedHeight > config.maxPixels
  ) {
    throw new MediaRejectedError("media_dimensions_exceeded");
  }

  const sourceChecksum = checksum(input.bytes);
  const storage = input.storage ?? new LocalObjectStorage();
  const written: string[] = [];
  try {
    const normalizedBytes = await sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: config.maxPixels,
      animated: false,
    })
      .rotate()
      .webp({ quality: 90, alphaQuality: 100, effort: 4 })
      .toBuffer();
    const originalKey = controlledKey(
      input.tenantId,
      input.siteId,
      input.assetId,
      sourceChecksum,
      "original",
    );
    const original = await objectMetadata(normalizedBytes, originalKey);
    await storage.put(originalKey, normalizedBytes, "image/webp");
    written.push(originalKey);

    const variants = {} as Record<MediaVariantName, ProcessedMediaObject>;
    for (const [name, width] of Object.entries(WIDTHS) as [
      MediaVariantName,
      number,
    ][]) {
      const bytes = await sharp(normalizedBytes, {
        failOn: "warning",
        limitInputPixels: config.maxPixels,
      })
        .resize({
          width,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, alphaQuality: 100, effort: 4 })
        .toBuffer();
      const key = controlledKey(
        input.tenantId,
        input.siteId,
        input.assetId,
        sourceChecksum,
        name,
      );
      variants[name] = await objectMetadata(bytes, key);
      await storage.put(key, bytes, "image/webp");
      written.push(key);
    }
    return { detectedMimeType, original, variants };
  } catch (error) {
    await Promise.all(written.map((key) => storage.delete(key).catch(() => undefined)));
    if (error instanceof MediaRejectedError) throw error;
    throw new MediaRejectedError("media_processing_failed");
  }
}
