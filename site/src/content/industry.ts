export const INDUSTRY_KEYS = ["restaurant", "gym"] as const;

export type IndustryKey = (typeof INDUSTRY_KEYS)[number];

export const RESTAURANT_INDUSTRY_KEY: IndustryKey = "restaurant";
export const GYM_INDUSTRY_KEY: IndustryKey = "gym";

export class UnknownIndustryError extends Error {
  constructor(readonly value: unknown) {
    super("industry_unavailable");
    this.name = "UnknownIndustryError";
  }
}

export function isIndustryKey(value: unknown): value is IndustryKey {
  return typeof value === "string" &&
    INDUSTRY_KEYS.some((industry) => industry === value);
}

export function requireIndustryKey(value: unknown): IndustryKey {
  if (!isIndustryKey(value)) throw new UnknownIndustryError(value);
  return value;
}
