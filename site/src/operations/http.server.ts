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
import type { AuthAudience, AuthSession } from "@/src/auth/types";
import { recordAdminAccessDenied } from "@/src/admin/admin-repository.server";
import { resolveCorrelationId } from "@/src/observability/correlation";
import {
  adminAssignTemplate,
  adminInitializeContent,
  clientChangeTemplate,
  migrateClientDraftToRestaurantV2,
  publishContent,
  restorePublication,
  saveContentDraft,
} from "@/src/content/service.server";
import { RestaurantContentValidationError } from "@/src/content/restaurant-schema";
import {
  adminAssignDomain,
  adminConversationState,
  adminCreateSite,
  adminReply,
  adminReviewDeletion,
  adminUpdateDomain,
  adminUpdateDomainRequest,
  adminUpdateSite,
  cancelDeletion,
  clientConversationStatus,
  clientReply,
  createConversation,
  deliverSyntheticNotifications,
  requestDeletion,
  requestDomain,
} from "./service.server";
import { OperationValidationError } from "./validation";

function wantsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") === true;
}

function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function errorStatus(code: string): number {
  if (code === "denied") return 403;
  if (code === "not_found") return 404;
  if (code === "duplicate" || code === "conflict") return 409;
  if (code === "too_early") return 425;
  return 422;
}

async function requestSession(request: Request): Promise<AuthSession | null> {
  const config = loadAuthConfig();
  const token = readCookie(request, config.cookieName);
  return token ? readAuthSession(hashSessionToken(token)) : null;
}

async function deniedAudit(
  audience: AuthAudience,
  session: AuthSession | null,
  correlationId: string,
  reason: string,
  route: string,
): Promise<void> {
  if (audience === "nexi_admin") {
    await recordAdminAccessDenied({
      userId: session?.userId ?? null,
      correlationId,
      reason,
      metadata: { route },
    }).catch(() => undefined);
    return;
  }
  await writeAuthAuditEvent({
    userId: session?.userId ?? null,
    tenantId: session?.activeTenantId ?? null,
    provider: session?.identityProvider ?? null,
    audience,
    eventType: "access_denied",
    outcome: "blocked",
    correlationId,
    metadata: { reason, route },
  }).catch(() => undefined);
}

export async function authorizeOperationRequest(
  request: Request,
  audience: AuthAudience,
  correlationId: string,
): Promise<
  | { session: AuthSession; response?: never }
  | { session?: never; response: NextResponse }
> {
  const config = loadAuthConfig();
  const session = await requestSession(request);
  const route = new URL(request.url).pathname;
  const safeSameOriginGet = (() => {
    if (request.method !== "GET") return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    const referer = request.headers.get("referer");
    if (!["same-origin", "same-site"].includes(fetchSite ?? "") || !referer) {
      return false;
    }
    try {
      return new URL(referer).origin === new URL(config.publicUrl).origin;
    } catch {
      return false;
    }
  })();
  if (!hasTrustedOrigin(request, config) && !safeSameOriginGet) {
    await deniedAudit(audience, session, correlationId, "invalid_origin", route);
    return {
      response: wantsJson(request)
        ? NextResponse.json({ ok: false, code: "request" }, { status: 403 })
        : new NextResponse("Solicitud no válida", { status: 403 }),
    };
  }
  const valid =
    session?.audience === audience &&
    (audience !== "client_admin" || Boolean(session.activeTenantId)) &&
    (audience !== "nexi_admin" || session.assuranceLevel === "aal2");
  if (!session || !valid) {
    await deniedAudit(audience, session, correlationId, "invalid_session", route);
    if (wantsJson(request)) {
      return {
        response: NextResponse.json(
          { ok: false, code: "session" },
          { status: 401 },
        ),
      };
    }
    return {
      response: redirect(
        request,
        audience === "nexi_admin" ? "/nexi-interno/ingresar" : "/ingresar",
      ),
    };
  }
  const limiter = await consumeAuthRateLimit(
    audience === "nexi_admin" ? "admin_mutation" : "client_mutation",
    hashPrivateIdentifier(
      config,
      `${audience}-operation:${session.userId}`,
    ),
    audience === "nexi_admin" ? 80 : 40,
    10 * 60,
    10 * 60,
  );
  if (!limiter.allowed) {
    const response = wantsJson(request)
      ? NextResponse.json({ ok: false, code: "rate" }, { status: 429 })
      : redirect(
          request,
          audience === "nexi_admin"
            ? "/nexi-interno?error=rate"
            : "/cuenta?error=rate",
        );
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return { response };
  }
  return { session };
}

function operationError(error: unknown): string {
  return error instanceof OperationValidationError ? error.code : "invalid";
}

function operationField(error: unknown): string | undefined {
  if (error instanceof RestaurantContentValidationError) return error.field;
  if (error instanceof OperationValidationError) return error.field;
  return undefined;
}

export async function handleClientOperation(
  request: Request,
): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await authorizeOperationRequest(request, "client_admin", correlationId);
  if (access.response) return access.response;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    let resourceId: string;
    let destination: string;
    switch (action) {
      case "deletion_request":
        resourceId = await requestDeletion(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=deletion-requested`;
        break;
      case "deletion_cancel":
        resourceId = await cancelDeletion(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=deletion-canceled`;
        break;
      case "domain_request":
        resourceId = await requestDomain(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=domain-requested`;
        break;
      case "conversation_create":
        resourceId = await createConversation(access.session, form, correlationId);
        destination = `/cuenta/mensajes/${resourceId}?status=created`;
        break;
      case "message_reply":
        resourceId = await clientReply(access.session, form, correlationId);
        destination = `/cuenta/mensajes/${resourceId}?status=sent`;
        break;
      case "conversation_status":
        resourceId = await clientConversationStatus(
          access.session,
          form,
          correlationId,
        );
        destination = `/cuenta/mensajes/${resourceId}?status=updated`;
        break;
      case "content_save":
        resourceId = await saveContentDraft(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=draft-saved`;
        break;
      case "content_publish":
        resourceId = await publishContent(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=published`;
        break;
      case "content_restore":
        resourceId = await restorePublication(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}?status=restored`;
        break;
      case "template_change":
        resourceId = await clientChangeTemplate(access.session, form, correlationId);
        destination = `/cuenta/sitios/${resourceId}/plantillas?status=changed`;
        break;
      case "restaurant_v2_migrate":
        resourceId = await migrateClientDraftToRestaurantV2(
          access.session,
          form,
          correlationId,
        );
        destination = `/cuenta/sitios/${resourceId}?status=migrated`;
        break;
      default:
        throw new OperationValidationError("denied");
    }
    return wantsJson(request)
      ? NextResponse.json({ ok: true, resourceId })
      : redirect(request, destination);
  } catch (error) {
    const code = operationError(error);
    const field = operationField(error);
    const siteId = String(form.get("site_id") || "");
    const conversationId = String(form.get("conversation_id") || "");
    const destination = /^[0-9a-f-]{36}$/i.test(conversationId)
      ? `/cuenta/mensajes/${conversationId}`
      : /^[0-9a-f-]{36}$/i.test(siteId)
        ? `/cuenta/sitios/${siteId}`
        : action.startsWith("conversation") || action === "message_reply"
          ? "/cuenta/mensajes"
          : "/cuenta/sitios";
    return wantsJson(request)
      ? NextResponse.json(
          { ok: false, code, ...(field ? { field } : {}) },
          { status: errorStatus(code) },
        )
      : redirect(
          request,
          `${destination}?error=${code}${field ? `&field=${encodeURIComponent(field)}` : ""}`,
        );
  }
}

export async function handleAdminOperation(
  request: Request,
): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await authorizeOperationRequest(request, "nexi_admin", correlationId);
  if (access.response) return access.response;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    let resourceId: string | number;
    let destination: string;
    switch (action) {
      case "site_create":
        resourceId = await adminCreateSite(access.session, form, correlationId);
        destination = `/nexi-interno/sitios/${resourceId}?status=created`;
        break;
      case "site_update":
        resourceId = await adminUpdateSite(access.session, form, correlationId);
        destination = `/nexi-interno/sitios/${resourceId}?status=updated`;
        break;
      case "domain_assign":
        resourceId = await adminAssignDomain(access.session, form, correlationId);
        destination = `/nexi-interno/sitios/${resourceId}?status=domain-assigned`;
        break;
      case "deletion_review":
        resourceId = await adminReviewDeletion(access.session, form, correlationId);
        destination = "/nexi-interno/solicitudes/eliminacion?status=updated";
        break;
      case "domain_request_update":
        resourceId = await adminUpdateDomainRequest(
          access.session,
          form,
          correlationId,
        );
        destination = "/nexi-interno/solicitudes/dominios?status=updated";
        break;
      case "domain_update":
        resourceId = await adminUpdateDomain(
          access.session,
          form,
          correlationId,
        );
        destination = `/nexi-interno/sitios/${resourceId}?status=domain-updated`;
        break;
      case "support_reply":
        resourceId = await adminReply(access.session, form, correlationId);
        destination = `/nexi-interno/soporte/${resourceId}?status=sent`;
        break;
      case "conversation_state":
        resourceId = await adminConversationState(
          access.session,
          form,
          correlationId,
        );
        destination = `/nexi-interno/soporte/${resourceId}?status=updated`;
        break;
      case "notifications_deliver":
        resourceId = await deliverSyntheticNotifications(
          access.session,
          correlationId,
        );
        destination = `/nexi-interno/soporte?status=notifications&count=${resourceId}`;
        break;
      case "template_assign":
        resourceId = await adminAssignTemplate(access.session, form, correlationId);
        destination = `/nexi-interno/sitios/${resourceId}?status=template-assigned`;
        break;
      case "content_initialize":
        resourceId = await adminInitializeContent(
          access.session,
          form,
          correlationId,
        );
        destination = `/nexi-interno/sitios/${resourceId}?status=content-initialized`;
        break;
      default:
        throw new OperationValidationError("denied");
    }
    return wantsJson(request)
      ? NextResponse.json({ ok: true, resourceId })
      : redirect(request, destination);
  } catch (error) {
    const code = operationError(error);
    const siteId = String(form.get("site_id") || "");
    const conversationId = String(form.get("conversation_id") || "");
    const destination = /^[0-9a-f-]{36}$/i.test(conversationId)
      ? `/nexi-interno/soporte/${conversationId}`
      : /^[0-9a-f-]{36}$/i.test(siteId)
        ? `/nexi-interno/sitios/${siteId}`
        : action === "deletion_review"
          ? "/nexi-interno/solicitudes/eliminacion"
          : action === "domain_request_update"
            ? "/nexi-interno/solicitudes/dominios"
            : action.startsWith("support") || action === "conversation_state"
              ? "/nexi-interno/soporte"
              : "/nexi-interno/sitios";
    return wantsJson(request)
      ? NextResponse.json(
          { ok: false, code },
          { status: errorStatus(code) },
        )
      : redirect(request, `${destination}?error=${code}`);
  }
}
