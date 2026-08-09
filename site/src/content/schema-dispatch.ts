import {
  parseRestaurantContent,
  RestaurantContentValidationError,
  validateRestaurantContent,
} from "./restaurant-schema";
import {
  parseRestaurantV2Content,
  validateRestaurantV2Content,
} from "./restaurant-v2-schema";
import {
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
  type RegisteredContent,
  type RegisteredContentSchemaKey,
} from "./types";
import {
  isIndustryKey,
  RESTAURANT_INDUSTRY_KEY,
  type IndustryKey,
} from "./industry";

export interface ContentSchemaDefinition {
  industryKey: IndustryKey;
  schemaKey: RegisteredContentSchemaKey;
  schemaVersion: number;
}

export class ContentSchemaUnavailableError extends Error {
  constructor(
    readonly industryKey: unknown,
    readonly schemaKey: string,
    readonly schemaVersion: number,
  ) {
    super("schema_unavailable");
    this.name = "ContentSchemaUnavailableError";
  }
}

export class ContentSchemaValidationError extends Error {
  constructor(
    readonly field: string,
    options?: ErrorOptions,
  ) {
    super("content_invalid", options);
    this.name = "ContentSchemaValidationError";
  }
}

const CONTENT_SCHEMAS = Object.freeze([
  Object.freeze({
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_SCHEMA_KEY,
    schemaVersion: RESTAURANT_SCHEMA_VERSION,
  }),
  Object.freeze({
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    schemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  }),
] satisfies readonly ContentSchemaDefinition[]);

export function registeredContentSchemas(): readonly ContentSchemaDefinition[] {
  return CONTENT_SCHEMAS;
}

export function contentSchemaIsCompatible(
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
): boolean {
  if (!isIndustryKey(industryKey)) return false;
  return CONTENT_SCHEMAS.some((schema) =>
    schema.industryKey === industryKey &&
    schema.schemaKey === schemaKey &&
    schema.schemaVersion === schemaVersion
  );
}

export function requireCompatibleContentSchema(
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
): ContentSchemaDefinition {
  const definition = CONTENT_SCHEMAS.find((schema) =>
    schema.industryKey === industryKey &&
    schema.schemaKey === schemaKey &&
    schema.schemaVersion === schemaVersion
  );
  if (!definition) {
    throw new ContentSchemaUnavailableError(industryKey, schemaKey, schemaVersion);
  }
  return definition;
}

function normalizeValidationError<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RestaurantContentValidationError) {
      throw new ContentSchemaValidationError(error.field, { cause: error });
    }
    throw error;
  }
}

export function validateContentForSchema(
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
  content: unknown,
  mode: "draft" | "publication",
): RegisteredContent {
  requireCompatibleContentSchema(industryKey, schemaKey, schemaVersion);
  if (
    schemaKey === RESTAURANT_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_SCHEMA_VERSION
  ) return normalizeValidationError(() => validateRestaurantContent(content, mode));
  if (
    schemaKey === RESTAURANT_V2_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_V2_SCHEMA_VERSION
  ) return normalizeValidationError(() => validateRestaurantV2Content(content, mode));
  throw new ContentSchemaUnavailableError(industryKey, schemaKey, schemaVersion);
}

export function parseContentForSchema(
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
  serialized: string,
  mode: "draft" | "publication",
): RegisteredContent {
  requireCompatibleContentSchema(industryKey, schemaKey, schemaVersion);
  if (
    schemaKey === RESTAURANT_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_SCHEMA_VERSION
  ) return normalizeValidationError(() => parseRestaurantContent(serialized, mode));
  if (
    schemaKey === RESTAURANT_V2_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_V2_SCHEMA_VERSION
  ) return normalizeValidationError(() => parseRestaurantV2Content(serialized, mode));
  throw new ContentSchemaUnavailableError(industryKey, schemaKey, schemaVersion);
}
