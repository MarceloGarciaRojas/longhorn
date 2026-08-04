import type {
  CompanyProfileUpdate,
  PersonalProfileUpdate,
} from "./types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^\+?[0-9()\s-]{6,32}$/;
const SUPPORTED_LOCALES = new Set(["es-CL"]);
const SUPPORTED_TIMEZONES = new Set(["America/Santiago"]);

export class ClientValidationError extends Error {
  readonly code: "invalid" | "forbidden" | "conflict" | "denied";

  constructor(code: ClientValidationError["code"], message: string) {
    super(message);
    this.name = "ClientValidationError";
    this.code = code;
  }
}

function value(form: FormData, key: string, max: number): string {
  const result = String(form.get(key) ?? "").trim();
  if (result.length > max) {
    throw new ClientValidationError("invalid", "Valor demasiado largo.");
  }
  return result;
}

function nullable(valueToNormalize: string): string | null {
  return valueToNormalize || null;
}

function version(form: FormData): number {
  const parsed = Number.parseInt(String(form.get("profile_version") ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ClientValidationError("invalid", "Versión de perfil inválida.");
  }
  return parsed;
}

function rejectUnexpected(form: FormData, allowed: ReadonlySet<string>): void {
  for (const key of form.keys()) {
    if (!allowed.has(key)) {
      throw new ClientValidationError(
        "forbidden",
        "El formulario contiene un campo no autorizado.",
      );
    }
  }
}

function phone(input: string): string | null {
  if (!input) return null;
  if (!PHONE_PATTERN.test(input)) {
    throw new ClientValidationError("invalid", "Teléfono inválido.");
  }
  return input;
}

export function parsePersonalProfile(
  form: FormData,
): PersonalProfileUpdate {
  rejectUnexpected(
    form,
    new Set(["action", "display_name", "phone", "locale", "profile_version"]),
  );
  const displayName = value(form, "display_name", 120);
  const locale = value(form, "locale", 10);
  if (!displayName) {
    throw new ClientValidationError("invalid", "El nombre es obligatorio.");
  }
  if (!SUPPORTED_LOCALES.has(locale)) {
    throw new ClientValidationError("invalid", "Idioma no compatible.");
  }
  return {
    displayName,
    phone: phone(value(form, "phone", 32)),
    locale,
    expectedVersion: version(form),
  };
}

export function parseCompanyProfile(form: FormData): CompanyProfileUpdate {
  rejectUnexpected(
    form,
    new Set([
      "action",
      "display_name",
      "legal_name",
      "contact_email",
      "contact_phone",
      "description",
      "timezone",
      "locale",
      "profile_version",
    ]),
  );
  const displayName = value(form, "display_name", 120);
  const legalName = value(form, "legal_name", 160);
  const contactEmail = value(form, "contact_email", 254).toLowerCase();
  const description = value(form, "description", 500);
  const locale = value(form, "locale", 10);
  const timezone = value(form, "timezone", 64);
  if (!displayName) {
    throw new ClientValidationError(
      "invalid",
      "El nombre comercial es obligatorio.",
    );
  }
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    throw new ClientValidationError(
      "invalid",
      "El correo de contacto no es válido.",
    );
  }
  if (!SUPPORTED_LOCALES.has(locale) || !SUPPORTED_TIMEZONES.has(timezone)) {
    throw new ClientValidationError(
      "invalid",
      "Configuración regional no compatible.",
    );
  }
  return {
    displayName,
    legalName: nullable(legalName),
    contactEmail: nullable(contactEmail),
    contactPhone: phone(value(form, "contact_phone", 32)),
    description: nullable(description),
    timezone,
    locale,
    expectedVersion: version(form),
  };
}
