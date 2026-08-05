import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  adminCase,
  adminCaseOperationalDetails,
  adminOnboardingOptions,
} from "@/src/onboarding/service.server";
import { Notice, PageHeader, StatusBadge, formatDate } from "../../../ui";

export default async function OnboardingCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ status?: string; error?: string; synthetic?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { caseId } = await params;
  const [current, detail, options, query] = await Promise.all([
    adminCase(session, caseId),
    adminCaseOperationalDetails(session, caseId),
    adminOnboardingOptions(session),
    searchParams,
  ]);
  if (!current) notFound();
  const operational = !["published","canceled"].includes(current.status);
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Caso de onboarding"
        title={current.tenantName}
        description={`${current.siteName} · ${current.siteSlug}`}
        action={<Link className="admin-button secondary" href="/nexi-interno/onboarding">Volver</Link>}
      />
      <Notice status={query.status} error={query.error} />
      {query.synthetic ? (
        <p className="admin-notice local-only">
          Invitación sintética preparada. En local/CI puede aceptarse desde{" "}
          <Link href={`/invitacion/aceptar?token=${encodeURIComponent(query.synthetic)}`}>
            el flujo de invitación
          </Link>. Este valor no se almacena en el caso.
        </p>
      ) : null}
      <section className="admin-detail-hero">
        <div><span>Estado</span><StatusBadge value={current.status} /></div>
        <div><span>Prioridad</span><strong>{current.priority}</strong></div>
        <div><span>Responsable</span><strong>{current.assignedAdminName ?? "Sin asignar"}</strong></div>
        <div><span>Actualizado</span><strong>{formatDate(current.updatedAt)}</strong></div>
      </section>
      <div className="content-editor-actions">
        <Link className="admin-button secondary" href={`/nexi-interno/sitios/${current.siteId}/multimedia`}>Multimedia</Link>
        {current.draftRevision ? (
          <Link className="admin-button secondary" href={`/cuenta/sitios/${current.siteId}/preview`} target="_blank">Abrir preview protegida</Link>
        ) : null}
        {current.linkedConversationId ? (
          <Link className="admin-button secondary" href={`/nexi-interno/soporte/${current.linkedConversationId}`}>Conversación vinculada</Link>
        ) : null}
      </div>
      {operational ? (
        <section className="admin-section">
          <div className="section-heading"><div><h2>Operación</h2><p>Concurrencia controlada por versión {current.version}.</p></div></div>
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="case_operations" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="version" value={current.version} />
            <input type="hidden" name="note_idempotency_key" value={randomUUID()} />
            <div className="form-grid">
              <label><span>Prioridad</span><select name="priority" defaultValue={current.priority}>
                <option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select></label>
              <label><span>Responsable</span><select name="assigned_admin_user_id" defaultValue="">
                <option value="">Sin asignar</option>
                {options.admins.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>Nota interna opcional</span><input name="internal_note" maxLength={2000} /></label>
            </div>
            <OperationSubmit className="admin-button">Guardar operación</OperationSubmit>
          </form>
          <div className="admin-action-grid">
            {["pending_review","waiting_information"].includes(current.status) ? (
              <StateForm caseId={current.id} version={current.version} target="preparing" label="Iniciar preparación" />
            ) : null}
            {current.status === "paused" && current.previousStatus ? (
              <StateForm caseId={current.id} version={current.version} target={current.previousStatus} label="Reanudar" />
            ) : current.status !== "paused" ? (
              <StateForm caseId={current.id} version={current.version} target="paused" label="Pausar" reason />
            ) : null}
            <StateForm caseId={current.id} version={current.version} target="canceled" label="Cancelar caso" reason danger />
          </div>
        </section>
      ) : null}
      {operational && current.linkedConversationId ? (
        <section className="admin-section">
          <div className="section-heading"><div><h2>Solicitar información</h2><p>El mensaje queda en nexi; el outbox solo genera aviso sintético.</p></div></div>
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="request_information" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="version" value={current.version} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <label><span>Mensaje visible al cliente</span><textarea name="message" required maxLength={2000} /></label>
            <OperationSubmit className="admin-button secondary">Enviar solicitud</OperationSubmit>
          </form>
        </section>
      ) : null}
      <section className="admin-section">
        <div className="section-heading"><div><h2>Contenido y aprobación</h2><p>Las respuestas y la preview permanecen separadas de las notas internas.</p></div></div>
        <section className="admin-detail-hero">
          <div><span>Respuestas</span><strong>{current.answersRevision ? `r${current.answersRevision} · ${current.answersCompletionState}` : "Pendientes"}</strong></div>
          <div><span>Borrador</span><strong>{current.draftRevision ? `r${current.draftRevision}` : "Sin generar"}</strong></div>
          <div><span>Aprobación</span><strong>{current.approvalStatus ?? "Sin solicitar"}</strong></div>
          <div><span>Publicación</span><strong>{current.publicationId ? "Creada" : "Pendiente"}</strong></div>
        </section>
        <dl className="admin-data-list onboarding-content-summary">
          <div><dt>Plantilla objetivo</dt><dd>{current.targetTemplateVersionId}</dd></div>
          <div><dt>Revisión aprobada</dt><dd>{current.approvalStatus ? `borrador r${current.draftRevision ?? "?"}` : "Sin aprobación vigente"}</dd></div>
          <div><dt>Checksum aprobado</dt><dd>{current.approvalChecksum ? `${current.approvalChecksum.slice(0, 16)}…` : "Sin checksum vigente"}</dd></div>
          <div><dt>Empresa</dt><dd>{current.answers?.company.businessName ?? "Pendiente"}</dd></div>
          <div><dt>Mensaje principal</dt><dd>{current.answers?.company.tagline ?? "Pendiente"}</dd></div>
          <div><dt>Carta</dt><dd>{current.answers ? `${current.answers.menu.categories.length} categorías · ${current.answers.menu.items.length} productos` : "Pendiente"}</dd></div>
          <div><dt>Contacto público</dt><dd>{current.answers?.contact.publicEmail || current.answers?.contact.publicPhone || "Pendiente"}</dd></div>
          <div><dt>Multimedia declarada</dt><dd>{current.answers?.media.hero ? "Portada seleccionada" : "Sin portada seleccionada"}</dd></div>
        </dl>
        {current.answersCompletionState === "submitted" && ["internal_review","preparing"].includes(current.status) ? (
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="generate_draft" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="draft_revision" value={current.draftRevision ?? 0} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <label className="checkbox-label"><input type="checkbox" name="confirm_replace" value="true" /> Confirmo reemplazar un borrador con cambios manuales detectados.</label>
            <OperationSubmit className="admin-button" confirmMessage="¿Generar restaurant.v2 desde las respuestas vigentes?">Generar borrador determinista</OperationSubmit>
          </form>
        ) : null}
        {current.status === "internal_review" && current.draftRevision ? (
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="request_approval" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="version" value={current.version} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <OperationSubmit className="admin-button" confirmMessage="¿Enviar esta revisión concreta a aprobación?">Enviar a aprobación</OperationSubmit>
          </form>
        ) : null}
        {current.status === "waiting_client_approval" && current.approvalStatus === "approved" ? (
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="mark_ready" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="version" value={current.version} />
            <OperationSubmit className="admin-button" confirmMessage="¿Ejecutar todas las validaciones de publicación?">Marcar listo para publicar</OperationSubmit>
          </form>
        ) : null}
        {current.status === "ready_to_publish" ? (
          <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="publish" />
            <input type="hidden" name="case_id" value={current.id} />
            <input type="hidden" name="version" value={current.version} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <OperationSubmit className="admin-button" confirmMessage="¿Publicar y verificar el sitio?">Publicar mediante el servicio existente</OperationSubmit>
          </form>
        ) : null}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Checklist operativo</h2><p>El porcentaje no controla estados.</p></div></div>
        <div className="checklist-admin-list">
          {detail.checklist.map((item) => (
            <form className="admin-form-card compact" action="/api/onboarding/admin" method="post" key={item.itemKey}>
              <input type="hidden" name="action" value="checklist_update" />
              <input type="hidden" name="case_id" value={current.id} />
              <input type="hidden" name="item_key" value={item.itemKey} />
              <input type="hidden" name="item_version" value={item.version} />
              <strong>{item.displayName}{item.required ? " · obligatorio" : ""}</strong>
              <div className="form-grid">
                <label><span>Estado</span><select name="status" defaultValue={item.status}>
                  <option value="pending">Pendiente</option><option value="in_progress">En curso</option>
                  <option value="completed">Completado</option><option value="blocked">Bloqueado</option>
                  <option value="not_applicable">No aplica</option>
                </select></label>
                <label><span>Motivo de bloqueo</span><input name="blocked_reason" defaultValue={item.blockedReason ?? ""} maxLength={500} /></label>
              </div>
              <OperationSubmit className="admin-button secondary">Actualizar</OperationSubmit>
            </form>
          ))}
        </div>
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Notas internas</h2><p>Nunca se serializan al cliente.</p></div></div>
        {detail.notes.length ? <ul className="activity-list">{detail.notes.map((note) => (
          <li key={note.id}><div><strong>{note.category} · {note.authorName}</strong><span>{note.note}</span></div><time>{formatDate(note.createdAt)}</time></li>
        ))}</ul> : <p>Sin notas internas.</p>}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Historial de estados</h2></div></div>
        <ul className="activity-list">{detail.history.map((event) => (
          <li key={event.id}><div><strong>{event.fromStatus ?? "inicio"} → {event.toStatus}</strong><span>{event.actorName ?? "Sistema"}</span></div><time>{formatDate(event.createdAt)}</time></li>
        ))}</ul>
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Auditoría del caso</h2><p>Eventos inmutables asociados directamente al caso.</p></div></div>
        {detail.audit.length ? <ul className="activity-list">{detail.audit.map((event) => (
          <li key={event.id}><div><strong>{event.action}</strong><span>{event.outcome} · {event.actorName ?? "Sistema"}</span></div><time>{formatDate(event.occurredAt)}</time></li>
        ))}</ul> : <p>Sin eventos de auditoría asociados.</p>}
      </section>
    </main>
  );
}

function StateForm({
  caseId,
  version,
  target,
  label,
  reason = false,
  danger = false,
}: {
  caseId: string;
  version: number;
  target: string;
  label: string;
  reason?: boolean;
  danger?: boolean;
}) {
  return (
    <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
      <input type="hidden" name="action" value="case_transition" />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="target_status" value={target} />
      {reason ? <label><span>Motivo</span><input name="reason" required maxLength={500} /></label> : null}
      <OperationSubmit
        className={`admin-button ${danger ? "danger" : "secondary"}`}
        confirmMessage={reason ? `¿Confirmas: ${label.toLowerCase()}?` : undefined}
      >
        {label}
      </OperationSubmit>
    </form>
  );
}
