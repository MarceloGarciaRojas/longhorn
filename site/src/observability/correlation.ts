const SAFE_CORRELATION_ID = /^[a-zA-Z0-9._-]{1,128}$/;

export function resolveCorrelationId(request: Request): string {
  const candidate =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id");

  return candidate && SAFE_CORRELATION_ID.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
