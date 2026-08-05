import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientContentWorkspace } from "@/src/content/service.server";
import { clientSite } from "@/src/operations/service.server";
import {
  ClientNotice,
  ClientPageHeader,
  ClientStatus,
  formatClientDate,
} from "../../ui";
import { RestaurantEditor } from "./restaurant-editor";
import { RestaurantV2Editor } from "./restaurant-v2-editor";
import { listMediaLibrary } from "@/src/media/service.server";
import {
  RESTAURANT_V2_SCHEMA_KEY,
  type RestaurantContent,
  type RestaurantContentV2,
} from "@/src/content/types";

export const dynamic = "force-dynamic";

export default async function ClientSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ status?: string; error?: string; field?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const { siteId } = await params;
  const [site, contentWorkspace, query] = await Promise.all([
    clientSite(session, siteId),
    clientContentWorkspace(session, siteId),
    searchParams,
  ]);
  if (!site) notFound();
  const activeDeletion =
    site.deletionStatus === "pending" || site.deletionStatus === "approved";
  const activeDomain =
    site.domainRequestStatus &&
    !["active", "rejected", "canceled", "failed"].includes(
      site.domainRequestStatus,
    );
  const canOperate = site.status !== "archived";
  const mediaLibrary = contentWorkspace?.draft?.schemaKey === RESTAURANT_V2_SCHEMA_KEY
    ? await listMediaLibrary(session, { siteId, pageSize: 48 })
    : null;

  return (
    <>
      <ClientPageHeader
        eyebrow="Mis sitios"
        title={site.displayName}
        description="Panel protegido del sitio. Las acciones dependen del estado y del plan de tu empresa."
        action={<Link href="/cuenta/sitios">Volver a Mis sitios</Link>}
      />
      <ClientNotice status={query.status} error={query.error} field={query.field} />
      <section className="client-site-summary" aria-label="Resumen del sitio">
        <div><span>Estado</span><ClientStatus value={site.status} /></div>
        <div><span>Dirección</span><strong>{site.hostname ?? "Pendiente de asignación"}</strong></div>
        <div><span>Creado</span><strong>{formatClientDate(site.createdAt)}</strong></div>
        <div><span>Actualizado</span><strong>{formatClientDate(site.updatedAt)}</strong></div>
      </section>
      {contentWorkspace?.draft ? (
        <div className="content-editor-actions">
          <Link className="client-button secondary" href={`/cuenta/sitios/${siteId}/multimedia`}>
            Biblioteca multimedia
          </Link>
          <Link className="client-button secondary" href={`/cuenta/sitios/${siteId}/plantillas`}>
            Elegir plantilla
          </Link>
          {contentWorkspace.draft.schemaKey === "restaurant.v1" ? (
            <form action="/api/client/operations" method="post">
              <input type="hidden" name="action" value="restaurant_v2_migrate" />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="revision" value={contentWorkspace.draft.revision} />
              <input type="hidden" name="idempotency_key" value={randomUUID()} />
              <OperationSubmit
                className="client-button"
                confirmMessage="¿Preparar este borrador para usar la biblioteca multimedia? La publicación actual se conservará."
              >
                Activar multimedia en el borrador
              </OperationSubmit>
            </form>
          ) : null}
        </div>
      ) : null}
      {!contentWorkspace?.assignment ? (
        <section className="client-editor-note">
          <h2>Contenido del sitio</h2>
          <p>El equipo nexi todavía no ha asignado una plantilla a este sitio.</p>
        </section>
      ) : !contentWorkspace.draft ? (
        <section className="client-editor-note">
          <h2>{contentWorkspace.assignment.templateName}</h2>
          <p>La plantilla está asignada. El equipo nexi debe inicializar el contenido antes de editar.</p>
        </section>
      ) : (
        <>
          {contentWorkspace.draft.schemaKey === RESTAURANT_V2_SCHEMA_KEY ? (
            <RestaurantV2Editor
              siteId={site.id}
              revision={contentWorkspace.draft.revision}
              initialContent={contentWorkspace.draft.content as RestaurantContentV2}
              assets={mediaLibrary?.assets ?? []}
            />
          ) : (
            <RestaurantEditor
              siteId={site.id}
              revision={contentWorkspace.draft.revision}
              initialContent={contentWorkspace.draft.content as RestaurantContent}
            />
          )}
          <section className="client-profile-form content-publication-panel">
            <header>
              <h2>Publicación</h2>
              <p>
                Publicar crea una versión inmutable. Guardar el borrador no cambia el sitio público.
              </p>
            </header>
            {site.status === "active" ? (
              <form action="/api/client/operations" method="post">
                <input type="hidden" name="action" value="content_publish" />
                <input type="hidden" name="site_id" value={site.id} />
                <input type="hidden" name="revision" value={contentWorkspace.draft.revision} />
                <input type="hidden" name="idempotency_key" value={randomUUID()} />
                <OperationSubmit
                  className="client-button"
                  pendingLabel="Publicando…"
                  confirmMessage="¿Confirmas la publicación de este borrador?"
                >
                  {`Publicar revisión ${contentWorkspace.draft.revision}`}
                </OperationSubmit>
              </form>
            ) : (
              <p className="client-support-note">
                El sitio debe estar activo para publicar. Puedes continuar trabajando en el borrador.
              </p>
            )}
          </section>
          <section className="client-profile-form content-history">
            <header>
              <h2>Historial de publicaciones</h2>
              <p>Las versiones anteriores se conservan y no pueden eliminarse desde este panel.</p>
            </header>
            {contentWorkspace.publications.length === 0 ? (
              <p className="client-support-note">Todavía no existen publicaciones.</p>
            ) : (
              <ol>
                {contentWorkspace.publications.map((publication) => (
                  <li key={publication.id}>
                    <div>
                      <strong>Publicación {publication.publicationNumber}</strong>
                      {publication.isCurrent ? <span className="content-current">Actual</span> : null}
                      <small>
                        {formatClientDate(publication.publishedAt)} · {publication.publishedByName} ·{" "}
                        {publication.templateName} v{publication.templateVersion}
                      </small>
                    </div>
                    {!publication.isCurrent && site.status === "active" ? (
                      <form action="/api/client/operations" method="post">
                        <input type="hidden" name="action" value="content_restore" />
                        <input type="hidden" name="site_id" value={site.id} />
                        <input type="hidden" name="publication_id" value={publication.id} />
                        <input type="hidden" name="idempotency_key" value={randomUUID()} />
                        <OperationSubmit
                          className="client-button secondary"
                          pendingLabel="Restaurando…"
                          confirmMessage={`¿Restaurar la publicación ${publication.publicationNumber}? Se creará una nueva versión.`}
                        >
                          Restaurar
                        </OperationSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      <div className="client-operation-grid">
        <section className="client-profile-form">
          <header>
            <h2>Solicitar eliminación</h2>
            <p>La solicitud no borra el sitio. nexi la revisará y conservará todos los datos.</p>
          </header>
          {activeDeletion && site.deletionRequestId ? (
            <>
              <p className="client-support-note">
                Estado actual: <ClientStatus value={site.deletionStatus!} />
              </p>
              <form action="/api/client/operations" method="post">
                <input type="hidden" name="action" value="deletion_cancel" />
                <input type="hidden" name="request_id" value={site.deletionRequestId} />
                <OperationSubmit
                  className="client-button secondary"
                  confirmMessage="¿Confirmas que deseas cancelar esta solicitud?"
                >
                  Cancelar solicitud
                </OperationSubmit>
              </form>
            </>
          ) : canOperate ? (
            <form action="/api/client/operations" method="post">
              <input type="hidden" name="action" value="deletion_request" />
              <input type="hidden" name="site_id" value={site.id} />
              <input type="hidden" name="idempotency_key" value={randomUUID()} />
              <div className="client-form-grid">
                <label className="client-form-wide">
                  Motivo
                  <textarea name="reason" required minLength={5} maxLength={500} />
                </label>
              </div>
              <OperationSubmit
                className="client-button danger"
                pendingLabel="Enviando…"
                confirmMessage="¿Confirmas que deseas solicitar la eliminación de este sitio?"
              >
                Solicitar eliminación
              </OperationSubmit>
            </form>
          ) : (
            <p className="client-support-note">Este sitio ya está archivado.</p>
          )}
        </section>
        <section className="client-profile-form">
          <header>
            <h2>Solicitar dominio propio</h2>
            <p>nexi realizará la gestión técnica y registrará aquí el avance.</p>
          </header>
          {activeDomain ? (
            <p className="client-support-note">
              Estado actual: <ClientStatus value={site.domainRequestStatus!} />
            </p>
          ) : !site.canRequestDomain ? (
            <p className="client-support-note">
              Esta opción pertenece a un plan con dominio propio.{" "}
              <Link href="/cuenta/mensajes">Consulta al equipo nexi por Mensajes.</Link>
            </p>
          ) : canOperate ? (
            <form action="/api/client/operations" method="post">
              <input type="hidden" name="action" value="domain_request" />
              <input type="hidden" name="site_id" value={site.id} />
              <input type="hidden" name="idempotency_key" value={randomUUID()} />
              <div className="client-form-grid">
                <label>
                  Necesidad
                  <select name="request_type" required defaultValue="advice_required">
                    <option value="connect_existing">Ya tengo un dominio</option>
                    <option value="register_new">Necesito que nexi gestione uno</option>
                    <option value="advice_required">Necesito orientación</option>
                  </select>
                </label>
                <label>
                  Dominio deseado
                  <input name="desired_domain" maxLength={253} placeholder="miempresa.cl" />
                </label>
                <label className="client-form-wide">
                  Alternativas
                  <input name="alternatives" maxLength={500} />
                </label>
                <label className="client-form-wide">
                  Comentarios
                  <textarea name="notes" maxLength={1000} />
                </label>
              </div>
              <OperationSubmit className="client-button" pendingLabel="Enviando…">
                Enviar solicitud
              </OperationSubmit>
            </form>
          ) : (
            <p className="client-support-note">No hay acciones disponibles para un sitio archivado.</p>
          )}
        </section>
      </div>
    </>
  );
}
