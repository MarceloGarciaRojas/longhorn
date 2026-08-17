import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const alphaBuild = process.env.APP_ENV === "alpha";

function requiredAlphaValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for an alpha build`);
  return value;
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const runtimeBindingConfig = {
  main: "./worker/index.ts",
  name: alphaBuild ? "nexi-alpha" : "nexi-local",
  compatibility_date: "2026-08-17",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: alphaBuild },
  vars: alphaBuild
    ? {
        APP_ENV: "alpha",
        APP_URL: requiredAlphaValue("APP_URL"),
        APP_VERSION: process.env.APP_VERSION?.trim() || "0.1.0",
        APP_COMMIT_SHA: requiredAlphaValue("APP_COMMIT_SHA"),
        LOG_LEVEL: process.env.LOG_LEVEL?.trim() || "info",
        SITE_DELETION_GRACE_HOURS: "48",
        AUTH_PROVIDER: "supabase",
        SUPABASE_URL: requiredAlphaValue("SUPABASE_URL"),
        MEDIA_STORAGE_PROVIDER: "supabase",
        MEDIA_SUPABASE_BUCKET: requiredAlphaValue("MEDIA_SUPABASE_BUCKET"),
        MEDIA_PROCESSING_MODE: "synchronous",
        ONBOARDING_PUBLIC_FORM_ENABLED: "false",
        ONBOARDING_SUPPORTED_INDUSTRIES: "restaurant",
      }
    : undefined,
  secrets: alphaBuild
    ? {
        required: [
          "AUTH_SECURITY_PEPPER",
          "SUPABASE_PUBLISHABLE_KEY",
          "SUPABASE_SECRET_KEY",
        ],
      }
    : undefined,
  hyperdrive: alphaBuild
    ? [
        {
          binding: "HYPERDRIVE",
          id: requiredAlphaValue("CLOUDFLARE_HYPERDRIVE_ID"),
        },
      ]
    : [],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: runtimeBindingConfig,
      }),
    ],
  };
});
