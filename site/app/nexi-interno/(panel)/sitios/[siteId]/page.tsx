import { notFound } from "next/navigation";
import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  adminContentDraftState,
  adminTemplateAssignment,
  adminTemplateOptions,
} from "@/src/content/service.server";
import {
  rendererIsPreviewOnly,
  templateSelectionIsAllowed,
} from "@/src/content/template-capabilities";
import { randomUUID } from "node:crypto";
import {
  adminSite,
  adminSiteActivity,
  adminSiteDomains,
} from "@/src/operations/service.server";
import { actionLabel, formatDate, Notice, PageHeader, StatusBadge } from "../../ui";

export default async function AdminSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { siteId } = await params;
  const [site, domains, activity, templateOptions, assignment, contentDraft, query] = await Promise.all([
    adminSite(session, siteId),
    adminSiteDomains(session, siteId),
    adminSiteActivity(session, siteId),
    adminTemplateOptions(session),
    adminTemplateAssignment(session, siteId),
    adminContentDraftState(session, siteId),
    searchParams,
  ]);
  if (!site) notFound();
  const editable = !["archived", "deletion_requested"].includes(site.status);
  const compatibleTemplateOptions = contentDraft && assignment
    ? templateOptions.filter((option) =>
        option.schemaKey === assignment.schemaKey &&
        assignment.schemaVersion >= option.minimumSchemaVersion &&
        assignment.schemaVersion <= option.maximumSchemaVersion,
      )
    : templateOptions;
  const assignableTemplateOptions = compatibleTemplateOptions.filter(
    templateSelectionIsAllowed,
  );
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Sitios"
        title={site.displayName}
        description={`Asignado a ${site.tenantName}. El tenant no puede reasignarse desde este panel.`}
        action={<Link className="admin-button secondary" href="/nexi-interno/sitios">Volver</Link>}
      />
      <Notice status={query.status} error={query.error} />
      <div className="content-editor-actions">
        <Link className="admin-button secondary" href={`/nexi-interno/sitios/${siteId}/multimedia`}>
          Biblioteca multimedia
        </Link>
      </div>
      <section className="admin-detail-hero">
        <div><span>Estado</span><StatusBadge value={site.status} /></div>
        <div><span>Dirección principal</span><strong>{site.hostname ?? "Pendiente"}</strong></div>
        <div><span>Actualizado</span><strong>{formatDate(site.updatedAt)}</strong></div>
      </section>
      <section className="admin-section">
        <div className="section-heading">
          <div>
            <h2>Plantilla y contenido</h2>
            <p>Solo nexi asigna la plantilla. Inicializar crea un borrador, nunca una publicación.</p>
          </div>
        </div>
        {assignment ? (
          <div className="admin-detail-hero">
            <div><span>Plantilla</span><strong>{assignment.templateName}</strong></div>
            <div><span>Versión</span><strong>{assignment.templateVersion}</strong></div>
            <div><span>Contenido</span><strong>{contentDraft ? `Borrador r${contentDraft.revision}` : "Sin inicializar"}</strong></div>
          </div>
        ) : null}
        {assignableTemplateOptions.length > 0 && site.status !== "archived" ? (
          <form className="admin-form-card compact" action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="template_assign" />
            <input type="hidden" name="site_id" value={site.id} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            {assignment ? (
              <input type="hidden" name="assignment_version" value={assignment.version} />
            ) : null}
            <div className="form-grid">
              <label>
                <span>Versión disponible</span>
                <select
                  name="template_version_id"
                  defaultValue={assignment?.templateVersionId ?? assignableTemplateOptions[0].id}
                >
                  {assignableTemplateOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.displayName} · versión {option.version}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <OperationSubmit
              className="admin-button"
              confirmMessage="¿Confirmas la asignación de esta versión de plantilla?"
            >
              {assignment ? "Actualizar versión" : "Asignar plantilla"}
            </OperationSubmit>
          </form>
        ) : null}
        {contentDraft && compatibleTemplateOptions.length > 0 ? (
          <div className="content-editor-actions">
            {compatibleTemplateOptions.map((option) => (
              <div key={option.id}>
                <Link
                  className="admin-button secondary"
                  href={`/nexi-interno/sitios/${siteId}/plantillas/${option.id}/preview`}
                  target="_blank"
                >
                  Previsualizar {option.displayName}
                </Link>
                {rendererIsPreviewOnly(option.rendererKey) ? (
                  <small>Vista previa disponible · no seleccionable</small>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {assignment && !contentDraft && ["preparing", "active"].includes(site.status) ? (
          <form className="admin-form-card compact" action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="content_initialize" />
            <input type="hidden" name="site_id" value={site.id} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <p>La inicialización utilizará el nombre del sitio y dejará vacíos los datos comerciales no confirmados.</p>
            <OperationSubmit
              className="admin-button secondary"
              confirmMessage="¿Inicializar el primer borrador estructurado?"
            >
              Inicializar contenido
            </OperationSubmit>
          </form>
        ) : null}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Datos operativos</h2><p>No incluye editor ni contenido.</p></div></div>
        {editable ? (
          <form className="admin-form-card compact" action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="site_update" />
            <input type="hidden" name="site_id" value={site.id} />
            <input type="hidden" name="version" value={site.version} />
            <div className="form-grid">
              <label><span>Nombre visible</span><input name="display_name" defaultValue={site.displayName} required maxLength={120} /></label>
              <label><span>Slug interno</span><input name="slug" defaultValue={site.slug} required pattern="[a-z0-9-]+" /></label>
              <label>
                <span>Estado</span>
                <select name="site_status" defaultValue={site.status}>
                  <option value="preparing">En preparación</option>
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </label>
            </div>
            <OperationSubmit className="admin-button">Guardar cambios</OperationSubmit>
          </form>
        ) : (
          <p className="admin-notice local-only">El estado actual solo puede cambiar mediante el flujo controlado de eliminación.</p>
        )}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Registrar dominio</h2><p>No se ejecutan DNS, certificados ni compras automáticas.</p></div></div>
        {site.status !== "archived" ? (
          <form className="admin-form-card compact" action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="domain_assign" />
            <input type="hidden" name="site_id" value={site.id} />
            <div className="form-grid">
              <label>
                <span>Tipo</span>
                <select name="domain_type" defaultValue="nexi_subdomain">
                  <option value="nexi_subdomain">Subdominio nexi</option>
                  <option value="custom_domain">Dominio propio</option>
                </select>
              </label>
              <label><span>Hostname</span><input name="hostname" required placeholder="empresa.nexi.cl" /></label>
            </div>
            <OperationSubmit className="admin-button" confirmMessage="¿Confirmas el registro manual de este dominio?">
              Registrar como principal
            </OperationSubmit>
          </form>
        ) : null}
        {domains.length > 0 ? (
          <div className="domain-admin-list">
            {domains.map((domain) => (
              <form key={domain.id} className="admin-form-card compact" action="/api/admin/operations" method="post">
                <input type="hidden" name="action" value="domain_update" />
                <input type="hidden" name="domain_id" value={domain.id} />
                <input type="hidden" name="version" value={domain.version} />
                <strong>{domain.hostname}</strong>
                <div className="form-grid">
                  <label><span>Estado</span><select name="domain_status" defaultValue={domain.status}>
                    <option value="pending">Pendiente</option><option value="active">Activo</option>
                    <option value="error">Error</option><option value="disabled">Desactivado</option>
                  </select></label>
                  <label><span>Verificación</span><select name="verification_status" defaultValue={domain.verificationStatus}>
                    <option value="unverified">No verificado</option><option value="pending">Pendiente</option>
                    <option value="verified">Verificado</option><option value="failed">Fallida</option>
                  </select></label>
                  <label><span>Uso</span><select name="is_primary" defaultValue={String(domain.isPrimary)}>
                    <option value="true">Principal</option><option value="false">Secundario</option>
                  </select></label>
                </div>
                <OperationSubmit className="admin-button secondary">Actualizar dominio</OperationSubmit>
              </form>
            ))}
          </div>
        ) : null}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Actividad</h2><p>Eventos auditables asociados directamente al sitio.</p></div></div>
        {activity.length === 0 ? <p>Sin actividad registrada.</p> : (
          <ul className="activity-list">
            {activity.map((event) => (
              <li key={event.id}><div><strong>{actionLabel(event.action)}</strong><span>{event.outcome}</span></div><time>{formatDate(event.occurredAt)}</time></li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
