import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { adminDeletionRequests } from "@/src/operations/service.server";
import { formatDate, Notice, PageHeader, StatusBadge } from "../../ui";

export default async function AdminDeletionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    error?: string;
    tenant?: string;
    site?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const [requests, query] = await Promise.all([
    adminDeletionRequests(session),
    searchParams,
  ]);
  const visible = requests.filter(
    (request) =>
      (!query.status || request.status === query.status) &&
      (!query.tenant ||
        request.tenantName?.toLowerCase().includes(query.tenant.toLowerCase())) &&
      (!query.site ||
        request.siteName.toLowerCase().includes(query.site.toLowerCase())),
  );
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Solicitudes"
        title="Eliminaciones"
        description="Revisión, espera y archivado controlado. Ninguna acción elimina físicamente datos."
      />
      <Notice status={query.status === "updated" ? "updated" : undefined} error={query.error} />
      <form className="filter-bar" method="get">
        <label><span>Estado</span><select name="status" defaultValue={query.status && query.status !== "updated" ? query.status : ""}>
          <option value="">Todos</option><option value="pending">Pendiente</option>
          <option value="approved">Aprobada</option><option value="rejected">Rechazada</option>
          <option value="canceled">Cancelada</option><option value="executed">Ejecutada</option>
        </select></label>
        <label><span>Cliente</span><input name="tenant" defaultValue={query.tenant} /></label>
        <label><span>Sitio</span><input name="site" defaultValue={query.site} /></label>
        <button className="admin-button secondary" type="submit">Filtrar</button>
      </form>
      <section className="request-admin-list">
        {visible.length === 0 ? <p className="admin-empty">No hay solicitudes con estos filtros.</p> : visible.map((request) => (
          <article className="admin-section" key={request.id}>
            <div className="section-heading">
              <div><h2>{request.siteName}</h2><p>{request.tenantName} · solicitada {formatDate(request.requestedAt)}</p></div>
              <StatusBadge value={request.status} />
            </div>
            <dl className="request-summary">
              <div><dt>Motivo</dt><dd>{request.reason}</dd></div>
              <div><dt>Espera</dt><dd>{request.graceHours} horas</dd></div>
              <div><dt>Elegible desde</dt><dd>{formatDate(request.eligibleAt)}</dd></div>
              {request.reviewNote ? <div><dt>Nota interna</dt><dd>{request.reviewNote}</dd></div> : null}
            </dl>
            {request.status === "pending" || request.status === "approved" ? (
              <form className="inline-confirmation" action="/api/admin/operations" method="post">
                <input type="hidden" name="action" value="deletion_review" />
                <input type="hidden" name="request_id" value={request.id} />
                <label><span>Nota interna obligatoria</span><textarea name="review_note" required minLength={3} maxLength={1000} /></label>
                <label><span>Decisión</span><select name="target_status" defaultValue={request.status === "approved" ? "executed" : "approved"}>
                  {request.status === "pending" ? <><option value="approved">Aprobar</option><option value="rejected">Rechazar</option></> : null}
                  <option value="canceled">Cancelar administrativamente</option>
                  {request.status === "approved" ? <option value="executed">Archivar sitio</option> : null}
                </select></label>
                <OperationSubmit
                  className="admin-button danger"
                  confirmMessage="¿Confirmas esta acción sensible? Quedará registrada en auditoría."
                >
                  Aplicar decisión
                </OperationSubmit>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
