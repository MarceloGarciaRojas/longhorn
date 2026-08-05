ALTER TABLE public.sites
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN creation_idempotency_key uuid;

ALTER TABLE public.sites DROP CONSTRAINT sites_status_valid;
ALTER TABLE public.sites ADD CONSTRAINT sites_status_valid CHECK (
  status IN ('preparing', 'active', 'suspended', 'deletion_requested', 'archived')
);
ALTER TABLE public.sites ADD CONSTRAINT sites_version_valid CHECK (version > 0);
CREATE UNIQUE INDEX sites_creation_idempotency_key_unique
  ON public.sites (creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE TABLE public.site_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  previous_site_status text NOT NULL,
  grace_hours integer NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  eligible_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  review_note text,
  approved_at timestamptz,
  rejected_at timestamptz,
  canceled_at timestamptz,
  executed_at timestamptz,
  idempotency_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_deletion_reason_valid CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT site_deletion_status_valid CHECK (
    status IN ('pending', 'approved', 'rejected', 'canceled', 'executed')
  ),
  CONSTRAINT site_deletion_previous_status_valid CHECK (
    previous_site_status IN ('preparing', 'active', 'suspended')
  ),
  CONSTRAINT site_deletion_grace_valid CHECK (grace_hours IN (24, 48)),
  CONSTRAINT site_deletion_eligible_valid CHECK (eligible_at > requested_at),
  CONSTRAINT site_deletion_note_valid CHECK (
    review_note IS NULL OR length(btrim(review_note)) BETWEEN 3 AND 1000
  ),
  CONSTRAINT site_deletion_idempotency_unique UNIQUE (
    tenant_id, requested_by_user_id, idempotency_key
  )
);
CREATE UNIQUE INDEX site_deletion_one_active_idx
  ON public.site_deletion_requests(site_id)
  WHERE status IN ('pending', 'approved');
CREATE INDEX site_deletion_queue_idx
  ON public.site_deletion_requests(status, eligible_at, created_at);
CREATE TRIGGER site_deletion_requests_set_updated_at BEFORE UPDATE
  ON public.site_deletion_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.site_domain_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_type text NOT NULL,
  desired_domain text,
  alternatives text,
  client_notes text,
  internal_note text,
  status text NOT NULL DEFAULT 'submitted',
  assigned_to_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  idempotency_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_domain_request_type_valid CHECK (
    request_type IN ('connect_existing', 'register_new', 'advice_required')
  ),
  CONSTRAINT site_domain_request_status_valid CHECK (
    status IN ('submitted', 'reviewing', 'awaiting_client', 'registering',
      'pending_dns', 'verifying', 'active', 'rejected', 'canceled', 'failed')
  ),
  CONSTRAINT site_domain_request_domain_valid CHECK (
    desired_domain IS NULL OR length(btrim(desired_domain)) BETWEEN 3 AND 253
  ),
  CONSTRAINT site_domain_request_text_valid CHECK (
    (alternatives IS NULL OR length(btrim(alternatives)) BETWEEN 1 AND 500)
    AND (client_notes IS NULL OR length(btrim(client_notes)) BETWEEN 1 AND 1000)
    AND (internal_note IS NULL OR length(btrim(internal_note)) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT site_domain_request_idempotency_unique UNIQUE (
    tenant_id, requested_by_user_id, idempotency_key
  )
);
CREATE UNIQUE INDEX site_domain_request_one_active_idx
  ON public.site_domain_requests(site_id)
  WHERE status NOT IN ('active', 'rejected', 'canceled', 'failed');
CREATE INDEX site_domain_request_queue_idx
  ON public.site_domain_requests(status, created_at);
CREATE TRIGGER site_domain_requests_set_updated_at BEFORE UPDATE
  ON public.site_domain_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.site_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  hostname text NOT NULL,
  domain_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at timestamptz,
  activated_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_domains_hostname_unique UNIQUE(hostname),
  CONSTRAINT site_domains_hostname_valid CHECK (
    hostname = lower(btrim(hostname))
    AND length(hostname) BETWEEN 4 AND 253
    AND hostname ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$'
  ),
  CONSTRAINT site_domains_type_valid CHECK (
    domain_type IN ('nexi_subdomain', 'custom_domain')
  ),
  CONSTRAINT site_domains_status_valid CHECK (
    status IN ('pending', 'active', 'error', 'disabled')
  ),
  CONSTRAINT site_domains_verification_valid CHECK (
    verification_status IN ('unverified', 'pending', 'verified', 'failed')
  )
);
CREATE UNIQUE INDEX site_domains_one_primary_idx
  ON public.site_domains(site_id) WHERE is_primary;
CREATE INDEX site_domains_tenant_site_idx ON public.site_domains(tenant_id, site_id);
CREATE TRIGGER site_domains_set_updated_at BEFORE UPDATE
  ON public.site_domains FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_nexi',
  priority text NOT NULL DEFAULT 'normal',
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  assigned_to_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  last_message_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  closed_at timestamptz,
  idempotency_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT support_conversation_subject_valid CHECK (
    length(btrim(subject)) BETWEEN 3 AND 160
  ),
  CONSTRAINT support_conversation_category_valid CHECK (
    category IN ('general', 'site', 'domain', 'deletion', 'plan', 'other')
  ),
  CONSTRAINT support_conversation_status_valid CHECK (
    status IN ('open', 'awaiting_nexi', 'awaiting_client', 'closed')
  ),
  CONSTRAINT support_conversation_priority_valid CHECK (
    priority IN ('normal', 'high', 'urgent')
  ),
  CONSTRAINT support_conversation_idempotency_unique UNIQUE (
    tenant_id, created_by_user_id, idempotency_key
  )
);
CREATE INDEX support_conversations_tenant_activity_idx
  ON public.support_conversations(tenant_id, last_message_at DESC);
CREATE INDEX support_conversations_admin_queue_idx
  ON public.support_conversations(status, priority, last_message_at DESC);
CREATE TRIGGER support_conversations_set_updated_at BEFORE UPDATE
  ON public.support_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sender_scope text NOT NULL,
  body text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT support_messages_scope_valid CHECK (
    sender_scope IN ('client_admin', 'nexi_admin')
  ),
  CONSTRAINT support_messages_body_valid CHECK (
    length(btrim(body)) BETWEEN 1 AND 4000
  ),
  CONSTRAINT support_messages_idempotency_unique UNIQUE (
    conversation_id, sender_user_id, idempotency_key
  )
);
CREATE INDEX support_messages_conversation_idx
  ON public.support_messages(conversation_id, created_at, id);

CREATE TABLE public.support_conversation_participants (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  participant_scope text NOT NULL,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(conversation_id, user_id),
  CONSTRAINT support_participant_scope_valid CHECK (
    participant_scope IN ('client_admin', 'nexi_admin')
  )
);
CREATE INDEX support_participants_user_idx
  ON public.support_conversation_participants(user_id, tenant_id);

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'email',
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  deduplication_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT notification_outbox_dedup_unique UNIQUE(deduplication_key),
  CONSTRAINT notification_outbox_channel_valid CHECK (channel = 'email'),
  CONSTRAINT notification_outbox_template_valid CHECK (
    template_key = 'new_support_message'
  ),
  CONSTRAINT notification_outbox_status_valid CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'canceled')
  ),
  CONSTRAINT notification_outbox_attempts_valid CHECK (attempts >= 0),
  CONSTRAINT notification_outbox_payload_safe CHECK (
    NOT (payload ?| ARRAY['body', 'token', 'cookie', 'password', 'secret'])
  )
);
CREATE INDEX notification_outbox_delivery_idx
  ON public.notification_outbox(status, available_at) WHERE status IN ('pending', 'failed');
CREATE TRIGGER notification_outbox_set_updated_at BEFORE UPDATE
  ON public.notification_outbox FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.current_actor_is_nexi_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_sessions session
    JOIN public.platform_staff staff ON staff.user_id = session.user_id
    JOIN public.users account ON account.id = session.user_id
    WHERE session.id = nullif(current_setting('app.current_session_id', true), '')::uuid
      AND session.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND session.audience = 'nexi_admin'
      AND session.assurance_level = 'aal2'
      AND session.revoked_at IS NULL
      AND session.expires_at > transaction_timestamp()
      AND staff.role = 'nexi_admin' AND staff.status = 'active'
      AND account.status = 'active' AND account.deleted_at IS NULL
  )
$function$;

CREATE OR REPLACE FUNCTION app_private.notification_recipient_admin()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT staff.user_id
  FROM public.platform_staff staff
  JOIN public.users account ON account.id = staff.user_id
  WHERE staff.role = 'nexi_admin'
    AND staff.status = 'active'
    AND account.status = 'active'
    AND account.deleted_at IS NULL
  ORDER BY staff.created_at, staff.user_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app_private.operation_enqueue_notification(
  requested_tenant_id uuid,
  requested_recipient_user_id uuid,
  requested_template_key text,
  requested_payload jsonb,
  requested_deduplication_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  created_id uuid;
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    IF requested_tenant_id IS DISTINCT FROM app_context.current_tenant_id()
      OR NOT app_private.current_actor_is_active_member()
    THEN
      RAISE EXCEPTION 'notification enqueue denied' USING ERRCODE='42501';
    END IF;
  END IF;
  IF requested_template_key <> 'new_support_message'
    OR jsonb_typeof(requested_payload) <> 'object'
    OR requested_payload ?| ARRAY['body','token','cookie','password','secret']
    OR NOT (requested_payload ? 'path')
    OR length(requested_deduplication_key) NOT BETWEEN 10 AND 200
  THEN
    RAISE EXCEPTION 'invalid notification payload' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.notification_outbox(
    tenant_id,recipient_user_id,template_key,payload,deduplication_key
  ) VALUES(
    requested_tenant_id,requested_recipient_user_id,requested_template_key,
    requested_payload,requested_deduplication_key
  )
  ON CONFLICT(deduplication_key) DO NOTHING
  RETURNING id INTO created_id;
  IF created_id IS NULL THEN
    SELECT id INTO created_id FROM public.notification_outbox
    WHERE deduplication_key=requested_deduplication_key;
  END IF;
  RETURN created_id;
END
$function$;

CREATE FUNCTION app_private.operation_record_admin_event(
  requested_tenant_id uuid, requested_action text, requested_resource_type text,
  requested_resource_id text, requested_correlation_id text,
  requested_previous_state jsonb, requested_new_state jsonb,
  requested_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE created_event_id bigint;
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    RAISE EXCEPTION 'admin access denied' USING ERRCODE='42501';
  END IF;
  IF requested_action NOT IN (
    'site_created','site_updated','subdomain_assigned','deletion_approved',
    'deletion_rejected','deletion_canceled','site_archived','domain_status_changed',
    'domain_registered','conversation_closed','conversation_reopened',
    'conversation_priority_changed','support_message_sent',
    'operation_access_denied'
  ) THEN RAISE EXCEPTION 'invalid operation event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    nullif(current_setting('app.current_user_id',true),'')::uuid,
    requested_tenant_id,requested_action,requested_resource_type,
    requested_resource_id,
    CASE WHEN requested_action='operation_access_denied' THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

CREATE FUNCTION app_private.enforce_site_tenant_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE expected_tenant uuid;
BEGIN
  SELECT tenant_id INTO expected_tenant FROM public.sites WHERE id = NEW.site_id;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'site tenant mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER site_deletion_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.site_deletion_requests FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_site_tenant_consistency();
CREATE TRIGGER site_domain_request_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.site_domain_requests FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_site_tenant_consistency();
CREATE TRIGGER site_domains_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.site_domains FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_site_tenant_consistency();

CREATE FUNCTION app_private.enforce_support_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE expected_tenant uuid;
BEGIN
  SELECT tenant_id INTO expected_tenant FROM public.support_conversations
    WHERE id = NEW.conversation_id;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'conversation tenant mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER support_messages_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.support_messages FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_support_consistency();
CREATE TRIGGER support_participants_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.support_conversation_participants FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_support_consistency();

CREATE FUNCTION app_private.prevent_support_message_changes()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'support messages are immutable' USING ERRCODE = '42501';
END
$function$;
CREATE TRIGGER support_messages_immutable BEFORE UPDATE OR DELETE
  ON public.support_messages FOR EACH ROW
  EXECUTE FUNCTION app_private.prevent_support_message_changes();

CREATE FUNCTION app_private.protect_support_conversation_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin()
    AND (
      NEW.priority IS DISTINCT FROM OLD.priority
      OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    )
  THEN
    RAISE EXCEPTION 'support conversation administrative fields are immutable for clients'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER support_conversations_protect_admin_fields
  BEFORE UPDATE ON public.support_conversations FOR EACH ROW
  EXECUTE FUNCTION app_private.protect_support_conversation_admin_fields();

CREATE FUNCTION app_private.protect_client_site_operation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  IF app_private.current_actor_is_nexi_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.version <> OLD.version + 1
    OR NOT (
      (OLD.status IN ('preparing','active','suspended')
        AND NEW.status = 'deletion_requested')
      OR
      (OLD.status = 'deletion_requested'
        AND NEW.status IN ('preparing','active','suspended'))
    )
  THEN
    RAISE EXCEPTION 'client site operation fields are restricted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER sites_protect_client_operation_fields
  BEFORE UPDATE ON public.sites FOR EACH ROW
  EXECUTE FUNCTION app_private.protect_client_site_operation_fields();

ALTER TABLE public.site_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_domain_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY sites_admin_all ON public.sites FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY sites_client_deletion_update ON public.sites FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND deleted_at IS NULL
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND deleted_at IS NULL
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY tenants_operations_admin_select ON public.tenants FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());
CREATE POLICY users_operations_admin_select ON public.users FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());
CREATE POLICY audit_operations_admin_select ON public.platform_audit_events FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());

CREATE POLICY deletion_client_select ON public.site_deletion_requests FOR SELECT
  USING (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member());
CREATE POLICY deletion_client_insert ON public.site_deletion_requests FOR INSERT
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND requested_by_user_id = app_context.current_user_id()
    AND status = 'pending' AND app_private.current_actor_is_active_member());
CREATE POLICY deletion_client_cancel ON public.site_deletion_requests FOR UPDATE
  USING (tenant_id = app_context.current_tenant_id()
    AND requested_by_user_id = app_context.current_user_id()
    AND status IN ('pending', 'approved'))
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND requested_by_user_id = app_context.current_user_id()
    AND status = 'canceled');
CREATE POLICY deletion_admin_all ON public.site_deletion_requests FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());

CREATE POLICY domain_request_client_select ON public.site_domain_requests FOR SELECT
  USING (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member());
CREATE POLICY domain_request_client_insert ON public.site_domain_requests FOR INSERT
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND requested_by_user_id = app_context.current_user_id()
    AND status = 'submitted' AND app_private.current_actor_is_active_member());
CREATE POLICY domain_request_admin_all ON public.site_domain_requests FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());

CREATE POLICY domains_client_select ON public.site_domains FOR SELECT
  USING (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member());
CREATE POLICY domains_admin_all ON public.site_domains FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());

CREATE POLICY conversations_client_all ON public.support_conversations FOR ALL
  USING (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member())
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member());
CREATE POLICY conversations_admin_all ON public.support_conversations FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY messages_client_select ON public.support_messages FOR SELECT
  USING (tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member());
CREATE POLICY messages_client_insert ON public.support_messages FOR INSERT
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND sender_user_id = app_context.current_user_id()
    AND sender_scope = 'client_admin'
    AND app_private.current_actor_is_active_member());
CREATE POLICY messages_admin_all ON public.support_messages FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY participants_client_all ON public.support_conversation_participants FOR ALL
  USING (tenant_id = app_context.current_tenant_id()
    AND user_id = app_context.current_user_id()
    AND app_private.current_actor_is_active_member())
  WITH CHECK (tenant_id = app_context.current_tenant_id()
    AND user_id = app_context.current_user_id()
    AND participant_scope = 'client_admin'
    AND app_private.current_actor_is_active_member());
CREATE POLICY participants_admin_all ON public.support_conversation_participants FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY outbox_admin_all ON public.notification_outbox FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
REVOKE ALL ON TABLE public.site_deletion_requests, public.site_domain_requests,
  public.site_domains, public.support_conversations, public.support_messages,
  public.support_conversation_participants, public.notification_outbox
  FROM PUBLIC, nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.site_deletion_requests TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.site_domain_requests TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.site_domains TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.support_conversations TO nexi_app;
GRANT SELECT, INSERT ON public.support_messages TO nexi_app;
GRANT SELECT, INSERT, UPDATE(last_read_at) ON public.support_conversation_participants TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO nexi_app;
GRANT INSERT, UPDATE(display_name, slug, status, version, creation_idempotency_key) ON public.sites TO nexi_app;
GRANT SELECT ON public.platform_audit_events TO nexi_app;
REVOKE ALL ON FUNCTION app_private.current_actor_is_nexi_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_actor_is_nexi_admin() TO nexi_app;
REVOKE ALL ON FUNCTION app_private.notification_recipient_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.notification_recipient_admin() TO nexi_app;
REVOKE ALL ON FUNCTION app_private.operation_enqueue_notification(
  uuid,uuid,text,jsonb,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.operation_enqueue_notification(
  uuid,uuid,text,jsonb,text
) TO nexi_app;
REVOKE ALL ON FUNCTION app_private.operation_record_admin_event(
  uuid,text,text,text,text,jsonb,jsonb,jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.operation_record_admin_event(
  uuid,text,text,text,text,jsonb,jsonb,jsonb
) TO nexi_app;

ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_action_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_action_valid CHECK (
  action IN (
    'tenant_created','tenant_updated','tenant_activated','tenant_suspended',
    'tenant_reactivated','invitation_created','invitation_resent','invitation_failed',
    'invitation_revoked','invitation_accepted','membership_created',
    'membership_disabled','membership_reactivated','admin_access_denied',
    'client_panel_accessed','personal_profile_updated','tenant_profile_updated',
    'site_created','site_updated','subdomain_assigned','deletion_requested',
    'deletion_canceled','deletion_approved','deletion_rejected','site_archived',
    'domain_requested','domain_status_changed','domain_registered',
    'conversation_created','conversation_closed','conversation_reopened',
    'conversation_priority_changed','support_message_sent','operation_access_denied'
  )
);
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN (
    'tenant','invitation','membership','admin_route','client_route',
    'user_profile','tenant_profile','site','deletion_request','domain_request',
    'domain','conversation','message','outbox'
  )
);

CREATE OR REPLACE FUNCTION app_private.client_record_event(
  requested_session_id uuid, requested_actor_user_id uuid, requested_tenant_id uuid,
  requested_action text, requested_resource_type text, requested_resource_id text,
  requested_correlation_id text, requested_previous_state jsonb,
  requested_new_state jsonb, requested_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE created_event_id bigint;
BEGIN
  PERFORM app_private.require_client_session(
    requested_session_id, requested_actor_user_id, requested_tenant_id
  );
  IF requested_action NOT IN (
    'client_panel_accessed','personal_profile_updated','tenant_profile_updated',
    'deletion_requested','deletion_canceled','domain_requested',
    'conversation_created','conversation_closed','conversation_reopened',
    'support_message_sent','operation_access_denied'
  ) OR requested_resource_type NOT IN (
    'client_route','user_profile','tenant_profile','site','deletion_request',
    'domain_request','conversation','message'
  ) THEN RAISE EXCEPTION 'invalid client audit event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    requested_actor_user_id,requested_tenant_id,requested_action,
    requested_resource_type,requested_resource_id,
    CASE WHEN requested_action='operation_access_denied' THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;
