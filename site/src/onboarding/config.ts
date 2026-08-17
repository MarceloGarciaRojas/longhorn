import {
  APP_ENVIRONMENTS,
  isDeployedEnvironment,
  type AppEnvironment,
} from "@/src/config/app-config";

export interface OnboardingConfig {
  environment: AppEnvironment;
  publicFormEnabled: boolean;
  publicRateLimit: number;
  maxNotesLength: number;
  supportedIndustries: readonly ["restaurant"];
}

function booleanValue(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Invalid onboarding boolean configuration");
}

function integerValue(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Invalid onboarding numeric configuration");
  }
  return parsed;
}

export function loadOnboardingConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<OnboardingConfig> {
  const rawEnvironment = source.APP_ENV?.trim() || "local";
  if (!APP_ENVIRONMENTS.includes(rawEnvironment as AppEnvironment)) {
    throw new Error("Invalid onboarding environment");
  }
  const environment = rawEnvironment as AppEnvironment;
  const enabledByDefault =
    environment === "local" ||
    environment === "test" ||
    environment === "development";
  const requestedPublicForm = booleanValue(
    source.ONBOARDING_PUBLIC_FORM_ENABLED,
    enabledByDefault,
  );
  if (
    requestedPublicForm &&
    isDeployedEnvironment(environment)
  ) {
    throw new Error(
      "Stage 9A onboarding is restricted to local, development and test",
    );
  }
  const supported = (source.ONBOARDING_SUPPORTED_INDUSTRIES || "restaurant")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (supported.length !== 1 || supported[0] !== "restaurant") {
    throw new Error("Only restaurant onboarding is supported in Stage 9A");
  }
  return Object.freeze({
    environment,
    publicFormEnabled: requestedPublicForm,
    publicRateLimit: integerValue(
      source.ONBOARDING_PUBLIC_RATE_LIMIT,
      5,
      1,
      20,
    ),
    maxNotesLength: integerValue(
      source.ONBOARDING_MAX_NOTES_LENGTH,
      1000,
      200,
      2000,
    ),
    supportedIndustries: ["restaurant"] as const,
  });
}
