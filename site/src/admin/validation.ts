import { createHash } from "node:crypto";

export const RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "api",
  "app",
  "login",
  "auth",
  "support",
  "status",
  "static",
  "assets",
  "mail",
  "nexi",
  "longhorn",
]);

export const TENANT_TIMEZONES = [
  "America/Santiago",
  "America/Punta_Arenas",
  "UTC",
] as const;

export const TENANT_LOCALES = ["es-CL"] as const;

export function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function isValidSlug(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 63 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    !RESERVED_SLUGS.has(value)
  );
}

export function normalizeSearch(value: string | null): string | null {
  const normalized = value
    ?.trim()
    .replace(/[%_\\\u0000-\u001f]/g, "")
    .slice(0, 80);
  return normalized || null;
}

export function pageNumber(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function requestFingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

export function isKnownTimezone(value: string): boolean {
  return (TENANT_TIMEZONES as readonly string[]).includes(value);
}

export function isKnownLocale(value: string): boolean {
  return (TENANT_LOCALES as readonly string[]).includes(value);
}
