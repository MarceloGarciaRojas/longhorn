import { assertMediaStorageKey } from "./storage-key";
import type { ObjectStorage, StoredObject, StoredObjectHead } from "./storage";

type Fetch = typeof fetch;

export class SupabaseStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SupabaseStorageError";
  }
}

function encodedPath(bucket: string, key = ""): string {
  const segments = [bucket, ...key.split("/")].filter(Boolean);
  return segments.map(encodeURIComponent).join("/");
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const input = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export class SupabaseObjectStorage implements ObjectStorage {
  private readonly origin: string;

  constructor(
    baseUrl: string,
    private readonly bucket: string,
    private readonly secretKey: string,
    private readonly request: Fetch = fetch,
  ) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || !bucket || !secretKey) {
      throw new SupabaseStorageError("media_storage_config_invalid");
    }
    this.origin = url.toString().replace(/\/$/, "");
  }

  private headers(extra: HeadersInit = {}): Headers {
    return new Headers({
      apikey: this.secretKey,
      authorization: `Bearer ${this.secretKey}`,
      ...extra,
    });
  }

  private objectUrl(key: string): string {
    assertMediaStorageKey(key);
    return `${this.origin}/storage/v1/object/${encodedPath(this.bucket, key)}`;
  }

  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObjectHead> {
    if (contentType !== "image/webp") {
      throw new SupabaseStorageError("media_content_type_invalid");
    }
    const response = await this.request(this.objectUrl(key), {
      method: "POST",
      headers: this.headers({
        "content-type": contentType,
        "x-upsert": "false",
      }),
      body: Uint8Array.from(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new SupabaseStorageError("media_storage_failed");
    }
    return {
      byteSize: body.byteLength,
      contentType,
      etag: (response.headers.get("etag") || (await checksum(body))).replace(
        /^"|"$/g,
        "",
      ),
    };
  }

  async read(key: string): Promise<StoredObject> {
    const response = await this.request(this.objectUrl(key), {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) {
      throw new SupabaseStorageError("media_not_found");
    }
    if (!response.ok) throw new SupabaseStorageError("media_storage_failed");
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (contentType !== "image/webp") {
      throw new SupabaseStorageError("media_object_metadata_invalid");
    }
    const body = new Uint8Array(await response.arrayBuffer());
    return {
      body,
      byteSize: body.byteLength,
      contentType,
      etag: (response.headers.get("etag") || (await checksum(body))).replace(
        /^"|"$/g,
        "",
      ),
    };
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    try {
      const object = await this.read(key);
      return {
        byteSize: object.byteSize,
        contentType: object.contentType,
        etag: object.etag,
      };
    } catch (error) {
      if (
        error instanceof SupabaseStorageError &&
        error.code === "media_not_found"
      ) {
        return null;
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    assertMediaStorageKey(key);
    const response = await this.request(
      `${this.origin}/storage/v1/object/${encodedPath(this.bucket)}`,
      {
        method: "DELETE",
        headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ prefixes: [key] }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new SupabaseStorageError("media_storage_failed");
  }
}
