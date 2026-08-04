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
} from "@/src/auth/security";
import type { AuthSession } from "@/src/auth/types";
import { resolveCorrelationId } from "@/src/observability/correlation";
import {
  convertIntake,
  createManualIntake,
  decideClientApproval,
  generateOnboardingDraft,
  markReadyToPublish,
  OnboardingOperationError,
  publishOnboarding,
  requestClientApproval,
  requestOnboardingInformation,
  reviewIntake,
  saveClientAnswers,
  transitionCase,
  updateCaseOperations,
  updateChecklistItem,
} from "./service.server";

function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

async function requestSession(request: Request): Promise<AuthSession | null> {
  const config = loadAuthConfig();
  const token = readCookie(request, config.cookieName);
  return token ? readAuthSession(hashSessionToken(token)) : null;
}

async function requireSession(
  request: Request,
  audience: "nexi_admin" | "client_admin",
): Promise<
  | { session: AuthSession; response?: never }
  | { session?: never; response: NextResponse }
> {
  const config = loadAuthConfig();
  if (!hasTrustedOrigin(request, config)) {
    return { response: new NextResponse("Solicitud no válida.", { status: 403 }) };
  }
  const session = await requestSession(request);
  const valid = audience === "nexi_admin"
    ? session?.audience === "nexi_admin" && session.assuranceLevel === "aal2"
    : session?.audience === "client_admin" && Boolean(session.activeTenantId);
  if (!session || !valid) {
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
      `onboarding-${audience}:${session.userId}`,
    ),
    80,
    10 * 60,
    10 * 60,
  );
  if (!limiter.allowed) {
    const response = redirect(
      request,
      audience === "nexi_admin"
        ? "/nexi-interno/onboarding?error=rate"
        : "/cuenta/incorporacion?error=rate",
    );
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return { response };
  }
  return { session };
}

function errorCode(error: unknown): string {
  return error instanceof OnboardingOperationError ? error.code : "invalid";
}

export async function handleAdminOnboarding(
  request: Request,
): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await requireSession(request, "nexi_admin");
  if (access.response) return access.response;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    switch (action) {
      case "manual_create": {
        const id = await createManualIntake(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/solicitudes/${id}?status=created`);
      }
      case "intake_review": {
        const id = await reviewIntake(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/solicitudes/${id}?status=updated`);
      }
      case "intake_convert": {
        const result = await convertIntake(access.session, form, correlationId);
        const synthetic = result.acceptanceToken
          ? `?status=converted&synthetic=${encodeURIComponent(result.acceptanceToken)}`
          : "?status=converted";
        return redirect(
          request,
          `/nexi-interno/onboarding/casos/${result.caseId}${synthetic}`,
        );
      }
      case "case_transition": {
        const id = await transitionCase(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=updated`);
      }
      case "case_operations": {
        const id = await updateCaseOperations(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=updated`);
      }
      case "checklist_update": {
        const id = await updateChecklistItem(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=checklist`);
      }
      case "request_information": {
        const id = await requestOnboardingInformation(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=information`);
      }
      case "generate_draft": {
        const result = await generateOnboardingDraft(access.session, form, correlationId);
        return redirect(
          request,
          `/nexi-interno/onboarding/casos/${result.caseId}?status=draft`,
        );
      }
      case "request_approval": {
        const id = await requestClientApproval(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=approval`);
      }
      case "mark_ready": {
        const id = await markReadyToPublish(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=ready`);
      }
      case "publish": {
        const id = await publishOnboarding(access.session, form, correlationId);
        return redirect(request, `/nexi-interno/onboarding/casos/${id}?status=published`);
      }
      default:
        return redirect(request, "/nexi-interno/onboarding?error=invalid");
    }
  } catch (error) {
    const caseId = String(form.get("case_id") || "");
    const intakeId = String(form.get("intake_id") || "");
    const target = UUID(caseId)
      ? `/nexi-interno/onboarding/casos/${caseId}`
      : UUID(intakeId)
        ? `/nexi-interno/onboarding/solicitudes/${intakeId}`
        : "/nexi-interno/onboarding";
    return redirect(request, `${target}?error=${errorCode(error)}`);
  }
}

function UUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

export async function handleClientOnboarding(
  request: Request,
): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await requireSession(request, "client_admin");
  if (access.response) return access.response;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  const caseId = String(form.get("case_id") || "");
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  try {
    if (action === "answers_save") {
      const id = await saveClientAnswers(access.session, form, correlationId);
      if (wantsJson) return NextResponse.json({ ok: true, id });
      return redirect(request, `/cuenta/incorporacion/${id}?status=saved`);
    }
    if (action === "approval_decide") {
      const id = await decideClientApproval(access.session, form, correlationId);
      if (wantsJson) return NextResponse.json({ ok: true, id });
      return redirect(request, `/cuenta/incorporacion/${id}?status=decision`);
    }
    return redirect(request, "/cuenta/incorporacion?error=invalid");
  } catch (error) {
    if (wantsJson) {
      const code = errorCode(error);
      return NextResponse.json(
        { ok: false, code },
        { status: code === "denied" ? 403 : code === "conflict" ? 409 : 400 },
      );
    }
    const target = UUID(caseId)
      ? `/cuenta/incorporacion/${caseId}`
      : "/cuenta/incorporacion";
    return redirect(request, `${target}?error=${errorCode(error)}`);
  }
}
