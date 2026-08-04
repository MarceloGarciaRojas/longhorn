import { RESERVED_SLUGS, normalizeSlug } from "@/src/admin/validation";

export class OperationValidationError extends Error {
  readonly field?: string;

  constructor(
    readonly code:
      | "invalid"
      | "denied"
      | "duplicate"
      | "not_found"
      | "conflict"
      | "too_early"
      | "plan",
    options?: ErrorOptions & { field?: string },
  ) {
    super(code, options);
    this.name = "OperationValidationError";
    this.field = options?.field;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const HOSTNAME =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const RESERVED_SUBDOMAINS = new Set([
  ...RESERVED_SLUGS,
  "soporte",
]);

export function uuid(value: FormDataEntryValue | null): string {
  const result = String(value || "");
  if (!UUID.test(result)) throw new OperationValidationError("invalid");
  return result;
}

export function text(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
): string {
  const result = String(value || "").trim().replace(/\s+/g, " ");
  if (result.length < min || result.length > max) {
    throw new OperationValidationError("invalid");
  }
  return result;
}

export function optionalText(
  value: FormDataEntryValue | null,
  max: number,
): string | null {
  const result = String(value || "").trim();
  if (!result) return null;
  if (result.length > max) throw new OperationValidationError("invalid");
  return result;
}

export function siteSlug(value: FormDataEntryValue | null): string {
  const result = normalizeSlug(String(value || ""));
  if (result.length < 3 || RESERVED_SLUGS.has(result)) {
    throw new OperationValidationError("invalid");
  }
  return result;
}

export function hostname(value: FormDataEntryValue | null): string {
  const result = String(value || "").trim().toLowerCase();
  if (
    result.length > 253 ||
    !HOSTNAME.test(result) ||
    RESERVED_SUBDOMAINS.has(result.split(".")[0])
  ) {
    throw new OperationValidationError("invalid");
  }
  return result;
}

export function mapOperationError(error: unknown): OperationValidationError {
  const code = (error as { code?: string })?.code;
  if ((error as { name?: string })?.name === "TenantContextRejectedError") {
    return new OperationValidationError("denied", { cause: error });
  }
  if (code === "23505") return new OperationValidationError("duplicate", { cause: error });
  if (code === "42501") return new OperationValidationError("denied", { cause: error });
  if (code === "P0002") return new OperationValidationError("not_found", { cause: error });
  if (code === "40001") return new OperationValidationError("conflict", { cause: error });
  return error instanceof OperationValidationError
    ? error
    : new OperationValidationError("invalid", { cause: error });
}
