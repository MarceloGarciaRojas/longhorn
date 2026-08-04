import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { loadMediaConfig } from "../../src/media/config";
import { LocalObjectStorage, LocalStorageSafetyError } from "./local-storage";
import { MediaRejectedError, processMediaBytes } from "./processor";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

async function body(
  request: IncomingMessage,
  maximum: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximum) {
      throw new MediaRejectedError("media_file_too_large");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function json(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const serialized = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(serialized),
    "cache-control": "no-store",
  });
  response.end(serialized);
}

export function createLocalMediaServer() {
  const config = loadMediaConfig();
  if (config.provider !== "local") {
    throw new LocalStorageSafetyError("media_local_provider_blocked");
  }
  const storage = new LocalObjectStorage();
  let active = 0;
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        json(response, 200, { ok: true, provider: "local" });
        return;
      }
      if (request.method === "POST" && request.url === "/v1/process") {
        if (active >= config.maxConcurrentUploads) {
          json(response, 429, { code: "media_concurrency_exceeded" });
          return;
        }
        const tenantId = header(request, "x-media-tenant-id");
        const siteId = header(request, "x-media-site-id");
        const assetId = header(request, "x-media-asset-id");
        if (![tenantId, siteId, assetId].every((value) => UUID.test(value))) {
          json(response, 422, { code: "media_identifier_invalid" });
          return;
        }
        active += 1;
        try {
          const result = await processMediaBytes({
            tenantId,
            siteId,
            assetId,
            filename: decodeURIComponent(header(request, "x-media-filename")),
            declaredMimeType: header(request, "x-media-declared-type"),
            bytes: await body(request, config.uploadMaxBytes),
            storage,
          });
          json(response, 200, result);
        } finally {
          active -= 1;
        }
        return;
      }
      if (request.method === "POST" && request.url === "/v1/read") {
        const raw = Buffer.from(await body(request, 4096)).toString("utf8");
        const parsed = JSON.parse(raw) as { key?: unknown };
        if (typeof parsed.key !== "string") {
          throw new LocalStorageSafetyError("media_object_key_invalid");
        }
        const object = await storage.read(parsed.key);
        response.writeHead(200, {
          "content-type": object.contentType,
          "content-length": object.byteSize,
          etag: `"${object.etag}"`,
          "cache-control": "no-store",
        });
        response.end(object.body);
        return;
      }
      json(response, 404, { code: "media_not_found" });
    } catch (error) {
      const code =
        error instanceof MediaRejectedError ||
        error instanceof LocalStorageSafetyError
          ? error.code
          : "media_processing_failed";
      json(
        response,
        code === "media_not_found" ? 404 : 422,
        { code },
      );
    }
  });
}

if (process.argv[1]?.endsWith("local-service.ts")) {
  const port = Number(process.env.MEDIA_LOCAL_SERVICE_PORT || "43127");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("MEDIA_LOCAL_SERVICE_PORT must be a safe local port");
  }
  const server = createLocalMediaServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`nexi local media service ready on 127.0.0.1:${port}`);
  });
}
