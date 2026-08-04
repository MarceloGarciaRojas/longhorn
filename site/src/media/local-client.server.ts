import "server-only";

import { loadMediaConfig } from "./config";
import type { ProcessedMediaResult, StoredObject } from "./storage";

export class MediaProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaProcessingError";
  }
}

function localEndpoint(path: string): URL {
  const config = loadMediaConfig();
  if (config.provider !== "local" || !config.localServiceUrl) {
    throw new MediaProcessingError("media_provider_unavailable");
  }
  return new URL(path, `${config.localServiceUrl}/`);
}

export async function processLocalMedia(input: {
  tenantId: string;
  siteId: string;
  assetId: string;
  filename: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}): Promise<ProcessedMediaResult> {
  const requestBody = input.bytes.buffer instanceof ArrayBuffer
    ? input.bytes.buffer.slice(
        input.bytes.byteOffset,
        input.bytes.byteOffset + input.bytes.byteLength,
      )
    : Uint8Array.from(input.bytes).buffer;
  const response = await fetch(localEndpoint("v1/process"), {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(input.bytes.byteLength),
      "x-media-tenant-id": input.tenantId,
      "x-media-site-id": input.siteId,
      "x-media-asset-id": input.assetId,
      "x-media-filename": encodeURIComponent(input.filename),
      "x-media-declared-type": input.declaredMimeType,
    },
    body: requestBody,
  });
  const result = await response.json().catch(() => null) as
    | ProcessedMediaResult
    | { code?: string }
    | null;
  if (
    !response.ok ||
    !result ||
    "code" in result ||
    !("detectedMimeType" in result) ||
    !("original" in result) ||
    !("variants" in result)
  ) {
    throw new MediaProcessingError(
      result && "code" in result && result.code
        ? result.code
        : "media_processing_failed",
    );
  }
  return result as ProcessedMediaResult;
}

export async function readLocalMedia(key: string): Promise<StoredObject> {
  const response = await fetch(localEndpoint("v1/read"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!response.ok || !response.body) {
    throw new MediaProcessingError(
      response.status === 404 ? "media_not_found" : "media_storage_failed",
    );
  }
  return {
    body: new Uint8Array(await response.arrayBuffer()),
    byteSize: Number(response.headers.get("content-length") || "0"),
    contentType:
      response.headers.get("content-type") || "application/octet-stream",
    etag: (response.headers.get("etag") || "").replace(/^"|"$/g, ""),
  };
}
