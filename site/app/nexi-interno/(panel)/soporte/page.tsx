import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { adminConversations } from "@/src/operations/service.server";
import { formatDate, Notice, PageHeader, StatusBadge } from "../ui";

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    error?: string;
    tenant?: string;
    priority?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const [conversations, query] = await Promise.all([
    adminConversations(session),
    searchParams,
  ]);
  const visible = conversations.filter(
    (conversation) =>
      (!query.status ||
        ["notifications"].includes(query.status) ||
        conversation.status === query.status) &&
      (!query.priority || conversation.priority === query.priority) &&
      (!query.tenant ||
        conversation.tenantName
          ?.toLowerCase()
          .includes(query.tenant.toLowerCase())),
  );
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Soporte interno"
        title="Bandeja de soporte"
        description="Conversaciones persistentes de todos los clientes autorizados."
      />
      <Notice status={query.status} error={query.error} />
      <form className="filter-bar" method="get">
        <label><span>Estado</span><select name="status" defaultValue={query.status && query.status !== "notifications" ? query.status : ""}>
          <option value="">Todos</option><option value="open">Abierta</option>
          <option value="awaiting_nexi">Esperando a nexi</option>
          <option value="awaiting_client">Esperando al cliente</option><option value="closed">Cerrada</option>
        </select></label>
        <label><span>Prioridad</span><select name="priority" defaultValue={query.priority}>
          <option value="">Todas</option><option value="normal">Normal</option>
          <option value="high">Alta</option><option value="urgent">Urgente</option>
        </select></label>
        <label><span>Cliente</span><input name="tenant" defaultValue={query.tenant} /></label>
        <button className="admin-button secondary" type="submit">Filtrar</button>
      </form>
      <section className="admin-section">
        <div className="section-heading">
          <div><h2>Conversaciones</h2><p>{visible.length} resultados</p></div>
          <form action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="notifications_deliver" />
            <OperationSubmit className="admin-button secondary">
              Procesar avisos sintéticos
            </OperationSubmit>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Asunto</th><th>Cliente</th><th>Estado</th><th>Prioridad</th><th>No leídos</th><th>Actividad</th></tr></thead>
            <tbody>
              {visible.map((conversation) => (
                <tr key={conversation.id}>
                  <td><Link href={`/nexi-interno/soporte/${conversation.id}`}>{conversation.subject}</Link></td>
                  <td>{conversation.tenantName}</td>
                  <td><StatusBadge value={conversation.status} /></td>
                  <td><StatusBadge value={conversation.priority} /></td>
                  <td>{conversation.unreadCount}</td>
                  <td>{formatDate(conversation.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
