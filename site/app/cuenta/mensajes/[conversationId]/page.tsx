import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientConversation } from "@/src/operations/service.server";
import {
  ClientNotice,
  ClientPageHeader,
  ClientStatus,
  formatClientDate,
} from "../../ui";

export const dynamic = "force-dynamic";

export default async function ClientConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const { conversationId } = await params;
  const [detail, query] = await Promise.all([
    clientConversation(session, conversationId),
    searchParams,
  ]);
  if (!detail) notFound();
  const { conversation, messages } = detail;
  return (
    <>
      <ClientPageHeader
        eyebrow="Mensajes"
        title={conversation.subject}
        description="Historial completo de esta conversación."
        action={<Link href="/cuenta/mensajes">Volver a Mensajes</Link>}
      />
      <ClientNotice status={query.status} error={query.error} />
      <div className="conversation-heading">
        <ClientStatus value={conversation.status} />
        <span>Última actividad: {formatClientDate(conversation.lastMessageAt)}</span>
      </div>
      <section className="message-thread" aria-label="Historial de mensajes">
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.senderScope === "client_admin"
                ? "from-client"
                : "from-nexi"
            }
          >
            <header>
              <strong>
                {message.senderScope === "nexi_admin"
                  ? "Equipo nexi"
                  : message.senderName}
              </strong>
              <time>{formatClientDate(message.createdAt)}</time>
            </header>
            <p>{message.body}</p>
          </article>
        ))}
      </section>
      {conversation.status !== "closed" ? (
        <section className="client-profile-form">
          <form action="/api/client/operations" method="post">
            <input type="hidden" name="action" value="message_reply" />
            <input
              type="hidden"
              name="conversation_id"
              value={conversation.id}
            />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <div className="client-form-grid">
              <label className="client-form-wide">
                Respuesta
                <textarea name="body" required maxLength={4000} />
              </label>
            </div>
            <OperationSubmit className="client-button" pendingLabel="Enviando…">
              Enviar respuesta
            </OperationSubmit>
          </form>
        </section>
      ) : null}
      <form
        action="/api/client/operations"
        method="post"
        className="conversation-state-form"
      >
        <input type="hidden" name="action" value="conversation_status" />
        <input
          type="hidden"
          name="conversation_id"
          value={conversation.id}
        />
        <input
          type="hidden"
          name="target_status"
          value={conversation.status === "closed" ? "open" : "closed"}
        />
        <OperationSubmit
          className="client-button secondary"
          confirmMessage={
            conversation.status === "closed"
              ? undefined
              : "¿Confirmas que deseas cerrar esta conversación?"
          }
        >
          {conversation.status === "closed"
            ? "Reabrir conversación"
            : "Cerrar conversación"}
        </OperationSubmit>
      </form>
    </>
  );
}
