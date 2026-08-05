import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { AuthConfig } from "./config";
import type { RecoveryEnvelope } from "./types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 3 &&
    normalized.length <= 254 &&
    EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function hashPrivateIdentifier(
  config: Readonly<AuthConfig>,
  value: string,
): Buffer {
  return createHmac("sha256", config.securityPepper)
    .update(value, "utf8")
    .digest();
}

export function hashOptionalValue(value: string | null): Buffer | null {
  return value
    ? createHash("sha256").update(value, "utf8").digest()
    : null;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function resolveClientAddress(
  request: Request,
  environment: AuthConfig["environment"],
): string {
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) {
    return cloudflareAddress.slice(0, 128);
  }
  if (environment === "local" || environment === "test") {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local"
    ).slice(0, 128);
  }
  return "unknown";
}

export function hasTrustedOrigin(
  request: Request,
  config: Readonly<AuthConfig>,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).origin === new URL(config.publicUrl).origin;
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

export function sealRecoveryGrant(
  config: Readonly<AuthConfig>,
  grant: Readonly<RecoveryEnvelope>,
): string {
  const key = createHash("sha256")
    .update(config.securityPepper, "utf8")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(
    JSON.stringify({
      grant,
      expiresAt: Date.now() + 10 * 60 * 1000,
    }),
    "utf8",
  );
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openRecoveryGrant(
  config: Readonly<AuthConfig>,
  value: string,
): RecoveryEnvelope | null {
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) {
      return null;
    }
    const key = createHash("sha256")
      .update(config.securityPepper, "utf8")
      .digest();
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        "utf8",
      ),
    ) as {
      grant?: RecoveryEnvelope;
      expiresAt?: number;
    };
    if (
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= Date.now() ||
      !decoded.grant?.accessToken ||
      !decoded.grant.nonce ||
      !decoded.grant.identity?.subject ||
      decoded.grant.identity.emailVerified !== true ||
      !normalizeEmail(decoded.grant.identity.email)
    ) {
      return null;
    }
    return decoded.grant;
  } catch {
    return null;
  }
}
