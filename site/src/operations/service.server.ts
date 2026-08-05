import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { getAppConfig } from "@/src/config/app-config";
import { recordClientEvent } from "@/src/client-portal/client-repository.server";
import { withAdminOperation, withClientOperation } from "./contexts.server";
import type {
  ConversationPriority,
  ConversationRecord,
  ConversationStatus,
  DeletionRequestRecord,
  DomainRecord,
  DomainRequestRecord,
  SiteRecord,
  SiteActivityRecord,
  SupportMessageRecord,
} from "./types";
import {
  hostname,
  mapOperationError,
  OperationValidationError,
  optionalText,
  siteSlug,
  text,
  uuid,
} from "./validation";
import { canUseSyntheticNotificationAdapter } from "./notification-adapter";

function pageId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function clientAudit(
  client: PoolClient,
  session: AuthSession,
  correlationId: string,
  action:
    | "client_panel_accessed"
    | "deletion_requested"
    | "deletion_canceled"
    | "domain_requested"
    | "conversation_created"
    | "conversation_closed"
    | "conversation_reopened"
    | "support_message_sent"
    | "operation_access_denied",
  resourceType:
    | "client_route"
    | "site"
    | "deletion_request"
    | "domain_request"
    | "conversation"
    | "message",
  resourceId: string,
): Promise<void> {
  await recordClientEvent(client, {
    session,
    action,
    resourceType,
    resourceId,
    correlationId,
  });
}

async function adminAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `SELECT app_private.operation_record_admin_event(
       $1,$2,$3,$4,$5,NULL,NULL,$6::jsonb
     )`,
    [
      input.tenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

const SITE_SELECT = `SELECT
  site.id, site.tenant_id AS "tenantId", tenant.display_name AS "tenantName",
  site.display_name AS "displayName", site.slug, site.status, site.version,
  domain.hostname,
  deletion.status AS "deletionStatus", deletion.id AS "deletionRequestId",
  domain_request.status AS "domainRequestStatus",
  domain_request.id AS "domainRequestId",
  site.created_at AS "createdAt", site.updated_at AS "updatedAt"
FROM public.sites site
JOIN public.tenants tenant ON tenant.id=site.tenant_id
LEFT JOIN LATERAL (
  SELECT hostname FROM public.site_domains
  WHERE site_id=site.id AND is_primary ORDER BY created_at DESC LIMIT 1
) domain ON true
LEFT JOIN LATERAL (
  SELECT id,status FROM public.site_deletion_requests
  WHERE site_id=site.id ORDER BY created_at DESC LIMIT 1
) deletion ON true
LEFT JOIN LATERAL (
  SELECT id,status FROM public.site_domain_requests
  WHERE site_id=site.id ORDER BY created_at DESC LIMIT 1
) domain_request ON true`;

export async function clientSites(session: AuthSession): Promise<SiteRecord[]> {
  const correlationId = pageId("client-sites");
  return withClientOperation(session, correlationId, async (client) => {
    const result = await client.query<SiteRecord>(
      `${SITE_SELECT}
       WHERE site.tenant_id=app_context.current_tenant_id()
         AND site.deleted_at IS NULL ORDER BY site.created_at DESC`,
    );
    const capability = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.tenant_plan_assignments assignment
         JOIN public.plan_features feature ON feature.plan_id=assignment.plan_id
         WHERE assignment.tenant_id=app_context.current_tenant_id()
           AND assignment.status='active' AND feature.status='active'
           AND feature.feature_key='custom_domain_request'
       ) AS allowed`,
    );
    await clientAudit(
      client,
      session,
      correlationId,
      "client_panel_accessed",
      "client_route",
      "/cuenta/sitios",
    );
    return result.rows.map((row) => ({
      ...row,
      canRequestDomain: capability.rows[0]?.allowed === true,
    }));
  });
}

export async function clientSite(
  session: AuthSession,
  siteId: string,
): Promise<SiteRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  const correlationId = pageId("client-site");
  return withClientOperation(session, correlationId, async (client) => {
    const result = await client.query<SiteRecord>(
      `${SITE_SELECT}
       WHERE site.id=$1 AND site.tenant_id=app_context.current_tenant_id()
         AND site.deleted_at IS NULL`,
      [siteId],
    );
    const capability = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.tenant_plan_assignments assignment
         JOIN public.plan_features feature ON feature.plan_id=assignment.plan_id
         WHERE assignment.tenant_id=app_context.current_tenant_id()
           AND assignment.status='active' AND feature.status='active'
           AND feature.feature_key='custom_domain_request'
       ) AS allowed`,
    );
    await clientAudit(
      client,
      session,
      correlationId,
      "client_panel_accessed",
      "client_route",
      `/cuenta/sitios/${siteId}`,
    );
    return result.rows[0]
      ? {
          ...result.rows[0],
          canRequestDomain: capability.rows[0]?.allowed === true,
        }
      : null;
  });
}

export async function requestDeletion(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const reason = text(form.get("reason"), 5, 500);
  const grace = getAppConfig().siteDeletionGraceHours;
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const previous = await client.query<{ siteId: string }>(
        `SELECT site_id AS "siteId" FROM public.site_deletion_requests
         WHERE tenant_id=app_context.current_tenant_id()
           AND requested_by_user_id=app_context.current_user_id()
           AND idempotency_key=$1`,
        [idempotencyKey],
      );
      if (previous.rows[0]) return previous.rows[0].siteId;
      const active = await client.query(
        `SELECT 1 FROM public.site_deletion_requests
         WHERE site_id=$1 AND tenant_id=app_context.current_tenant_id()
           AND status IN ('pending','approved')`,
        [siteId],
      );
      if (active.rowCount) throw new OperationValidationError("duplicate");
      const site = await client.query<{ status: string }>(
        `SELECT status FROM public.sites
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()
           AND status IN ('preparing','active','suspended') FOR UPDATE`,
        [siteId],
      );
      if (!site.rows[0]) throw new OperationValidationError("not_found");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.site_deletion_requests(
           tenant_id,site_id,requested_by_user_id,reason,status,
           previous_site_status,grace_hours,eligible_at,idempotency_key
         ) VALUES (
           app_context.current_tenant_id(),$1,app_context.current_user_id(),$2,
           'pending',$3,$4,transaction_timestamp()+make_interval(hours => $4::integer),$5
         ) RETURNING id`,
        [siteId, reason, site.rows[0].status, grace, idempotencyKey],
      );
      await client.query(
        `UPDATE public.sites SET status='deletion_requested',version=version+1
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()`,
        [siteId],
      );
      await clientAudit(
        client,
        session,
        correlationId,
        "deletion_requested",
        "deletion_request",
        inserted.rows[0].id,
      );
      return siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function cancelDeletion(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const requestId = uuid(form.get("request_id"));
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        siteId: string;
        previousStatus: string;
        status: string;
      }>(
        `SELECT site_id AS "siteId",previous_site_status AS "previousStatus",status
         FROM public.site_deletion_requests
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()
           AND requested_by_user_id=app_context.current_user_id()`,
        [requestId],
      );
      if (!current.rows[0]) throw new OperationValidationError("not_found");
      const currentStatus = current.rows[0].status;
      if (currentStatus === "canceled") return current.rows[0].siteId;
      if (!["pending", "approved"].includes(currentStatus)) {
        throw new OperationValidationError("conflict");
      }
      const updated = await client.query<{
        siteId: string;
        previousStatus: string;
      }>(
        `UPDATE public.site_deletion_requests
         SET status='canceled',canceled_at=transaction_timestamp(),version=version+1
         WHERE id=$1 AND status IN ('pending','approved') AND executed_at IS NULL
         RETURNING site_id AS "siteId",previous_site_status AS "previousStatus"`,
        [requestId],
      );
      if (!updated.rows[0]) throw new OperationValidationError("conflict");
      await client.query(
        `UPDATE public.sites SET status=$2,version=version+1
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()
           AND status='deletion_requested'`,
        [updated.rows[0].siteId, updated.rows[0].previousStatus],
      );
      await clientAudit(
        client,
        session,
        correlationId,
        "deletion_canceled",
        "deletion_request",
        requestId,
      );
      return updated.rows[0].siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function requestDomain(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const requestType = String(form.get("request_type") || "");
  if (!["connect_existing", "register_new", "advice_required"].includes(requestType)) {
    throw new OperationValidationError("invalid");
  }
  const desired = optionalText(form.get("desired_domain"), 253);
  const alternatives = optionalText(form.get("alternatives"), 500);
  const notes = optionalText(form.get("notes"), 1000);
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const previous = await client.query<{ siteId: string }>(
        `SELECT site_id AS "siteId" FROM public.site_domain_requests
         WHERE tenant_id=app_context.current_tenant_id()
           AND requested_by_user_id=app_context.current_user_id()
           AND idempotency_key=$1`,
        [idempotencyKey],
      );
      if (previous.rows[0]) return previous.rows[0].siteId;
      const allowed = await client.query<{ allowed: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM public.sites site
           JOIN public.tenant_plan_assignments assignment
             ON assignment.tenant_id=site.tenant_id AND assignment.status='active'
           JOIN public.plan_features feature
             ON feature.plan_id=assignment.plan_id AND feature.status='active'
           WHERE site.id=$1 AND site.tenant_id=app_context.current_tenant_id()
             AND site.status <> 'archived'
             AND feature.feature_key='custom_domain_request'
         ) AS allowed`,
        [siteId],
      );
      if (!allowed.rows[0]?.allowed) throw new OperationValidationError("plan");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.site_domain_requests(
           tenant_id,site_id,requested_by_user_id,request_type,desired_domain,
           alternatives,client_notes,idempotency_key
         ) VALUES (
           app_context.current_tenant_id(),$1,app_context.current_user_id(),
           $2,$3,$4,$5,$6
         ) RETURNING id`,
        [siteId, requestType, desired, alternatives, notes, idempotencyKey],
      );
      await clientAudit(
        client,
        session,
        correlationId,
        "domain_requested",
        "domain_request",
        inserted.rows[0].id,
      );
      return siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

async function unreadExpression(): Promise<string> {
  return `(
    SELECT count(*)::integer FROM public.support_messages message
    WHERE message.conversation_id=conversation.id
      AND message.sender_user_id<>app_context.current_user_id()
      AND message.created_at>COALESCE(participant.last_read_at,'epoch'::timestamptz)
  )`;
}

export async function clientConversations(
  session: AuthSession,
): Promise<ConversationRecord[]> {
  const correlationId = pageId("client-support");
  return withClientOperation(session, correlationId, async (client) => {
    const unread = await unreadExpression();
    const result = await client.query<ConversationRecord>(
      `SELECT conversation.id,conversation.tenant_id AS "tenantId",
         conversation.site_id AS "siteId",conversation.subject,
         conversation.category,conversation.status,conversation.priority,
         conversation.last_message_at AS "lastMessageAt",conversation.version,
         ${unread} AS "unreadCount"
       FROM public.support_conversations conversation
       LEFT JOIN public.support_conversation_participants participant
         ON participant.conversation_id=conversation.id
        AND participant.user_id=app_context.current_user_id()
       WHERE conversation.tenant_id=app_context.current_tenant_id()
       ORDER BY conversation.last_message_at DESC`,
    );
    return result.rows;
  });
}

export async function clientConversation(
  session: AuthSession,
  conversationId: string,
): Promise<{ conversation: ConversationRecord; messages: SupportMessageRecord[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const correlationId = pageId("client-conversation");
  return withClientOperation(session, correlationId, async (client) => {
    const unread = await unreadExpression();
    const conversation = await client.query<ConversationRecord>(
      `SELECT conversation.id,conversation.tenant_id AS "tenantId",
         conversation.site_id AS "siteId",conversation.subject,
         conversation.category,conversation.status,conversation.priority,
         conversation.last_message_at AS "lastMessageAt",conversation.version,
         ${unread} AS "unreadCount"
       FROM public.support_conversations conversation
       LEFT JOIN public.support_conversation_participants participant
         ON participant.conversation_id=conversation.id
        AND participant.user_id=app_context.current_user_id()
       WHERE conversation.id=$1
         AND conversation.tenant_id=app_context.current_tenant_id()`,
      [conversationId],
    );
    if (!conversation.rows[0]) return null;
    const messages = await client.query<SupportMessageRecord>(
      `SELECT message.id,message.sender_scope AS "senderScope",
         COALESCE(account.display_name,
           CASE WHEN message.sender_scope='nexi_admin' THEN 'Equipo nexi' ELSE 'Cliente' END
         ) AS "senderName",message.body,
         message.created_at AS "createdAt"
       FROM public.support_messages message
       LEFT JOIN public.users account ON account.id=message.sender_user_id
       WHERE message.conversation_id=$1
         AND message.tenant_id=app_context.current_tenant_id()
       ORDER BY message.created_at,message.id`,
      [conversationId],
    );
    await client.query(
      `INSERT INTO public.support_conversation_participants(
         tenant_id,conversation_id,user_id,participant_scope,last_read_at
       ) VALUES (
         app_context.current_tenant_id(),$1,app_context.current_user_id(),
         'client_admin',transaction_timestamp()
       ) ON CONFLICT(conversation_id,user_id) DO UPDATE
         SET last_read_at=EXCLUDED.last_read_at`,
      [conversationId],
    );
    return { conversation: conversation.rows[0], messages: messages.rows };
  });
}

async function enqueue(
  client: PoolClient,
  tenantId: string,
  recipientUserId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await client.query(
    `SELECT app_private.operation_enqueue_notification(
       $1,$2,'new_support_message',$3::jsonb,$4
     )`,
    [
      tenantId,
      recipientUserId,
      JSON.stringify({ path: `/cuenta/mensajes/${conversationId}` }),
      `support-message:${messageId}:${recipientUserId}`,
    ],
  );
}

export async function createConversation(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const subject = text(form.get("subject"), 3, 160);
  const body = text(form.get("body"), 1, 4000);
  const category = String(form.get("category") || "");
  if (!["general", "site", "domain", "deletion", "plan", "other"].includes(category)) {
    throw new OperationValidationError("invalid");
  }
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const messageKey = uuid(form.get("message_idempotency_key"));
  const siteId = form.get("site_id") ? uuid(form.get("site_id")) : null;
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      if (siteId) {
        const site = await client.query(
          `SELECT 1 FROM public.sites WHERE id=$1
           AND tenant_id=app_context.current_tenant_id()`,
          [siteId],
        );
        if (!site.rowCount) throw new OperationValidationError("not_found");
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.support_conversations(
           tenant_id,site_id,subject,category,created_by_user_id,idempotency_key
         ) VALUES (
           app_context.current_tenant_id(),$1,$2,$3,
           app_context.current_user_id(),$4
         ) ON CONFLICT(tenant_id,created_by_user_id,idempotency_key) DO NOTHING
         RETURNING id`,
        [siteId, subject, category, idempotencyKey],
      );
      if (!created.rows[0]) {
        const previous = await client.query<{ id: string }>(
          `SELECT id FROM public.support_conversations
           WHERE tenant_id=app_context.current_tenant_id()
             AND created_by_user_id=app_context.current_user_id()
             AND idempotency_key=$1`,
          [idempotencyKey],
        );
        if (!previous.rows[0]) throw new OperationValidationError("conflict");
        return previous.rows[0].id;
      }
      const conversationId = created.rows[0].id;
      await client.query(
        `INSERT INTO public.support_conversation_participants(
           tenant_id,conversation_id,user_id,participant_scope,last_read_at
         ) VALUES (
           app_context.current_tenant_id(),$1,app_context.current_user_id(),
           'client_admin',transaction_timestamp()
         )`,
        [conversationId],
      );
      const message = await client.query<{ id: string }>(
        `INSERT INTO public.support_messages(
           tenant_id,conversation_id,sender_user_id,sender_scope,body,idempotency_key
         ) VALUES (
           app_context.current_tenant_id(),$1,app_context.current_user_id(),
           'client_admin',$2,$3
         ) RETURNING id`,
        [conversationId, body, messageKey],
      );
      const admin = await client.query<{ id: string | null }>(
        `SELECT app_private.notification_recipient_admin() AS id`,
      );
      if (admin.rows[0]?.id) {
        await enqueue(
          client,
          session.activeTenantId!,
          admin.rows[0].id,
          conversationId,
          message.rows[0].id,
        );
      }
      await clientAudit(
        client, session, correlationId, "conversation_created",
        "conversation", conversationId,
      );
      return conversationId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function clientReply(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const conversationId = uuid(form.get("conversation_id"));
  const body = text(form.get("body"), 1, 4000);
  const key = uuid(form.get("idempotency_key"));
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const conversation = await client.query<{ status: string }>(
        `SELECT status FROM public.support_conversations
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id() FOR UPDATE`,
        [conversationId],
      );
      if (!conversation.rows[0]) throw new OperationValidationError("not_found");
      if (conversation.rows[0].status === "closed") {
        throw new OperationValidationError("conflict");
      }
      const message = await client.query<{ id: string }>(
        `INSERT INTO public.support_messages(
           tenant_id,conversation_id,sender_user_id,sender_scope,body,idempotency_key
         ) VALUES (
           app_context.current_tenant_id(),$1,app_context.current_user_id(),
           'client_admin',$2,$3
         ) ON CONFLICT(conversation_id,sender_user_id,idempotency_key)
           DO NOTHING RETURNING id`,
        [conversationId, body, key],
      );
      if (!message.rows[0]) return conversationId;
      await client.query(
        `UPDATE public.support_conversations SET
           status='awaiting_nexi',last_message_at=transaction_timestamp(),
           version=version+1 WHERE id=$1`,
        [conversationId],
      );
      const admin = await client.query<{ id: string | null }>(
        `SELECT app_private.notification_recipient_admin() AS id`,
      );
      if (admin.rows[0]?.id) {
        await enqueue(
          client, session.activeTenantId!, admin.rows[0].id,
          conversationId, message.rows[0].id,
        );
      }
      await clientAudit(
        client,session,correlationId,"support_message_sent","message",
        message.rows[0].id,
      );
      return conversationId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function clientConversationStatus(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const conversationId = uuid(form.get("conversation_id"));
  const target = String(form.get("target_status") || "");
  if (!["closed", "open"].includes(target)) {
    throw new OperationValidationError("invalid");
  }
  return withClientOperation(session, correlationId, async (client) => {
    const result = await client.query(
      `UPDATE public.support_conversations SET
         status=$2,closed_at=CASE WHEN $2='closed' THEN transaction_timestamp() ELSE NULL END,
         version=version+1
       WHERE id=$1 AND tenant_id=app_context.current_tenant_id()`,
      [conversationId, target],
    );
    if (!result.rowCount) throw new OperationValidationError("not_found");
    await clientAudit(
      client,session,correlationId,
      target === "closed" ? "conversation_closed" : "conversation_reopened",
      "conversation",conversationId,
    );
    return conversationId;
  });
}

export async function clientUnreadCount(session: AuthSession): Promise<number> {
  return withClientOperation(session, pageId("client-unread"), async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM public.support_messages message
       JOIN public.support_conversations conversation
         ON conversation.id=message.conversation_id
       LEFT JOIN public.support_conversation_participants participant
         ON participant.conversation_id=conversation.id
        AND participant.user_id=app_context.current_user_id()
       WHERE message.tenant_id=app_context.current_tenant_id()
         AND message.sender_user_id<>app_context.current_user_id()
         AND message.created_at>COALESCE(participant.last_read_at,'epoch'::timestamptz)`,
    );
    return result.rows[0]?.count ?? 0;
  });
}

export async function adminSites(session: AuthSession): Promise<SiteRecord[]> {
  return withAdminOperation(session, pageId("admin-sites"), async (client) => {
    const result = await client.query<SiteRecord>(
      `${SITE_SELECT} WHERE site.deleted_at IS NULL
       ORDER BY site.created_at DESC`,
    );
    return result.rows;
  });
}

export async function adminTenantOptions(
  session: AuthSession,
): Promise<Array<{ id: string; name: string }>> {
  return withAdminOperation(session, pageId("admin-tenant-options"), async (client) => {
    const result = await client.query<{ id: string; name: string }>(
      `SELECT id,display_name AS name FROM public.tenants
       WHERE status IN ('draft','active') AND deleted_at IS NULL
       ORDER BY display_name`,
    );
    return result.rows;
  });
}

export async function adminSite(
  session: AuthSession,
  siteId: string,
): Promise<SiteRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withAdminOperation(session, pageId("admin-site"), async (client) => {
    const result = await client.query<SiteRecord>(
      `${SITE_SELECT} WHERE site.id=$1`,
      [siteId],
    );
    return result.rows[0] ?? null;
  });
}

export async function adminCreateSite(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const tenantId = uuid(form.get("tenant_id"));
  const displayName = text(form.get("display_name"), 1, 120);
  const slug = siteSlug(form.get("slug"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const tenant = await client.query(
        `SELECT 1 FROM public.tenants WHERE id=$1 AND status IN ('draft','active')
         AND deleted_at IS NULL`,
        [tenantId],
      );
      if (!tenant.rowCount) throw new OperationValidationError("not_found");
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.sites(
           tenant_id,display_name,slug,status,creation_idempotency_key
         ) VALUES($1,$2,$3,'preparing',$4)
         ON CONFLICT(creation_idempotency_key)
           WHERE creation_idempotency_key IS NOT NULL
         DO NOTHING RETURNING id`,
        [tenantId, displayName, slug, idempotencyKey],
      );
      if (!created.rows[0]) {
        const previous = await client.query<{ id: string }>(
          `SELECT id FROM public.sites WHERE creation_idempotency_key=$1`,
          [idempotencyKey],
        );
        if (!previous.rows[0]) throw new OperationValidationError("conflict");
        return previous.rows[0].id;
      }
      await adminAudit(client, {
        tenantId, action: "site_created", resourceType: "site",
        resourceId: created.rows[0].id, correlationId,
        metadata: { idempotency_key: idempotencyKey },
      });
      return created.rows[0].id;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function adminUpdateSite(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const displayName = text(form.get("display_name"), 1, 120);
  const slug = siteSlug(form.get("slug"));
  const status = String(form.get("site_status") || "");
  const version = Number(form.get("version"));
  if (!["preparing", "active", "suspended"].includes(status) ||
      !Number.isSafeInteger(version)) {
    throw new OperationValidationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const updated = await client.query<{ tenantId: string }>(
        `UPDATE public.sites SET display_name=$2,slug=$3,status=$4,
           version=version+1 WHERE id=$1 AND version=$5
             AND status NOT IN ('archived','deletion_requested')
         RETURNING tenant_id AS "tenantId"`,
        [siteId, displayName, slug, status, version],
      );
      if (!updated.rows[0]) throw new OperationValidationError("conflict");
      await adminAudit(client, {
        tenantId: updated.rows[0].tenantId, action: "site_updated",
        resourceType: "site", resourceId: siteId, correlationId,
      });
      return siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function adminAssignDomain(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const host = hostname(form.get("hostname"));
  const type = String(form.get("domain_type") || "");
  if (!["nexi_subdomain", "custom_domain"].includes(type)) {
    throw new OperationValidationError("invalid");
  }
  if (type === "nexi_subdomain" && !host.endsWith(".nexi.cl")) {
    throw new OperationValidationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const site = await client.query<{ tenantId: string }>(
        `SELECT tenant_id AS "tenantId" FROM public.sites
         WHERE id=$1 AND status<>'archived'`,
        [siteId],
      );
      if (!site.rows[0]) throw new OperationValidationError("not_found");
      const previous = await client.query<{ siteId: string; domainType: string }>(
        `SELECT site_id AS "siteId",domain_type AS "domainType"
         FROM public.site_domains WHERE hostname=$1`,
        [host],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].siteId === siteId && previous.rows[0].domainType === type) {
          return siteId;
        }
        throw new OperationValidationError("duplicate");
      }
      await client.query(
        `UPDATE public.site_domains SET is_primary=false,version=version+1
         WHERE site_id=$1 AND is_primary`,
        [siteId],
      );
      const domain = await client.query<{ id: string }>(
        `INSERT INTO public.site_domains(
           tenant_id,site_id,hostname,domain_type,status,is_primary,
           verification_status,verified_at,activated_at
         ) VALUES($1,$2,$3,$4,'active',true,'verified',
           transaction_timestamp(),transaction_timestamp())
         RETURNING id`,
        [site.rows[0].tenantId, siteId, host, type],
      );
      await adminAudit(client, {
        tenantId: site.rows[0].tenantId,
        action: type === "nexi_subdomain" ? "subdomain_assigned" : "domain_registered",
        resourceType: "domain", resourceId: domain.rows[0].id, correlationId,
      });
      return siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function adminDeletionRequests(
  session: AuthSession,
): Promise<DeletionRequestRecord[]> {
  return withAdminOperation(session, pageId("admin-deletions"), async (client) => {
    const result = await client.query<DeletionRequestRecord>(
      `SELECT request.id,request.tenant_id AS "tenantId",
         tenant.display_name AS "tenantName",request.site_id AS "siteId",
         site.display_name AS "siteName",request.reason,request.status,
         request.grace_hours AS "graceHours",request.requested_at AS "requestedAt",
         request.eligible_at AS "eligibleAt",request.review_note AS "reviewNote",
         request.version
       FROM public.site_deletion_requests request
       JOIN public.sites site ON site.id=request.site_id
       JOIN public.tenants tenant ON tenant.id=request.tenant_id
       ORDER BY request.created_at DESC`,
    );
    return result.rows;
  });
}

export async function adminReviewDeletion(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const requestId = uuid(form.get("request_id"));
  const target = String(form.get("target_status") || "");
  const note = text(form.get("review_note"), 3, 1000);
  if (!["approved", "rejected", "canceled", "executed"].includes(target)) {
    throw new OperationValidationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        tenantId: string; siteId: string; status: string; eligibleAt: Date;
        previousStatus: string;
      }>(
        `SELECT tenant_id AS "tenantId",site_id AS "siteId",status,eligible_at AS "eligibleAt",
           previous_site_status AS "previousStatus"
         FROM public.site_deletion_requests WHERE id=$1 FOR UPDATE`,
        [requestId],
      );
      const row = current.rows[0];
      if (!row) throw new OperationValidationError("not_found");
      if (row.status === target) return requestId;
      if (target === "executed") {
        if (row.status !== "approved" || row.eligibleAt > new Date()) {
          throw new OperationValidationError("too_early");
        }
        await client.query(
          `UPDATE public.site_deletion_requests SET status='executed',
             executed_at=transaction_timestamp(),review_note=$2,version=version+1
           WHERE id=$1`,
          [requestId, note],
        );
        await client.query(
          `UPDATE public.sites SET status='archived',version=version+1 WHERE id=$1`,
          [row.siteId],
        );
      } else {
        const validSource =
          row.status === "pending" ||
          (target === "canceled" && row.status === "approved");
        if (!validSource) throw new OperationValidationError("conflict");
        await client.query(
          `UPDATE public.site_deletion_requests SET status=$2,
             reviewed_at=transaction_timestamp(),reviewed_by_user_id=$3,
             review_note=$4,
             approved_at=CASE WHEN $2='approved' THEN transaction_timestamp() ELSE NULL END,
             rejected_at=CASE WHEN $2='rejected' THEN transaction_timestamp() ELSE NULL END,
             canceled_at=CASE WHEN $2='canceled' THEN transaction_timestamp() ELSE canceled_at END,
             version=version+1 WHERE id=$1`,
          [requestId, target, session.userId, note],
        );
        if (target === "rejected" || target === "canceled") {
          await client.query(
            `UPDATE public.sites SET status=$2,version=version+1 WHERE id=$1`,
            [row.siteId, row.previousStatus],
          );
        }
      }
      await adminAudit(client, {
        tenantId: row.tenantId,
        action: target === "approved" ? "deletion_approved"
          : target === "rejected" ? "deletion_rejected"
            : target === "canceled" ? "deletion_canceled" : "site_archived",
        resourceType: target === "executed" ? "site" : "deletion_request",
        resourceId: target === "executed" ? row.siteId : requestId,
        correlationId,
      });
      return requestId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function adminDomainRequests(
  session: AuthSession,
): Promise<DomainRequestRecord[]> {
  return withAdminOperation(session, pageId("admin-domains"), async (client) => {
    const result = await client.query<DomainRequestRecord>(
      `SELECT request.id,request.tenant_id AS "tenantId",
         tenant.display_name AS "tenantName",request.site_id AS "siteId",
         site.display_name AS "siteName",request.request_type AS "requestType",
         request.desired_domain AS "desiredDomain",request.alternatives,
         request.client_notes AS "clientNotes",request.internal_note AS "internalNote",
         request.status,request.version,request.created_at AS "createdAt"
       FROM public.site_domain_requests request
       JOIN public.sites site ON site.id=request.site_id
       JOIN public.tenants tenant ON tenant.id=request.tenant_id
       ORDER BY request.created_at DESC`,
    );
    return result.rows;
  });
}

export async function adminSiteDomains(
  session: AuthSession,
  siteId: string,
): Promise<DomainRecord[]> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return [];
  return withAdminOperation(session, pageId("admin-site-domains"), async (client) => {
    const result = await client.query<DomainRecord>(
      `SELECT id,tenant_id AS "tenantId",site_id AS "siteId",hostname,
         domain_type AS "domainType",status,is_primary AS "isPrimary",
         verification_status AS "verificationStatus",verified_at AS "verifiedAt",
         activated_at AS "activatedAt",version
       FROM public.site_domains WHERE site_id=$1 ORDER BY is_primary DESC,created_at`,
      [siteId],
    );
    return result.rows;
  });
}

export async function adminUpdateDomain(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const domainId = uuid(form.get("domain_id"));
  const status = String(form.get("domain_status") || "");
  const verification = String(form.get("verification_status") || "");
  const isPrimary = form.get("is_primary") === "true";
  const version = Number(form.get("version"));
  if (
    !["pending", "active", "error", "disabled"].includes(status) ||
    !["unverified", "pending", "verified", "failed"].includes(verification) ||
    !Number.isSafeInteger(version)
  ) {
    throw new OperationValidationError("invalid");
  }
  return withAdminOperation(session, correlationId, async (client) => {
    const current = await client.query<{ siteId: string; tenantId: string }>(
      `SELECT site_id AS "siteId",tenant_id AS "tenantId"
       FROM public.site_domains WHERE id=$1 FOR UPDATE`,
      [domainId],
    );
    if (!current.rows[0]) throw new OperationValidationError("not_found");
    if (isPrimary) {
      await client.query(
        `UPDATE public.site_domains SET is_primary=false,version=version+1
         WHERE site_id=$1 AND id<>$2 AND is_primary`,
        [current.rows[0].siteId, domainId],
      );
    }
    const updated = await client.query(
      `UPDATE public.site_domains SET status=$2,verification_status=$3,
         is_primary=$4,
         verified_at=CASE WHEN $3='verified' THEN COALESCE(verified_at,transaction_timestamp()) ELSE NULL END,
         activated_at=CASE WHEN $2='active' THEN COALESCE(activated_at,transaction_timestamp()) ELSE activated_at END,
         version=version+1 WHERE id=$1 AND version=$5`,
      [domainId, status, verification, isPrimary, version],
    );
    if (!updated.rowCount) throw new OperationValidationError("conflict");
    await adminAudit(client, {
      tenantId: current.rows[0].tenantId,
      action: "domain_status_changed",
      resourceType: "domain",
      resourceId: domainId,
      correlationId,
    });
    return current.rows[0].siteId;
  });
}

export async function adminSiteActivity(
  session: AuthSession,
  siteId: string,
): Promise<SiteActivityRecord[]> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return [];
  return withAdminOperation(session, pageId("admin-site-activity"), async (client) => {
    const result = await client.query<SiteActivityRecord>(
      `SELECT id,action,outcome,occurred_at AS "occurredAt"
       FROM public.platform_audit_events
       WHERE resource_id=$1
          OR metadata->>'site_id'=$1
       ORDER BY occurred_at DESC LIMIT 20`,
      [siteId],
    );
    return result.rows;
  });
}

export async function adminUpdateDomainRequest(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const requestId = uuid(form.get("request_id"));
  const status = String(form.get("request_status") || "");
  const note = optionalText(form.get("internal_note"), 1000);
  const allowed = [
    "submitted","reviewing","awaiting_client","registering","pending_dns",
    "verifying","active","rejected","canceled","failed",
  ];
  if (!allowed.includes(status)) throw new OperationValidationError("invalid");
  return withAdminOperation(session, correlationId, async (client) => {
    const updated = await client.query<{ tenantId: string }>(
      `UPDATE public.site_domain_requests SET status=$2,internal_note=$3,
         assigned_to_user_id=$4,reviewed_at=transaction_timestamp(),
         resolved_at=CASE WHEN $2 IN ('active','rejected','canceled','failed')
           THEN transaction_timestamp() ELSE NULL END,version=version+1
       WHERE id=$1 RETURNING tenant_id AS "tenantId"`,
      [requestId, status, note, session.userId],
    );
    if (!updated.rows[0]) throw new OperationValidationError("not_found");
    await adminAudit(client, {
      tenantId: updated.rows[0].tenantId, action: "domain_status_changed",
      resourceType: "domain_request", resourceId: requestId, correlationId,
    });
    return requestId;
  });
}

export async function adminConversations(
  session: AuthSession,
): Promise<ConversationRecord[]> {
  return withAdminOperation(session, pageId("admin-support"), async (client) => {
    const result = await client.query<ConversationRecord>(
      `SELECT conversation.id,conversation.tenant_id AS "tenantId",
         tenant.display_name AS "tenantName",conversation.site_id AS "siteId",
         conversation.subject,conversation.category,conversation.status,
         conversation.priority,
         conversation.assigned_to_user_id AS "assignedToUserId",
         (
           SELECT count(*)::integer FROM public.support_messages message
           WHERE message.conversation_id=conversation.id
             AND message.sender_user_id<>
               nullif(current_setting('app.current_user_id',true),'')::uuid
             AND message.created_at>COALESCE(participant.last_read_at,'epoch'::timestamptz)
         ) AS "unreadCount",
         conversation.last_message_at AS "lastMessageAt",conversation.version
       FROM public.support_conversations conversation
       JOIN public.tenants tenant ON tenant.id=conversation.tenant_id
       LEFT JOIN public.support_conversation_participants participant
         ON participant.conversation_id=conversation.id
        AND participant.user_id=
          nullif(current_setting('app.current_user_id',true),'')::uuid
       ORDER BY conversation.last_message_at DESC`,
    );
    return result.rows;
  });
}

export async function adminUnreadCount(session: AuthSession): Promise<number> {
  return withAdminOperation(session, pageId("admin-support-unread"), async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM public.support_messages message
       LEFT JOIN public.support_conversation_participants participant
         ON participant.conversation_id=message.conversation_id
        AND participant.user_id=
          nullif(current_setting('app.current_user_id',true),'')::uuid
       WHERE message.sender_user_id<>
           nullif(current_setting('app.current_user_id',true),'')::uuid
         AND message.created_at>COALESCE(participant.last_read_at,'epoch'::timestamptz)`,
    );
    return result.rows[0]?.count ?? 0;
  });
}

export async function adminConversation(
  session: AuthSession,
  conversationId: string,
): Promise<{ conversation: ConversationRecord; messages: SupportMessageRecord[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  return withAdminOperation(session, pageId("admin-conversation"), async (client) => {
    const conversation = await client.query<ConversationRecord>(
      `SELECT conversation.id,conversation.tenant_id AS "tenantId",
         tenant.display_name AS "tenantName",conversation.site_id AS "siteId",
         conversation.subject,conversation.category,conversation.status,
         conversation.priority,conversation.assigned_to_user_id AS "assignedToUserId",
         0 AS "unreadCount",conversation.last_message_at AS "lastMessageAt",
         conversation.version
       FROM public.support_conversations conversation
       JOIN public.tenants tenant ON tenant.id=conversation.tenant_id
       WHERE conversation.id=$1`,
      [conversationId],
    );
    if (!conversation.rows[0]) return null;
    const messages = await client.query<SupportMessageRecord>(
      `SELECT message.id,message.sender_scope AS "senderScope",
         COALESCE(account.display_name,
           CASE WHEN message.sender_scope='nexi_admin' THEN 'Equipo nexi' ELSE 'Cliente' END
         ) AS "senderName",message.body,
         message.created_at AS "createdAt"
       FROM public.support_messages message
       LEFT JOIN public.users account ON account.id=message.sender_user_id
       WHERE message.conversation_id=$1 ORDER BY message.created_at,message.id`,
      [conversationId],
    );
    await client.query(
      `INSERT INTO public.support_conversation_participants(
         tenant_id,conversation_id,user_id,participant_scope,last_read_at
       ) VALUES($1,$2,$3,'nexi_admin',transaction_timestamp())
       ON CONFLICT(conversation_id,user_id) DO UPDATE
         SET last_read_at=EXCLUDED.last_read_at`,
      [conversation.rows[0].tenantId, conversationId, session.userId],
    );
    return { conversation: conversation.rows[0], messages: messages.rows };
  });
}

export async function adminReply(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const conversationId = uuid(form.get("conversation_id"));
  const body = text(form.get("body"), 1, 4000);
  const key = uuid(form.get("idempotency_key"));
  return withAdminOperation(session, correlationId, async (client) => {
    const conversation = await client.query<{
      tenantId: string; recipientUserId: string; status: string;
    }>(
      `SELECT tenant_id AS "tenantId",created_by_user_id AS "recipientUserId",status
       FROM public.support_conversations WHERE id=$1 FOR UPDATE`,
      [conversationId],
    );
    if (!conversation.rows[0]) throw new OperationValidationError("not_found");
    if (conversation.rows[0].status === "closed") {
      throw new OperationValidationError("conflict");
    }
    const message = await client.query<{ id: string }>(
      `INSERT INTO public.support_messages(
         tenant_id,conversation_id,sender_user_id,sender_scope,body,idempotency_key
       ) VALUES($1,$2,$3,'nexi_admin',$4,$5)
       ON CONFLICT(conversation_id,sender_user_id,idempotency_key)
         DO NOTHING RETURNING id`,
      [conversation.rows[0].tenantId, conversationId, session.userId, body, key],
    );
    if (!message.rows[0]) return conversationId;
    await client.query(
      `UPDATE public.support_conversations SET status='awaiting_client',
         assigned_to_user_id=$2,last_message_at=transaction_timestamp(),
         version=version+1 WHERE id=$1`,
      [conversationId, session.userId],
    );
    await enqueue(
      client, conversation.rows[0].tenantId,
      conversation.rows[0].recipientUserId, conversationId, message.rows[0].id,
    );
    await adminAudit(client, {
      tenantId: conversation.rows[0].tenantId, action: "support_message_sent",
      resourceType: "message", resourceId: message.rows[0].id, correlationId,
    });
    return conversationId;
  });
}

export async function adminConversationState(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const conversationId = uuid(form.get("conversation_id"));
  const status = String(form.get("conversation_status") || "");
  const priority = String(form.get("priority") || "");
  if (!["open","awaiting_nexi","awaiting_client","closed"].includes(status) ||
      !["normal","high","urgent"].includes(priority)) {
    throw new OperationValidationError("invalid");
  }
  return withAdminOperation(session, correlationId, async (client) => {
    const current = await client.query<{
      tenantId: string; status: ConversationStatus; priority: ConversationPriority;
    }>(
      `SELECT tenant_id AS "tenantId",status,priority
       FROM public.support_conversations WHERE id=$1 FOR UPDATE`,
      [conversationId],
    );
    if (!current.rows[0]) throw new OperationValidationError("not_found");
    await client.query(
      `UPDATE public.support_conversations SET status=$2,priority=$3,
         assigned_to_user_id=$4,
         closed_at=CASE WHEN $2='closed' THEN transaction_timestamp() ELSE NULL END,
         version=version+1 WHERE id=$1`,
      [conversationId, status, priority, session.userId],
    );
    if (current.rows[0].priority !== priority) {
      await adminAudit(client, {
        tenantId: current.rows[0].tenantId,
        action: "conversation_priority_changed", resourceType: "conversation",
        resourceId: conversationId, correlationId,
      });
    }
    if (current.rows[0].status !== status &&
        (status === "closed" || current.rows[0].status === "closed")) {
      await adminAudit(client, {
        tenantId: current.rows[0].tenantId,
        action: status === "closed" ? "conversation_closed" : "conversation_reopened",
        resourceType: "conversation", resourceId: conversationId, correlationId,
      });
    }
    return conversationId;
  });
}

export async function deliverSyntheticNotifications(
  session: AuthSession,
  correlationId: string,
): Promise<number> {
  const env = getAppConfig().environment;
  if (!canUseSyntheticNotificationAdapter(env)) {
    throw new OperationValidationError("denied");
  }
  return withAdminOperation(session, correlationId, async (client) => {
    const result = await client.query(
      `UPDATE public.notification_outbox SET status='sent',attempts=attempts+1,
         sent_at=transaction_timestamp(),last_error_code=NULL
       WHERE status IN ('pending','failed') AND available_at<=transaction_timestamp()`,
    );
    return result.rowCount ?? 0;
  });
}
