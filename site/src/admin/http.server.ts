import "server-only";

import { NextResponse } from "next/server";
import {
  consumeAuthRateLimit,
  readAuthSession,
} from "@/src/auth/auth-repository.server";
import { loadAuthConfig } from "@/src/auth/config";
import {
  hashPrivateIdentifier,
  hashSessionToken,
  hasTrustedOrigin,
  readCookie,
  resolveClientAddress,
} from "@/src/auth/security";
import type { AuthSession } from "@/src/auth/types";
import { resolveCorrelationId } from "@/src/observability/correlation";
import {
  createInvitationFromForm,
  createTenantFromForm,
  AdminValidationError,
  acceptInvitationToken,
  resendInvitationFromForm,
  revokeInvitationFromForm,
  setMembershipStatusFromForm,
  setTenantStatusFromForm,
  updateTenantFromForm,
} from "./admin-service.server";
import { recordAdminAccessDenied } from "./admin-repository.server";

function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function errorCode(error: unknown): string {
  return error instanceof AdminValidationError ? error.code : "invalid";
}

async function sessionFromRequest(request: Request): Promise<AuthSession | null> {
  const config = loadAuthConfig();
  const token = readCookie(request, config.cookieName);
  return token ? readAuthSession(hashSessionToken(token)) : null;
}

async function requireAdminRequest(
  request: Request,
  correlationId: string,
): Promise<
  | { session: AuthSession; response?: never }
  | { session?: never; response: NextResponse }
> {
  const config = loadAuthConfig();
  const session = await sessionFromRequest(request);
  if (!hasTrustedOrigin(request, config)) {
    await recordAdminAccessDenied({
      userId: session?.userId ?? null,
      correlationId,
      reason: "Origen de solicitud no autorizado.",
      metadata: { route: new URL(request.url).pathname },
    }).catch(() => undefined);
    return {
      response: new NextResponse("Solicitud no válida", { status: 403 }),
    };
  }
  if (
    !session ||
    session.audience !== "nexi_admin" ||
    session.assuranceLevel !== "aal2"
  ) {
    await recordAdminAccessDenied({
      userId: session?.userId ?? null,
      correlationId,
      reason: "Sesión interna o segundo factor no válidos.",
      metadata: { route: new URL(request.url).pathname },
    }).catch(() => undefined);
    return { response: redirect(request, "/nexi-interno/ingresar") };
  }
  const limiter = await consumeAuthRateLimit(
    "admin_mutation",
    hashPrivateIdentifier(config, `admin-mutation:${session.userId}`),
    80,
    10 * 60,
    10 * 60,
  );
  if (!limiter.allowed) {
    const response = redirect(request, "/nexi-interno?error=rate");
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return { response };
  }
  return { session };
}

export async function handleAdminAction(
  request: Request,
): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await requireAdminRequest(request, correlationId);
  if (access.response) {
    return access.response;
  }
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    switch (action) {
      case "tenant_create": {
        const tenantId = await createTenantFromForm(
          access.session,
          form,
          correlationId,
        );
        return redirect(
          request,
          `/nexi-interno/clientes/${tenantId}?status=created`,
        );
      }
      case "tenant_update": {
        const tenantId = await updateTenantFromForm(
          access.session,
          form,
          correlationId,
        );
        return redirect(
          request,
          `/nexi-interno/clientes/${tenantId}?status=updated`,
        );
      }
      case "tenant_status": {
        const tenantId = await setTenantStatusFromForm(
          access.session,
          form,
          correlationId,
        );
        return redirect(
          request,
          `/nexi-interno/clientes/${tenantId}?status=state-changed`,
        );
      }
      case "invitation_create": {
        const result = await createInvitationFromForm(
          access.session,
          form,
          correlationId,
        );
        const synthetic = result.acceptanceToken
          ? `&synthetic=${encodeURIComponent(result.acceptanceToken)}`
          : "";
        return redirect(
          request,
          `/nexi-interno/clientes/${result.tenantId}?status=invited${synthetic}`,
        );
      }
      case "invitation_resend": {
        const result = await resendInvitationFromForm(
          access.session,
          form,
          correlationId,
        );
        const synthetic = result.acceptanceToken
          ? `&synthetic=${encodeURIComponent(result.acceptanceToken)}`
          : "";
        return redirect(
          request,
          `/nexi-interno/invitaciones?status=resent${synthetic}`,
        );
      }
      case "invitation_revoke":
        await revokeInvitationFromForm(
          access.session,
          form,
          correlationId,
        );
        return redirect(
          request,
          "/nexi-interno/invitaciones?status=revoked",
        );
      case "membership_status": {
        const tenantId = await setMembershipStatusFromForm(
          access.session,
          form,
          correlationId,
        );
        return redirect(
          request,
          `/nexi-interno/clientes/${tenantId}?status=membership-changed`,
        );
      }
      default:
        return redirect(request, "/nexi-interno?error=invalid");
    }
  } catch (error) {
    const tenantId = String(form.get("tenant_id") || "");
    const destination = /^[0-9a-f-]{36}$/i.test(tenantId)
      ? `/nexi-interno/clientes/${tenantId}`
      : action.startsWith("invitation_")
        ? "/nexi-interno/invitaciones"
        : "/nexi-interno/clientes";
    return redirect(request, `${destination}?error=${errorCode(error)}`);
  }
}

export async function handleInvitationAcceptance(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  if (!hasTrustedOrigin(request, config)) {
    return new NextResponse("Solicitud no válida", { status: 403 });
  }
  const address = resolveClientAddress(request, config.environment);
  const limiter = await consumeAuthRateLimit(
    "invitation_acceptance",
    hashPrivateIdentifier(config, `invitation-acceptance:${address}`),
    20,
    15 * 60,
    15 * 60,
  );
  if (!limiter.allowed) {
    const response = redirect(request, "/invitacion/aceptar?error=rate");
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return response;
  }
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (token.length < 10 || token.length > 4096) {
    return redirect(request, "/invitacion/aceptar?error=invalid");
  }
  try {
    await acceptInvitationToken(token, correlationId);
    return redirect(request, "/invitacion/aceptar?status=accepted");
  } catch {
    return redirect(request, "/invitacion/aceptar?error=invalid");
  }
}
