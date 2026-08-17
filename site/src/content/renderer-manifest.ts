import {
  GYM_PULSO_RENDERER_KEY,
  GYM_SCHEMA_KEY,
  GYM_SCHEMA_VERSION,
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_EDITORIAL_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_RENDERER_KEY,
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
  type RegisteredContentSchemaKey,
} from "./types";
import {
  GYM_INDUSTRY_KEY,
  isIndustryKey,
  RESTAURANT_INDUSTRY_KEY,
  type IndustryKey,
} from "./industry";

export interface RendererDefinition {
  industryKey: IndustryKey;
  schemaKey: RegisteredContentSchemaKey;
  minimumSchemaVersion: number;
  maximumSchemaVersion: number;
}

export class UnknownRendererError extends Error {
  constructor(readonly rendererKey: string) {
    super("renderer_unavailable");
    this.name = "UnknownRendererError";
  }
}

export class DuplicateRendererError extends Error {
  constructor(readonly rendererKey: string) {
    super("renderer_key_duplicated");
    this.name = "DuplicateRendererError";
  }
}

export function createRendererManifest(
  entries: ReadonlyArray<readonly [string, RendererDefinition]>,
): Readonly<Record<string, RendererDefinition>> {
  const manifest: Record<string, RendererDefinition> = {};
  for (const [rendererKey, definition] of entries) {
    if (Object.hasOwn(manifest, rendererKey)) {
      throw new DuplicateRendererError(rendererKey);
    }
    manifest[rendererKey] = Object.freeze({ ...definition });
  }
  return Object.freeze(manifest);
}

const RENDERER_MANIFEST = createRendererManifest([
  [GYM_PULSO_RENDERER_KEY, {
    industryKey: GYM_INDUSTRY_KEY,
    schemaKey: GYM_SCHEMA_KEY,
    minimumSchemaVersion: GYM_SCHEMA_VERSION,
    maximumSchemaVersion: GYM_SCHEMA_VERSION,
  }],
  [RESTAURANT_RENDERER_KEY, {
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
  }],
  [RESTAURANT_CLASSIC_V2_RENDERER_KEY, {
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  }],
  [RESTAURANT_MODERN_RENDERER_KEY, {
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  }],
  [RESTAURANT_EDITORIAL_RENDERER_KEY, {
    industryKey: RESTAURANT_INDUSTRY_KEY,
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  }],
]);

export function registeredRendererKeys(): string[] {
  return Object.keys(RENDERER_MANIFEST);
}

export function rendererIsCompatible(
  rendererKey: string,
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
): boolean {
  const renderer = RENDERER_MANIFEST[rendererKey];
  return Boolean(
    renderer && isIndustryKey(industryKey) &&
    renderer.industryKey === industryKey &&
    renderer.schemaKey === schemaKey &&
    schemaVersion >= renderer.minimumSchemaVersion &&
    schemaVersion <= renderer.maximumSchemaVersion,
  );
}

export function requireCompatibleRenderer(
  rendererKey: string,
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
): RendererDefinition {
  if (!rendererIsCompatible(rendererKey, industryKey, schemaKey, schemaVersion)) {
    throw new UnknownRendererError(rendererKey);
  }
  return RENDERER_MANIFEST[rendererKey];
}

export function rendererSupportsIndustry(
  rendererKey: string,
  industryKey: unknown,
): boolean {
  const renderer = RENDERER_MANIFEST[rendererKey];
  return Boolean(
    renderer && isIndustryKey(industryKey) && renderer.industryKey === industryKey,
  );
}
