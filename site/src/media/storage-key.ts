const SAFE_MEDIA_KEY =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\/(?:original|variants\/(?:thumbnail|card|hero))\.webp$/i;

export class MediaStorageSafetyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaStorageSafetyError";
  }
}

export function assertMediaStorageKey(key: string): void {
  if (
    !key ||
    key.length > 1024 ||
    key.startsWith("/") ||
    /^[a-z]:/i.test(key) ||
    key.includes("\\") ||
    key.includes("..") ||
    !SAFE_MEDIA_KEY.test(key)
  ) {
    throw new MediaStorageSafetyError("media_object_key_invalid");
  }
}
