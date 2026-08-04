import { requireAuthSession } from "@/src/auth/session.server";
import { auditFor, tenantsFor } from "@/src/admin/admin-service.server";
import { pageNumber } from "@/src/admin/validation";
import {
  actionLabel,
  EmptyState,
  formatDate,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../ui";

const actions = [
  "tenant_created",
  "tenant_updated",
  "tenant_activated",
  "tenant_suspended",
  "tenant_reactivated",
  "invitation_created",
  "invitation_resent",
  "invitation_failed",
  "invitation_revoked",
  "invitation_accepted",
  "membership_created",
  "membership_disabled",
  "membership_reactivated",
  "admin_access_denied",
  "client_panel_accessed",
  "personal_profile_updated",
  "tenant_profile_updated",
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    tenant?: string;
    actor?: string;
    from?: string;
    to?: string;
    outcome?: string;
    page?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const query = await searchParams;
  const page = pageNumber(query.page || null);
  const [result, tenants] = await Promise.all([
    auditFor(session, {
      action: query.action || null,
      tenantId: query.tenant || null,
      actorSearch: query.actor || null,
      from: query.from || null,
      to: query.to || null,
      outcome: query.outcome || null,
      page,
    }),
    tenantsFor(session, {
      search: null,
      status: null,
      sort: "name_asc",
      page: 1,
    }),
  ]);
  const preserved = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== "page" && value) preserved.set(key, value);
  }
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Historial protegido"
        title="Auditoría"
        description="Registro de solo lectura de las acciones administrativas."
      />
      <form className="filter-bar audit-filters" method="get">
        <label><span>Acción</span><select name="action" defaultValue={query.action || ""}>
          <option value="">Todas</option>
          {actions.map((action) => <option value={action} key={action}>{actionLabel(action)}</option>)}
        </select></label>
        <label><span>Cliente</span><select name="tenant" defaultValue={query.tenant || ""}>
          <option value="">Todos</option>
          {tenants.items.map((tenant) => <option value={tenant.tenantId} key={tenant.tenantId}>{tenant.tenantName}</option>)}
        </select></label>
        <label><span>Operador</span><input name="actor" defaultValue={query.actor} placeholder="Nombre o correo" maxLength={80} /></label>
        <label><span>Desde</span><input type="date" name="from" defaultValue={query.from} /></label>
        <label><span>Hasta</span><input type="date" name="to" defaultValue={query.to} /></label>
        <label><span>Resultado</span><select name="outcome" defaultValue={query.outcome || ""}>
          <option value="">Todos</option>
          <option value="succeeded">Correcto</option>
          <option value="failed">Fallido</option>
          <option value="blocked">Bloqueado</option>
        </select></label>
        <button className="admin-button secondary" type="submit">Aplicar</button>
      </form>
      {result.items.length === 0 ? (
        <EmptyState title="No hay eventos para mostrar" copy="Ajusta los filtros o realiza una operación desde el panel." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Acción</th><th>Cliente</th><th>Operador</th><th>Resultado</th><th>Detalle</th></tr></thead>
              <tbody>
                {result.items.map((event) => (
                  <tr key={event.auditId}>
                    <td>{formatDate(event.occurredAt)}</td>
                    <td>{actionLabel(event.action)}</td>
                    <td>{event.tenantName || "Plataforma"}</td>
                    <td>{event.actorName || "Sistema"}{event.actorEmail ? <><br /><small>{event.actorEmail}</small></> : null}</td>
                    <td><StatusBadge value={event.outcome} /></td>
                    <td>
                      <details className="audit-detail">
                        <summary>Ver</summary>
                        <dl>
                          <div><dt>Código de seguimiento</dt><dd>{event.correlationId}</dd></div>
                          {event.reason ? <div><dt>Motivo</dt><dd>{event.reason}</dd></div> : null}
                          {event.previousState ? <div><dt>Antes</dt><dd>{JSON.stringify(event.previousState)}</dd></div> : null}
                          {event.newState ? <div><dt>Después</dt><dd>{JSON.stringify(event.newState)}</dd></div> : null}
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/nexi-interno/auditoria"
            query={preserved.toString()}
          />
        </>
      )}
    </main>
  );
}
