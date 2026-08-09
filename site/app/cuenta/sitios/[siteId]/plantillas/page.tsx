import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  clientCompatibleTemplates,
  clientContentWorkspace,
} from "@/src/content/service.server";
import { templateSelectionIsAllowed } from "@/src/content/template-capabilities";
import { ClientNotice, ClientPageHeader } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function TemplateCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const { siteId } = await params;
  const [catalog, workspace, query] = await Promise.all([
    clientCompatibleTemplates(session, siteId),
    clientContentWorkspace(session, siteId),
    searchParams,
  ]);
  if (!catalog || !workspace?.assignment) notFound();
  const assignment = workspace.assignment;
  return (
    <>
      <ClientPageHeader
        eyebrow="Mis sitios"
        title="Plantillas"
        description="La previsualización y la selección no cambian la publicación actual."
        action={<Link href={`/cuenta/sitios/${siteId}`}>Volver al sitio</Link>}
      />
      <ClientNotice status={query.status} error={query.error} />
      <section className="template-catalog-grid">
        {catalog.options.map((option) => {
          const selected = option.id === catalog.currentTemplateVersionId;
          const selectable = templateSelectionIsAllowed(option);
          return (
            <article className="client-profile-form" key={option.id}>
              <div className={`template-preview-art ${option.previewKey ?? ""}`} aria-hidden="true" />
              <h2>{option.displayName}</h2>
              <p>{option.description}</p>
              {selected ? <strong>Plantilla seleccionada</strong> : null}
              <div className="content-editor-actions">
                <Link
                  className="client-button secondary"
                  href={`/cuenta/sitios/${siteId}/plantillas/${option.id}/preview`}
                  target="_blank"
                >
                  Previsualizar
                </Link>
                {!selected && selectable ? (
                  <form action="/api/client/operations" method="post">
                    <input type="hidden" name="action" value="template_change" />
                    <input type="hidden" name="site_id" value={siteId} />
                    <input type="hidden" name="template_version_id" value={option.id} />
                    <input type="hidden" name="assignment_version" value={assignment.version} />
                    <input type="hidden" name="idempotency_key" value={randomUUID()} />
                    <OperationSubmit
                      className="client-button"
                      confirmMessage={`¿Seleccionar ${option.displayName}? El sitio público no cambiará hasta publicar.`}
                    >
                      Seleccionar
                    </OperationSubmit>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
