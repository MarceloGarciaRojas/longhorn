import { randomUUID } from "node:crypto";
import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  clientConversations,
  clientSites,
} from "@/src/operations/service.server";
import {
  ClientNotice,
  ClientPageHeader,
  ClientStatus,
  formatClientDate,
} from "../ui";

export const dynamic = "force-dynamic";

export default async function ClientMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const [conversations, sites, query] = await Promise.all([
    clientConversations(session),
    clientSites(session),
    searchParams,
  ]);
  return (
    <>
      <ClientPageHeader
        eyebrow="Soporte nexi"
        title="Mensajes"
        description="Las conversaciones y sus respuestas permanecen dentro de nexi."
      />
      <ClientNotice status={query.status} error={query.error} />
      <section className="client-profile-form">
        <header>
          <h2>Nueva conversación</h2>
          <p>No incluyas contraseñas, tarjetas ni credenciales técnicas.</p>
        </header>
        <form action="/api/client/operations" method="post">
          <input type="hidden" name="action" value="conversation_create" />
          <input type="hidden" name="idempotency_key" value={randomUUID()} />
          <input
            type="hidden"
            name="message_idempotency_key"
            value={randomUUID()}
          />
          <div className="client-form-grid">
            <label>
              Categoría
              <select name="category" defaultValue="general">
                <option value="general">Soporte general</option>
                <option value="site">Mi sitio</option>
                <option value="domain">Dominio</option>
                <option value="deletion">Eliminación</option>
                <option value="plan">Plan</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label>
              Sitio relacionado (opcional)
              <select name="site_id" defaultValue="">
                <option value="">Sin sitio específico</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="client-form-wide">
              Asunto
              <input name="subject" required minLength={3} maxLength={160} />
            </label>
            <label className="client-form-wide">
              Mensaje
              <textarea name="body" required maxLength={4000} />
            </label>
          </div>
          <OperationSubmit className="client-button" pendingLabel="Enviando…">
            Crear conversación
          </OperationSubmit>
        </form>
      </section>
      <section className="client-conversation-list" aria-label="Conversaciones">
        <h2>Mis conversaciones</h2>
        {conversations.length === 0 ? (
          <p className="client-support-note">Aún no tienes conversaciones.</p>
        ) : (
          conversations.map((conversation) => (
            <Link
              href={`/cuenta/mensajes/${conversation.id}`}
              key={conversation.id}
            >
              <div>
                <strong>{conversation.subject}</strong>
                <span>{formatClientDate(conversation.lastMessageAt)}</span>
              </div>
              <div>
                {conversation.unreadCount > 0 ? (
                  <b className="nav-count">{conversation.unreadCount}</b>
                ) : null}
                <ClientStatus value={conversation.status} />
              </div>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
