export type PublicHostResolution =
  | { kind: "platform"; hostname: string }
  | { kind: "site_candidate"; hostname: string }
  | { kind: "invalid"; hostname: null };

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(host: string): string | null {
  const candidate = host.trim().toLowerCase().replace(/\.$/, "");
  const withoutPort =
    candidate.startsWith("[") || candidate.split(":").length > 2
      ? candidate
      : candidate.replace(/:\d{1,5}$/, "");
  if (
    withoutPort === "localhost" ||
    withoutPort.endsWith(".localhost") ||
    !HOSTNAME_PATTERN.test(withoutPort)
  ) {
    return null;
  }
  return withoutPort;
}

export function classifyPublicHost(
  host: string,
  platformHosts: readonly string[],
): PublicHostResolution {
  const hostname = normalizeHostname(host);
  if (!hostname) {
    return { kind: "invalid", hostname: null };
  }
  const normalizedPlatformHosts = new Set(
    platformHosts.map(normalizeHostname).filter(Boolean),
  );
  return normalizedPlatformHosts.has(hostname)
    ? { kind: "platform", hostname }
    : { kind: "site_candidate", hostname };
}
