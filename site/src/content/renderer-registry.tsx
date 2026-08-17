import type { ReactNode } from "react";
import { GymPulsoRenderer } from "./renderers/gym-pulso";
import { RestaurantClassicRenderer } from "./renderers/restaurant-classic";
import { RestaurantEditorialRenderer } from "./renderers/restaurant-editorial";
import { RestaurantMediaRenderer } from "./renderers/restaurant-media";
import {
  requireCompatibleRenderer,
  UnknownRendererError,
} from "./renderer-manifest";
import { validateRestaurantContent } from "./restaurant-schema";
import { validateRestaurantV2Content } from "./restaurant-v2-schema";
import { validateGymV1Content } from "./gym-v1-schema";
import type { MediaRenderManifest } from "@/src/media/types";
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
} from "./types";
import type { IndustryKey } from "./industry";

export { UnknownRendererError } from "./renderer-manifest";

const REGISTRY = {
  [GYM_PULSO_RENDERER_KEY]: {
    schemaKey: GYM_SCHEMA_KEY,
    minimumSchemaVersion: GYM_SCHEMA_VERSION,
    maximumSchemaVersion: GYM_SCHEMA_VERSION,
    render(
      content: unknown,
      preview: boolean,
      validationMode: "draft" | "publication",
      media: MediaRenderManifest,
    ): ReactNode {
      return (
        <GymPulsoRenderer
          content={validateGymV1Content(content, validationMode)}
          media={media}
          preview={preview}
        />
      );
    },
  },
  [RESTAURANT_RENDERER_KEY]: {
    schemaKey: RESTAURANT_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_SCHEMA_VERSION,
    render(
      content: unknown,
      preview: boolean,
      validationMode: "draft" | "publication",
    ): ReactNode {
      const validated = validateRestaurantContent(content, validationMode);
      return <RestaurantClassicRenderer content={validated} preview={preview} />;
    },
  },
  [RESTAURANT_CLASSIC_V2_RENDERER_KEY]: {
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    render(
      content: unknown,
      preview: boolean,
      validationMode: "draft" | "publication",
      media: MediaRenderManifest,
    ): ReactNode {
      return (
        <RestaurantMediaRenderer
          content={validateRestaurantV2Content(content, validationMode)}
          media={media}
          preview={preview}
          design="classic"
        />
      );
    },
  },
  [RESTAURANT_MODERN_RENDERER_KEY]: {
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    render(
      content: unknown,
      preview: boolean,
      validationMode: "draft" | "publication",
      media: MediaRenderManifest,
    ): ReactNode {
      return (
        <RestaurantMediaRenderer
          content={validateRestaurantV2Content(content, validationMode)}
          media={media}
          preview={preview}
          design="modern"
        />
      );
    },
  },
  [RESTAURANT_EDITORIAL_RENDERER_KEY]: {
    schemaKey: RESTAURANT_V2_SCHEMA_KEY,
    minimumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    maximumSchemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
    render(
      content: unknown,
      preview: boolean,
      validationMode: "draft" | "publication",
      media: MediaRenderManifest,
    ): ReactNode {
      return (
        <RestaurantEditorialRenderer
          content={validateRestaurantV2Content(content, validationMode)}
          media={media}
          preview={preview}
        />
      );
    },
  },
} as const;

export function renderRegisteredTemplate(input: {
  rendererKey: string;
  industryKey: IndustryKey;
  schemaKey: string;
  schemaVersion: number;
  content: unknown;
  preview?: boolean;
  validationMode?: "draft" | "publication";
  media?: MediaRenderManifest;
}): ReactNode {
  requireCompatibleRenderer(
    input.rendererKey,
    input.industryKey,
    input.schemaKey,
    input.schemaVersion,
  );
  const renderer = REGISTRY[input.rendererKey as keyof typeof REGISTRY];
  if (!renderer) throw new UnknownRendererError(input.rendererKey);
  return renderer.render(
    input.content,
    input.preview === true,
    input.validationMode ?? "publication",
    input.media ?? {},
  );
}
