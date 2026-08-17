import "server-only";

import type { EnvironmentSource } from "@/src/config/app-config";
import { DatabaseConfigError, readDatabaseUrl } from "./config";

interface HyperdriveBinding {
  readonly connectionString: string;
}

type RuntimeBindings = Readonly<Record<string, unknown>>;
type BindingLoader = () => Promise<RuntimeBindings>;

async function cloudflareBindings(): Promise<RuntimeBindings> {
  const runtime = await import("cloudflare:workers");
  return runtime.env;
}

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { connectionString?: unknown }).connectionString ===
        "string",
  );
}

export async function resolveApplicationDatabaseUrl(
  source: EnvironmentSource = process.env,
  loadBindings: BindingLoader = cloudflareBindings,
): Promise<string> {
  if ((source.APP_ENV?.trim() || "local") !== "alpha") {
    return readDatabaseUrl("application", source);
  }

  let bindings: RuntimeBindings;
  try {
    bindings = await loadBindings();
  } catch {
    throw new DatabaseConfigError(
      "HYPERDRIVE",
      "the alpha runtime binding is unavailable",
    );
  }
  const binding = bindings.HYPERDRIVE;
  if (!isHyperdriveBinding(binding) || !binding.connectionString.trim()) {
    throw new DatabaseConfigError(
      "HYPERDRIVE",
      "the alpha runtime binding is required",
    );
  }
  return binding.connectionString;
}
