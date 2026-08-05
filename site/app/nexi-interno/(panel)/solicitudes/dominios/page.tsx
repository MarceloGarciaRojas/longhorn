import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { adminDomainRequests } from "@/src/operations/service.server";
import { formatDate, Notice, PageHeader, StatusBadge } from "../../ui";

const requestStates = [
  "submitted", "reviewing", "awaiting_client", "registering", "pending_dns",
  "verifying", "active", "rejected", "canceled", "failed",
] as const;

export default async function AdminDomainRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; tenant?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const [requests, query] = await Promise.all([
    adminDomainRequests(session),
    searchParams,
  ]);
  const statusFilter = query.status === "updated" ? "" : query.status;
  const visible = requests.filter(
    (request) =>
      (!statusFilter || request.status === statusFilter) &&
      (!query.tenant ||
        request.tenantName?.toLowerCase().includes(query.tenant.toLowerCase())),
  );
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Solicitudes"
        title="Dominios propios"
        description="Seguimiento manual sin integración DNS, registrador ni certificados."
      />
      <Notice status={query.status === "updated" ? "updated" : undefined} error={query.error} />
      <form className="filter-bar" method="get">
        <label><span>Estado</span><select name="status" defaultValue={statusFilter}>
          <option value="">Todos</option>
          {requestStates.map((state) => <option value={state} key={state}>{state}</option>)}
        </select></label>
        <label><span>Cliente</span><input name="tenant" defaultValue={query.tenant} /></label>
        <button className="admin-button secondary" type="submit">Filtrar</button>
      </form>
      <section className="request-admin-list">
        {visible.map((request) => (
          <article className="admin-section" key={request.id}>
            <div className="section-heading">
              <div><h2>{request.siteName}</h2><p>{request.tenantName} · {formatDate(request.createdAt)}</p></div>
              <StatusBadge value={request.status} />
            </div>
            <dl className="request-summary">
              <div><dt>Tipo</dt><dd>{request.requestType}</dd></div>
              <div><dt>Dominio deseado</dt><dd>{request.desiredDomain ?? "No informado"}</dd></div>
              <div><dt>Alternativas</dt><dd>{request.alternatives ?? "No informadas"}</dd></div>
              <div><dt>Comentario del cliente</dt><dd>{request.clientNotes ?? "Sin comentario"}</dd></div>
              {request.internalNote ? <div><dt>Nota interna</dt><dd>{request.internalNote}</dd></div> : null}
            </dl>
            <form className="inline-confirmation" action="/api/admin/operations" method="post">
              <input type="hidden" name="action" value="domain_request_update" />
              <input type="hidden" name="request_id" value={request.id} />
              <label><span>Estado</span><select name="request_status" defaultValue={request.status}>
                {requestStates.map((state) => <option value={state} key={state}>{state}</option>)}
              </select></label>
              <label><span>Nota interna (no visible para el cliente)</span><textarea name="internal_note" defaultValue={request.internalNote ?? ""} maxLength={1000} /></label>
              <div className="admin-inline-actions">
                <OperationSubmit className="admin-button">Actualizar solicitud</OperationSubmit>
                <Link className="admin-button secondary" href={`/nexi-interno/sitios/${request.siteId}`}>Registrar dominio</Link>
              </div>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
