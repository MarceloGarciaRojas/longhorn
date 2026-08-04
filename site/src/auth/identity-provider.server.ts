import "server-only";

import type { AuthConfig } from "./config";
import type { IdentityProvider } from "./types";
import { SupabaseIdentityProvider } from "./supabase-identity-provider.server";
import { TestIdentityProvider } from "./test-identity-provider.server";

export function createIdentityProvider(
  config: Readonly<AuthConfig>,
): IdentityProvider {
  if (config.provider === "test") {
    return new TestIdentityProvider();
  }
  return new SupabaseIdentityProvider(
    config.supabaseUrl!,
    config.supabasePublishableKey!,
    config.supabaseSecretKey,
  );
}
