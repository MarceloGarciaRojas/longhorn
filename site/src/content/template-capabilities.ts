import type { TemplateOption } from "./types";
import {
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_EDITORIAL_RENDERER_KEY,
  RESTAURANT_EDITORIAL_TEMPLATE_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_RENDERER_KEY,
} from "./types";

const SELECTABLE_RENDERERS = new Set<string>([
  RESTAURANT_RENDERER_KEY,
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
]);

const PUBLISHABLE_RENDERERS = new Set(SELECTABLE_RENDERERS);

const ONBOARDING_RENDERERS = new Set<string>([
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
]);

const RESTAURANT_CATALOG_ORDER = new Map<string, number>([
  ["restaurant-classic", 0],
  ["restaurant-modern", 1],
  [RESTAURANT_EDITORIAL_TEMPLATE_KEY, 2],
]);

export function templateSelectionIsAllowed(
  option: Pick<TemplateOption, "rendererKey" | "status">,
): boolean {
  return option.status === "active" &&
    SELECTABLE_RENDERERS.has(option.rendererKey);
}

export function rendererPublicationIsAllowed(rendererKey: string): boolean {
  return PUBLISHABLE_RENDERERS.has(rendererKey);
}

export function rendererOnboardingIsAllowed(rendererKey: string): boolean {
  return ONBOARDING_RENDERERS.has(rendererKey);
}

export function templateCatalogOrder(
  left: Pick<TemplateOption, "templateKey" | "version">,
  right: Pick<TemplateOption, "templateKey" | "version">,
): number {
  const leftRank = RESTAURANT_CATALOG_ORDER.get(left.templateKey) ??
    Number.MAX_SAFE_INTEGER;
  const rightRank = RESTAURANT_CATALOG_ORDER.get(right.templateKey) ??
    Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank || right.version - left.version;
}

export function rendererIsPreviewOnly(rendererKey: string): boolean {
  return rendererKey === RESTAURANT_EDITORIAL_RENDERER_KEY;
}
