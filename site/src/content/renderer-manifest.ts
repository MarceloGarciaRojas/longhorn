import {
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_RENDERER_KEY,
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
} from "./types";

export interface RendererDefinition {
  schemaKey: string;
  minimumSchemaVersion: number;
  maximumSchemaVersion: number;
}

export class UnknownRendererError extends Error {
  constructor(readonly rendererKey: string) {
    super("renderer_unavailable");
    this.name = "UnknownRendererError";
  }
}

const RENDERER_MANIFEST: Readonly<Record<string, RendererDefinition>> = {
  [RESTAURANT_RENDERER_KEY]: {
    schemaKey: RESTAURANT_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
  },
  [RESTAURANT_CLASSIC_V2_RENDERER_KEY]: {
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  },
  [RESTAURANT_MODERN_RENDERER_KEY]: {
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
  },
};

export function registeredRendererKeys(): string[] {
  return Object.keys(RENDERER_MANIFEST);
}

export function rendererIsCompatible(
  rendererKey: string,
  schemaKey: string,
  schemaVersion: number,
): boolean {
  const renderer = RENDERER_MANIFEST[rendererKey];
  return Boolean(
    renderer &&
    renderer.schemaKey === schemaKey &&
    schemaVersion >= renderer.minimumSchemaVersion &&
    schemaVersion <= renderer.maximumSchemaVersion,
  );
}

export function requireCompatibleRenderer(
  rendererKey: string,
  schemaKey: string,
  schemaVersion: number,
): RendererDefinition {
  if (!rendererIsCompatible(rendererKey, schemaKey, schemaVersion)) {
    throw new UnknownRendererError(rendererKey);
  }
  return RENDERER_MANIFEST[rendererKey];
}
