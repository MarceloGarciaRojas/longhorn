import type { AppEnvironment } from "@/src/config/app-config";

export function canUseSyntheticNotificationAdapter(
  environment: AppEnvironment,
): boolean {
  return environment === "local" || environment === "test";
}
