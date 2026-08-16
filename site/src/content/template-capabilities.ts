import type { TemplateOption } from "./types";
import {
  GYM_PULSO_RENDERER_KEY,
  GYM_PULSO_TEMPLATE_KEY,
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_EDITORIAL_RENDERER_KEY,
  RESTAURANT_EDITORIAL_TEMPLATE_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_RENDERER_KEY,
} from "./types";
import { requireIndustryKey, type IndustryKey } from "./industry";
import {
  rendererIsCompatible,
  rendererSupportsIndustry,
} from "./renderer-manifest";

const SELECTABLE_RENDERERS = new Set<string>([
  RESTAURANT_RENDERER_KEY,
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_EDITORIAL_RENDERER_KEY,
]);

const PREVIEWABLE_RENDERERS = new Set<string>([
  ...SELECTABLE_RENDERERS,
  GYM_PULSO_RENDERER_KEY,
]);

const PUBLISHABLE_RENDERERS = new Set(SELECTABLE_RENDERERS);

const ONBOARDING_RENDERERS = new Set<string>([
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
  RESTAURANT_MODERN_RENDERER_KEY,
  RESTAURANT_EDITORIAL_RENDERER_KEY,
]);

const RESTAURANT_CATALOG_ORDER = new Map<string, number>([
  ["restaurant-classic", 0],
  ["restaurant-modern", 1],
  [RESTAURANT_EDITORIAL_TEMPLATE_KEY, 2],
]);

const GYM_CATALOG_ORDER = new Map<string, number>([
  [GYM_PULSO_TEMPLATE_KEY, 0],
]);

export function templatePreviewIsAllowed(
  option: Pick<
    TemplateOption,
    | "industryKey"
    | "rendererKey"
    | "schemaKey"
    | "minimumSchemaVersion"
    | "maximumSchemaVersion"
    | "status"
  >,
): boolean {
  return option.status === "active" &&
    PREVIEWABLE_RENDERERS.has(option.rendererKey) &&
    rendererIsCompatible(
      option.rendererKey,
      option.industryKey,
      option.schemaKey,
      option.minimumSchemaVersion,
    ) &&
    rendererIsCompatible(
      option.rendererKey,
      option.industryKey,
      option.schemaKey,
      option.maximumSchemaVersion,
    );
}

export function templateSelectionIsAllowed(
  option: Pick<
    TemplateOption,
    | "industryKey"
    | "rendererKey"
    | "schemaKey"
    | "minimumSchemaVersion"
    | "maximumSchemaVersion"
    | "status"
  >,
): boolean {
  return option.status === "active" &&
    SELECTABLE_RENDERERS.has(option.rendererKey) &&
    rendererIsCompatible(
      option.rendererKey,
      option.industryKey,
      option.schemaKey,
      option.minimumSchemaVersion,
    ) &&
    rendererIsCompatible(
      option.rendererKey,
      option.industryKey,
      option.schemaKey,
      option.maximumSchemaVersion,
    );
}

export function rendererPublicationIsAllowed(
  rendererKey: string,
  industryKey: unknown,
): boolean {
  return PUBLISHABLE_RENDERERS.has(rendererKey) &&
    rendererSupportsIndustry(rendererKey, industryKey);
}

export function rendererOnboardingIsAllowed(
  rendererKey: string,
  industryKey: unknown,
): boolean {
  return ONBOARDING_RENDERERS.has(rendererKey) &&
    rendererSupportsIndustry(rendererKey, industryKey);
}

export function templateCatalogOrder(
  left: Pick<TemplateOption, "industryKey" | "templateKey" | "version">,
  right: Pick<TemplateOption, "industryKey" | "templateKey" | "version">,
): number {
  if (left.industryKey !== right.industryKey) {
    return left.industryKey.localeCompare(right.industryKey);
  }
  const catalogOrder = left.industryKey === "restaurant"
    ? RESTAURANT_CATALOG_ORDER
    : GYM_CATALOG_ORDER;
  const leftRank = catalogOrder.get(left.templateKey) ??
    Number.MAX_SAFE_INTEGER;
  const rightRank = catalogOrder.get(right.templateKey) ??
    Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank || right.version - left.version;
}

export function compatibleTemplateCatalog(
  industryValue: unknown,
  schemaKey: string,
  schemaVersion: number,
  options: readonly TemplateOption[],
): TemplateOption[] {
  const industryKey: IndustryKey = requireIndustryKey(industryValue);
  return options
    .filter((option) =>
      option.industryKey === industryKey &&
      option.status === "active" &&
      rendererIsCompatible(
        option.rendererKey,
        industryKey,
        schemaKey,
        schemaVersion,
      ) &&
      templatePreviewIsAllowed(option)
    )
    .sort(templateCatalogOrder);
}
