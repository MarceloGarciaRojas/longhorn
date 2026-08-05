import "server-only";

import { NextResponse } from "next/server";
import {
  consumeAuthRateLimit,
  readAuthSession,
  writeAuthAuditEvent,
} from "@/src/auth/auth-repository.server";
import { loadAuthConfig } from "@/src/auth/config";
import {
  hashPrivateIdentifier,
  hashSessionToken,
  hasTrustedOrigin,
  readCookie,
} from "@/src/auth/security";
import type { AuthSession } from "@/src/auth/types";
import { resolveCorrelationId } from "@/src/observability/correlation";
import {
  saveCompanyProfile,
  savePersonalProfile,
} from "./client-service.server";
import {
  ClientValidationError,
  parseCompanyProfile,
  parsePersonalProfile,
} from "./validation";

function wantsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") === true;
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

function redirect(request: Request, query: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/cuenta/datos?${query}`, request.url),
    303,
  );
}

async function sessionFromRequest(request: Request): Promise<AuthSession | null> {
  const config = loadAuthConfig();
  const token = readCookie(request, config.cookieName);
  return token ? readAuthSession(hashSessionToken(token)) : null;
}

async function auditDenied(
  session: AuthSession | null,
  correlationId: string,
  reason: string,
): Promise<void> {
  await writeAuthAuditEvent({
    userId: session?.userId ?? null,
    tenantId: session?.activeTenantId ?? null,
    provider: session?.identityProvider ?? null,
    audience: "client_admin",
    eventType: "access_denied",
    outcome: "blocked",
    correlationId,
    metadata: { reason },
  }).catch(() => undefined);
}

export async function handleClientAction(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  const session = await sessionFromRequest(request);

  if (!hasTrustedOrigin(request, config)) {
    await auditDenied(session, correlationId, "invalid_origin");
    return wantsJson(request)
      ? json({ ok: false, code: "request" }, 403)
      : new NextResponse("Solicitud no válida", { status: 403 });
  }
  if (
    !session ||
    session.audience !== "client_admin" ||
    !session.activeTenantId
  ) {
    await auditDenied(session, correlationId, "invalid_client_session");
    return wantsJson(request)
      ? json({ ok: false, code: "session" }, 401)
      : NextResponse.redirect(new URL("/ingresar", request.url), 303);
  }

  const limiter = await consumeAuthRateLimit(
    "client_mutation",
    hashPrivateIdentifier(config, `client-mutation:${session.userId}`),
    40,
    10 * 60,
    10 * 60,
  );
  if (!limiter.allowed) {
    const response = wantsJson(request)
      ? json({ ok: false, code: "rate" }, 429)
      : redirect(request, "error=rate");
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return response;
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  try {
    let version: number;
    if (action === "personal_profile_update") {
      version = await savePersonalProfile(
        session,
        parsePersonalProfile(form),
        correlationId,
      );
    } else if (action === "company_profile_update") {
      version = await saveCompanyProfile(
        session,
        parseCompanyProfile(form),
        correlationId,
      );
    } else {
      throw new ClientValidationError("forbidden", "Acción no autorizada.");
    }
    return wantsJson(request)
      ? json({ ok: true, version }, 200)
      : redirect(request, "status=saved");
  } catch (error) {
    const code =
      error instanceof ClientValidationError ? error.code : "invalid";
    if (code === "forbidden" || code === "denied") {
      await auditDenied(session, correlationId, code);
    }
    const status =
      code === "conflict"
        ? 409
        : code === "forbidden" || code === "denied"
          ? 403
          : 422;
    return wantsJson(request)
      ? json({ ok: false, code }, status)
      : redirect(request, `error=${code}`);
  }
}
