export const ALPHA_RESTAURANT_SMOKE_ROUTES = [
  "authentication",
  "client-panel",
  "content-edit",
  "preview",
  "publication",
  "public-resolution",
] as const;

type SmokeRoute = (typeof ALPHA_RESTAURANT_SMOKE_ROUTES)[number];

interface RouteEvidence {
  httpStatus: number;
  cpuTimeMs: number;
  outcome: string;
  throttled: boolean;
  errorCode: number | null;
}

interface AlphaSmokeEvidence {
  commitSha: string;
  source: "cloudflare-workers-logs-and-e2e";
  routes: Record<SmokeRoute, RouteEvidence>;
  consistency: {
    readAfterWriteObserved: boolean;
    revokedSessionRejected: boolean;
    revokedPermissionRejected: boolean;
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Alpha smoke evidence must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function validateAlphaSmokeEvidence(
  input: unknown,
  expectedCommitSha: string,
): AlphaSmokeEvidence {
  const evidence = record(input);
  if (evidence.commitSha !== expectedCommitSha) {
    throw new Error("Alpha smoke evidence does not match the deployed commit");
  }
  if (evidence.source !== "cloudflare-workers-logs-and-e2e") {
    throw new Error("Alpha smoke evidence must come from Workers Logs and real E2E probes");
  }

  const routes = record(evidence.routes);
  for (const routeName of ALPHA_RESTAURANT_SMOKE_ROUTES) {
    const route = record(routes[routeName]);
    const status = route.httpStatus;
    const cpuTime = route.cpuTimeMs;
    if (typeof status !== "number" || status < 200 || status >= 400) {
      throw new Error(`Alpha smoke route ${routeName} did not succeed`);
    }
    if (typeof cpuTime !== "number" || cpuTime < 0 || cpuTime > 10) {
      throw new Error(`Alpha smoke route ${routeName} exceeded Workers Free CPU`);
    }
    if (route.outcome !== "ok" || route.throttled !== false || route.errorCode !== null) {
      throw new Error(`Alpha smoke route ${routeName} was throttled or exceeded runtime limits`);
    }
  }

  const consistency = record(evidence.consistency);
  for (const check of [
    "readAfterWriteObserved",
    "revokedSessionRejected",
    "revokedPermissionRejected",
  ] as const) {
    if (consistency[check] !== true) {
      throw new Error(`Alpha consistency check ${check} did not pass`);
    }
  }

  return input as AlphaSmokeEvidence;
}
