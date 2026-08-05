import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { adminConversation } from "@/src/operations/service.server";
import { formatDate, Notice, PageHeader, StatusBadge } from "../../ui";

export default async function AdminConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { conversationId } = await params;
  const [detail, query] = await Promise.all([
    adminConversation(session, conversationId),
    searchParams,
  ]);
  if (!detail) notFound();
  const { conversation, messages } = detail;
  return (
    <main className="admin-content narrow">
      <PageHeader
        eyebrow="Bandeja de soporte"
        title={conversation.subject}
        description={`Cliente: ${conversation.tenantName}`}
        action={<Link className="admin-button secondary" href="/nexi-interno/soporte">Volver</Link>}
      />
      <Notice status={query.status} error={query.error} />
      <section className="admin-section">
        <div className="section-heading">
          <div><h2>Estado operativo</h2><p>La prioridad solo puede modificarla soporte nexi.</p></div>
          <StatusBadge value={conversation.status} />
        </div>
        <form className="admin-form-card compact" action="/api/admin/operations" method="post">
          <input type="hidden" name="action" value="conversation_state" />
          <input type="hidden" name="conversation_id" value={conversation.id} />
          <div className="form-grid">
            <label><span>Estado</span><select name="conversation_status" defaultValue={conversation.status}>
              <option value="open">Abierta</option><option value="awaiting_nexi">Esperando a nexi</option>
              <option value="awaiting_client">Esperando al cliente</option><option value="closed">Cerrada</option>
            </select></label>
            <label><span>Prioridad</span><select name="priority" defaultValue={conversation.priority}>
              <option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
            </select></label>
          </div>
          <OperationSubmit className="admin-button">Actualizar y asignarme</OperationSubmit>
        </form>
      </section>
      <section className="message-thread admin-thread" aria-label="Historial de mensajes">
        {messages.map((message) => (
          <article key={message.id} className={message.senderScope === "nexi_admin" ? "from-nexi" : "from-client"}>
            <header><strong>{message.senderScope === "nexi_admin" ? "Equipo nexi" : message.senderName}</strong><time>{formatDate(message.createdAt)}</time></header>
            <p>{message.body}</p>
          </article>
        ))}
      </section>
      {conversation.status !== "closed" ? (
        <section className="admin-section">
          <form className="admin-form-card compact" action="/api/admin/operations" method="post">
            <input type="hidden" name="action" value="support_reply" />
            <input type="hidden" name="conversation_id" value={conversation.id} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <label><span>Respuesta visible para el cliente</span><textarea name="body" required maxLength={4000} /></label>
            <OperationSubmit className="admin-button" pendingLabel="Enviando…">Enviar respuesta</OperationSubmit>
          </form>
        </section>
      ) : null}
    </main>
  );
}
