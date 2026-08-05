import type { MediaVariantName } from "./types";

export interface StoredObjectHead {
  byteSize: number;
  contentType: string;
  etag: string;
}

export interface StoredObject extends StoredObjectHead {
  body: Uint8Array;
}

export interface ObjectStorage {
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObjectHead>;
  read(key: string): Promise<StoredObject>;
  head(key: string): Promise<StoredObjectHead | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface ProcessedMediaObject {
  storageKey: string;
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  mimeType: "image/webp";
}

export interface ProcessedMediaResult {
  detectedMimeType: "image/jpeg" | "image/png" | "image/webp";
  original: ProcessedMediaObject;
  variants: Record<MediaVariantName, ProcessedMediaObject>;
}
