import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { listMediaLibrary } from "@/src/media/service.server";
import { emptyRestaurantOnboardingAnswers } from "@/src/onboarding/restaurant-onboarding-schema";
import { clientOnboarding } from "@/src/onboarding/service.server";
import {
  ClientNotice,
  ClientPageHeader,
  ClientStatus,
} from "../../ui";
import { OnboardingEditor } from "./onboarding-editor";

export const dynamic = "force-dynamic";

export default async function ClientOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const [{ caseId }, query] = await Promise.all([params, searchParams]);
  const workspace = await clientOnboarding(session, caseId);
  if (!workspace) notFound();
  const library = await listMediaLibrary(session, {
    siteId: workspace.siteId,
    status: "ready",
    pageSize: 48,
  });
  const answers =
    workspace.answers ??
    emptyRestaurantOnboardingAnswers({
      businessName: workspace.siteName,
      email: session.email,
    });
  const editable = [
    "pending_review",
    "preparing",
    "waiting_information",
  ].includes(workspace.status);

  return (
    <>
      <ClientPageHeader
        eyebrow="Incorporación asistida"
        title={workspace.siteName}
        description="Completa la información estructurada de tu negocio. El equipo nexi revisará el contenido antes de publicarlo."
        action={
          workspace.linkedConversationId ? (
            <Link
              className="client-button secondary"
              href={`/cuenta/mensajes/${workspace.linkedConversationId}`}
            >
              Ver conversación
            </Link>
          ) : undefined
        }
      />
      <ClientNotice status={query.status} error={query.error} />

      <section className="onboarding-client-summary">
        <div>
          <span>Estado actual</span>
          <ClientStatus value={workspace.status} />
        </div>
        <div>
          <span>Avance</span>
          <strong>
            {workspace.progress.filter((step) => step.complete).length} de{" "}
            {workspace.progress.length} etapas
          </strong>
        </div>
      </section>

      <ol className="onboarding-progress" aria-label="Avance de incorporación">
        {workspace.progress.map((step) => (
          <li
            key={step.key}
            className={
              step.complete ? "complete" : step.current ? "current" : undefined
            }
          >
            <span aria-hidden="true">{step.complete ? "✓" : "•"}</span>
            {step.label}
          </li>
        ))}
      </ol>

      <section className="client-profile-form onboarding-checklist">
        <header>
          <h2>Checklist visible</h2>
          <p>Los controles operativos internos no se muestran en tu cuenta.</p>
        </header>
        <ul>
          {workspace.visibleChecklist.map((item) => (
            <li key={item.itemKey}>
              <span>{item.displayName}</span>
              <ClientStatus value={item.status} />
            </li>
          ))}
        </ul>
      </section>

      {workspace.status === "waiting_client_approval" &&
      workspace.approvalStatus === "pending" ? (
        <section className="client-profile-form onboarding-approval">
          <header>
            <h2>Revisión final</h2>
            <p>
              Revisa la vista previa. Tu decisión quedará ligada a esta revisión
              exacta; cualquier cambio posterior la invalida.
            </p>
          </header>
          <div className="client-card-actions">
            <Link
              className="client-button secondary"
              href={`/cuenta/sitios/${workspace.siteId}/preview`}
            >
              Abrir vista previa
            </Link>
            <form action="/api/onboarding/client" method="post">
              <input type="hidden" name="action" value="approval_decide" />
              <input type="hidden" name="case_id" value={workspace.id} />
              <input type="hidden" name="approval_id" value={workspace.approvalId ?? ""} />
              <input type="hidden" name="decision" value="approve" />
              <input type="hidden" name="idempotency_key" value={randomUUID()} />
              <button className="client-button" type="submit">
                Aprobar esta revisión
              </button>
            </form>
          </div>
          <form action="/api/onboarding/client" method="post">
            <input type="hidden" name="action" value="approval_decide" />
            <input type="hidden" name="case_id" value={workspace.id} />
            <input type="hidden" name="approval_id" value={workspace.approvalId ?? ""} />
            <input type="hidden" name="decision" value="request_changes" />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <label>
              Cambios que necesitas
              <textarea name="decision_note" required minLength={5} maxLength={1000} />
            </label>
            <button className="client-button secondary" type="submit">
              Solicitar cambios
            </button>
          </form>
        </section>
      ) : null}

      <OnboardingEditor
        caseId={workspace.id}
        revision={workspace.answersRevision ?? 0}
        idempotencyKey={randomUUID()}
        initialAnswers={answers}
        assets={(library?.assets ?? []).map((asset) => ({
          id: asset.id,
          displayName: asset.displayName,
          defaultAltText: asset.defaultAltText,
        }))}
        disabled={!editable}
      />
    </>
  );
}
