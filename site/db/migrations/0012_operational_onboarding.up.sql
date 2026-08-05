ALTER TABLE public.auth_rate_limits
  DROP CONSTRAINT auth_rate_limits_scope_valid;
ALTER TABLE public.auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
    scope IN (
      'login_ip', 'login_identity', 'recovery_ip', 'recovery_identity',
      'recovery_verify_ip', 'password_reset_ip', 'tenant_selection',
      'admin_mutation', 'invitation_acceptance', 'client_mutation',
      'onboarding_public'
    )
  );

CREATE TABLE public.onboarding_intake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  business_name text NOT NULL,
  business_category text NOT NULL,
  contact_name text NOT NULL,
  contact_email_normalized text NOT NULL,
  contact_phone text,
  preferred_contact_method text NOT NULL,
  city text,
  current_digital_presence text NOT NULL,
  primary_goal text NOT NULL,
  short_notes text,
  source_hint text,
  supported_category boolean NOT NULL,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  converted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason_code text,
  idempotency_key uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  conversion_status text NOT NULL DEFAULT 'not_started',
  conversion_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  converted_site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT,
  converted_case_id uuid,
  version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_intake_source_valid CHECK (
    source IN ('public_form','whatsapp','phone','referral','manual','other')
  ),
  CONSTRAINT onboarding_intake_status_valid CHECK (
    status IN (
      'submitted','reviewing','waiting_information','accepted','rejected',
      'converted','canceled'
    )
  ),
  CONSTRAINT onboarding_intake_category_valid CHECK (
    business_category IN (
      'restaurant','cafe','hotel','hostel','gym','school','clinic',
      'professional_services','other'
    )
  ),
  CONSTRAINT onboarding_intake_contact_method_valid CHECK (
    preferred_contact_method IN ('email','phone','whatsapp')
  ),
  CONSTRAINT onboarding_intake_conversion_valid CHECK (
    conversion_status IN (
      'not_started','resources_prepared','identity_pending',
      'identity_ready','completed','recoverable_failure'
    )
  ),
  CONSTRAINT onboarding_intake_text_valid CHECK (
    length(btrim(business_name)) BETWEEN 2 AND 120
    AND length(btrim(contact_name)) BETWEEN 2 AND 120
    AND length(contact_email_normalized) BETWEEN 3 AND 254
    AND contact_email_normalized=lower(btrim(contact_email_normalized))
    AND length(btrim(current_digital_presence)) BETWEEN 1 AND 500
    AND length(btrim(primary_goal)) BETWEEN 2 AND 500
    AND (contact_phone IS NULL OR length(contact_phone) BETWEEN 7 AND 24)
    AND (city IS NULL OR length(btrim(city)) BETWEEN 2 AND 120)
    AND (short_notes IS NULL OR length(btrim(short_notes)) BETWEEN 1 AND 1000)
    AND (source_hint IS NULL OR length(btrim(source_hint)) BETWEEN 1 AND 120)
  ),
  CONSTRAINT onboarding_intake_fingerprint_valid CHECK (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT onboarding_intake_version_valid CHECK (version > 0),
  CONSTRAINT onboarding_intake_progress_safe CHECK (
    jsonb_typeof(conversion_progress)='object'
    AND octet_length(conversion_progress::text) <= 8192
    AND NOT (conversion_progress ?| ARRAY[
      'token','cookie','password','secret','body','acceptance_token'
    ])
  )
);
CREATE INDEX onboarding_intake_queue_idx
  ON public.onboarding_intake_requests(status, submitted_at DESC);
CREATE INDEX onboarding_intake_filter_idx
  ON public.onboarding_intake_requests(
    business_category,source,submitted_at DESC
  );
CREATE INDEX onboarding_intake_email_idx
  ON public.onboarding_intake_requests(contact_email_normalized);
CREATE TRIGGER onboarding_intake_set_updated_at BEFORE UPDATE
  ON public.onboarding_intake_requests FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.onboarding_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  intake_request_id uuid REFERENCES public.onboarding_intake_requests(id)
    ON DELETE RESTRICT,
  primary_client_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  invitation_id uuid REFERENCES public.tenant_invitations(id) ON DELETE RESTRICT,
  assigned_admin_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'received',
  previous_operational_status text,
  priority text NOT NULL DEFAULT 'normal',
  industry_key text NOT NULL,
  onboarding_schema_key text NOT NULL,
  onboarding_schema_version integer NOT NULL,
  current_step text NOT NULL DEFAULT 'business',
  target_template_version_id uuid NOT NULL
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  target_plan_assignment_id uuid NOT NULL
    REFERENCES public.tenant_plan_assignments(id) ON DELETE RESTRICT,
  linked_conversation_id uuid
    REFERENCES public.support_conversations(id) ON DELETE RESTRICT,
  publication_id uuid
    REFERENCES public.site_content_publications(id) ON DELETE RESTRICT,
  generated_from_answers_revision integer,
  generated_draft_revision integer,
  generated_content_checksum text,
  last_generation_idempotency_key uuid,
  submitted_for_review_at timestamptz,
  internal_reviewed_at timestamptz,
  sent_for_client_approval_at timestamptz,
  approved_at timestamptz,
  ready_to_publish_at timestamptz,
  published_at timestamptz,
  published_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  verification_result jsonb,
  verification_timestamp timestamptz,
  public_reference text,
  paused_at timestamptz,
  canceled_at timestamptz,
  idempotency_key uuid NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_case_site_unique UNIQUE(site_id),
  CONSTRAINT onboarding_case_intake_unique UNIQUE(intake_request_id),
  CONSTRAINT onboarding_case_status_valid CHECK (
    status IN (
      'received','pending_review','waiting_information','preparing',
      'internal_review','waiting_client_approval','ready_to_publish',
      'published','paused','canceled'
    )
  ),
  CONSTRAINT onboarding_case_previous_status_valid CHECK (
    previous_operational_status IS NULL OR previous_operational_status IN (
      'received','pending_review','waiting_information','preparing',
      'internal_review','waiting_client_approval','ready_to_publish'
    )
  ),
  CONSTRAINT onboarding_case_priority_valid CHECK (
    priority IN ('normal','high','urgent')
  ),
  CONSTRAINT onboarding_case_schema_valid CHECK (
    industry_key='restaurant'
    AND onboarding_schema_key='restaurant_onboarding.v1'
    AND onboarding_schema_version=1
  ),
  CONSTRAINT onboarding_case_step_valid CHECK (
    current_step IN (
      'business','content','media','nexi_review','client_approval','publication'
    )
  ),
  CONSTRAINT onboarding_case_version_valid CHECK (version > 0),
  CONSTRAINT onboarding_case_generation_valid CHECK (
    (generated_from_answers_revision IS NULL
      AND generated_draft_revision IS NULL
      AND generated_content_checksum IS NULL)
    OR (
      generated_from_answers_revision > 0
      AND generated_draft_revision > 0
      AND generated_content_checksum ~ '^[a-f0-9]{64}$'
    )
  ),
  CONSTRAINT onboarding_case_verification_safe CHECK (
    verification_result IS NULL OR (
      jsonb_typeof(verification_result)='object'
      AND octet_length(verification_result::text) <= 4096
      AND NOT (verification_result ?| ARRAY[
        'token','cookie','password','secret','body','object_key'
      ])
    )
  )
);
ALTER TABLE public.onboarding_intake_requests
  ADD CONSTRAINT onboarding_intake_case_fk
  FOREIGN KEY(converted_case_id) REFERENCES public.onboarding_cases(id)
  ON DELETE RESTRICT;
CREATE INDEX onboarding_cases_tenant_status_idx
  ON public.onboarding_cases(tenant_id,status,updated_at DESC);
CREATE INDEX onboarding_cases_admin_queue_idx
  ON public.onboarding_cases(status,priority,assigned_admin_user_id,updated_at DESC);
CREATE TRIGGER onboarding_cases_set_updated_at BEFORE UPDATE
  ON public.onboarding_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.onboarding_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_case_id uuid NOT NULL UNIQUE
    REFERENCES public.onboarding_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  schema_key text NOT NULL,
  schema_version integer NOT NULL,
  answers jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  completion_state text NOT NULL DEFAULT 'draft',
  updated_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  last_idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_answers_schema_valid CHECK (
    schema_key='restaurant_onboarding.v1' AND schema_version=1
  ),
  CONSTRAINT onboarding_answers_revision_valid CHECK (revision > 0),
  CONSTRAINT onboarding_answers_completion_valid CHECK (
    completion_state IN ('draft','complete','submitted')
  ),
  CONSTRAINT onboarding_answers_document_valid CHECK (
    jsonb_typeof(answers)='object'
    AND octet_length(answers::text) <= 65536
    AND lower(answers::text) !~ '<[[:space:]]*(script|iframe|object|embed)'
    AND lower(answers::text) NOT LIKE '%javascript:%'
    AND lower(answers::text) NOT LIKE '%"objectkey"%'
  )
);
CREATE INDEX onboarding_answers_tenant_case_idx
  ON public.onboarding_answers(tenant_id,onboarding_case_id);
CREATE TRIGGER onboarding_answers_set_updated_at BEFORE UPDATE
  ON public.onboarding_answers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_case_id uuid NOT NULL
    REFERENCES public.onboarding_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  required boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  client_visible boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  blocked_reason text,
  display_order integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_checklist_key_unique UNIQUE(onboarding_case_id,item_key),
  CONSTRAINT onboarding_checklist_key_valid CHECK (
    item_key ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  CONSTRAINT onboarding_checklist_status_valid CHECK (
    status IN ('pending','in_progress','completed','blocked','not_applicable')
  ),
  CONSTRAINT onboarding_checklist_source_valid CHECK (
    source IN ('system','admin','client')
  ),
  CONSTRAINT onboarding_checklist_text_valid CHECK (
    length(btrim(display_name)) BETWEEN 2 AND 120
    AND length(btrim(category)) BETWEEN 2 AND 40
    AND (blocked_reason IS NULL OR length(btrim(blocked_reason)) BETWEEN 2 AND 500)
  ),
  CONSTRAINT onboarding_checklist_order_valid CHECK (display_order BETWEEN 1 AND 1000),
  CONSTRAINT onboarding_checklist_version_valid CHECK (version > 0)
);
CREATE INDEX onboarding_checklist_case_order_idx
  ON public.onboarding_checklist_items(onboarding_case_id,display_order);
CREATE TRIGGER onboarding_checklist_set_updated_at BEFORE UPDATE
  ON public.onboarding_checklist_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.onboarding_client_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_case_id uuid NOT NULL
    REFERENCES public.onboarding_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  draft_revision integer NOT NULL,
  template_version_id uuid NOT NULL
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  schema_key text NOT NULL,
  schema_version integer NOT NULL,
  content_checksum text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  invalidated_at timestamptz,
  invalidation_reason text,
  idempotency_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_approval_idempotency_unique UNIQUE(
    onboarding_case_id,idempotency_key
  ),
  CONSTRAINT onboarding_approval_revision_valid CHECK (draft_revision > 0),
  CONSTRAINT onboarding_approval_schema_valid CHECK (
    schema_key='restaurant.v2' AND schema_version=2
  ),
  CONSTRAINT onboarding_approval_checksum_valid CHECK (
    content_checksum ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT onboarding_approval_status_valid CHECK (
    status IN ('pending','approved','changes_requested','invalidated','canceled')
  ),
  CONSTRAINT onboarding_approval_note_valid CHECK (
    decision_note IS NULL OR length(btrim(decision_note)) BETWEEN 2 AND 1000
  ),
  CONSTRAINT onboarding_approval_version_valid CHECK (version > 0)
);
CREATE UNIQUE INDEX onboarding_approval_one_current_idx
  ON public.onboarding_client_approvals(onboarding_case_id)
  WHERE status IN ('pending','approved');
CREATE INDEX onboarding_approval_case_history_idx
  ON public.onboarding_client_approvals(onboarding_case_id,created_at DESC);
CREATE TRIGGER onboarding_approvals_set_updated_at BEFORE UPDATE
  ON public.onboarding_client_approvals FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.onboarding_state_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onboarding_case_id uuid NOT NULL
    REFERENCES public.onboarding_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  reason_code text,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_history_status_valid CHECK (
    (from_status IS NULL OR from_status IN (
      'received','pending_review','waiting_information','preparing',
      'internal_review','waiting_client_approval','ready_to_publish',
      'published','paused','canceled'
    ))
    AND to_status IN (
      'received','pending_review','waiting_information','preparing',
      'internal_review','waiting_client_approval','ready_to_publish',
      'published','paused','canceled'
    )
  ),
  CONSTRAINT onboarding_history_reason_valid CHECK (
    reason_code IS NULL OR length(reason_code) BETWEEN 2 AND 80
  )
);
CREATE INDEX onboarding_history_case_idx
  ON public.onboarding_state_history(onboarding_case_id,id DESC);

CREATE TABLE public.onboarding_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_case_id uuid NOT NULL
    REFERENCES public.onboarding_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  category text NOT NULL,
  note text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_note_idempotency_unique UNIQUE(
    onboarding_case_id,author_user_id,idempotency_key
  ),
  CONSTRAINT onboarding_note_category_valid CHECK (
    category IN ('review','blocker','handoff','general')
  ),
  CONSTRAINT onboarding_note_text_valid CHECK (
    length(btrim(note)) BETWEEN 2 AND 2000
    AND lower(note) NOT LIKE '%password%'
    AND lower(note) NOT LIKE '%token%'
    AND lower(note) NOT LIKE '%secret%'
  )
);
CREATE INDEX onboarding_notes_case_idx
  ON public.onboarding_internal_notes(onboarding_case_id,created_at DESC);

CREATE TABLE public.onboarding_intake_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_request_id uuid NOT NULL
    REFERENCES public.onboarding_intake_requests(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  category text NOT NULL DEFAULT 'general',
  note text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT onboarding_intake_note_idempotency_unique UNIQUE(
    intake_request_id,author_user_id,idempotency_key
  ),
  CONSTRAINT onboarding_intake_note_category_valid CHECK (
    category IN ('review','blocker','handoff','general')
  ),
  CONSTRAINT onboarding_intake_note_text_valid CHECK (
    length(btrim(note)) BETWEEN 2 AND 2000
    AND lower(note) NOT LIKE '%password%'
    AND lower(note) NOT LIKE '%token%'
    AND lower(note) NOT LIKE '%secret%'
  )
);
CREATE INDEX onboarding_intake_notes_request_idx
  ON public.onboarding_intake_internal_notes(intake_request_id,created_at DESC);

CREATE FUNCTION app_private.enforce_onboarding_tenant_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE case_tenant uuid;
DECLARE case_site uuid;
BEGIN
  IF TG_TABLE_NAME='onboarding_cases' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sites site
      WHERE site.id=NEW.site_id AND site.tenant_id=NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'onboarding case tenant mismatch' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT tenant_id,site_id INTO case_tenant,case_site
  FROM public.onboarding_cases WHERE id=NEW.onboarding_case_id;
  IF case_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'onboarding tenant mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='onboarding_client_approvals' THEN
    IF case_site IS DISTINCT FROM NEW.site_id THEN
      RAISE EXCEPTION 'onboarding site mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER onboarding_case_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_cases FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();
CREATE TRIGGER onboarding_answers_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_answers FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();
CREATE TRIGGER onboarding_checklist_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_checklist_items FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();
CREATE TRIGGER onboarding_approval_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_client_approvals FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();
CREATE TRIGGER onboarding_history_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_state_history FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();
CREATE TRIGGER onboarding_notes_tenant_consistency BEFORE INSERT OR UPDATE
  ON public.onboarding_internal_notes FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_onboarding_tenant_consistency();

CREATE FUNCTION app_private.link_accepted_onboarding_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE accepted_user uuid;
BEGIN
  IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT membership.user_id INTO accepted_user
    FROM public.tenant_memberships membership
    JOIN public.users account ON account.id=membership.user_id
    WHERE membership.tenant_id=NEW.tenant_id
      AND account.email=NEW.email_normalized
    ORDER BY membership.created_at DESC
    LIMIT 1;
    UPDATE public.onboarding_cases
    SET primary_client_user_id=accepted_user,version=version+1
    WHERE invitation_id=NEW.id AND primary_client_user_id IS NULL;
    UPDATE public.onboarding_checklist_items checklist
    SET status='completed',completed_at=transaction_timestamp(),
      completed_by_user_id=accepted_user,version=checklist.version+1
    FROM public.onboarding_cases case_record
    WHERE case_record.invitation_id=NEW.id
      AND checklist.onboarding_case_id=case_record.id
      AND checklist.item_key IN ('client_account_active','membership_active')
      AND accepted_user IS NOT NULL;
    INSERT INTO public.support_conversation_participants(
      tenant_id,conversation_id,user_id,participant_scope
    )
    SELECT case_record.tenant_id,case_record.linked_conversation_id,
      accepted_user,'client_admin'
    FROM public.onboarding_cases case_record
    WHERE case_record.invitation_id=NEW.id
      AND case_record.linked_conversation_id IS NOT NULL
      AND accepted_user IS NOT NULL
    ON CONFLICT(conversation_id,user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER onboarding_invitation_accepted
AFTER UPDATE OF status ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION app_private.link_accepted_onboarding_invitation();

CREATE FUNCTION app_private.invalidate_onboarding_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE affected_site uuid;
DECLARE reason text;
BEGIN
  IF TG_TABLE_NAME='site_content_drafts' THEN
    affected_site:=NEW.site_id;
    IF TG_OP='UPDATE' AND OLD.revision IS NOT DISTINCT FROM NEW.revision
      AND OLD.content IS NOT DISTINCT FROM NEW.content
      AND OLD.schema_key IS NOT DISTINCT FROM NEW.schema_key
      AND OLD.schema_version IS NOT DISTINCT FROM NEW.schema_version
    THEN RETURN NEW; END IF;
    reason:='draft_changed';
  ELSIF TG_TABLE_NAME='site_template_assignments' THEN
    affected_site:=NEW.site_id;
    IF TG_OP='UPDATE'
      AND OLD.template_version_id IS NOT DISTINCT FROM NEW.template_version_id
      AND OLD.schema_key IS NOT DISTINCT FROM NEW.schema_key
      AND OLD.schema_version IS NOT DISTINCT FROM NEW.schema_version
    THEN RETURN NEW; END IF;
    reason:='template_changed';
  ELSE
    IF COALESCE(NEW.draft_id,OLD.draft_id) IS NULL THEN
      RETURN COALESCE(NEW,OLD);
    END IF;
    SELECT site_id INTO affected_site FROM public.site_content_drafts
    WHERE id=COALESCE(NEW.draft_id,OLD.draft_id);
    reason:='media_changed';
  END IF;
  UPDATE public.onboarding_client_approvals approval
  SET status='invalidated',invalidated_at=transaction_timestamp(),
      invalidation_reason=reason,version=version+1
  WHERE approval.site_id=affected_site
    AND approval.status IN ('pending','approved');
  UPDATE public.onboarding_cases
  SET status='preparing',approved_at=NULL,ready_to_publish_at=NULL,
      current_step='content',version=version+1
  WHERE site_id=affected_site
    AND status IN ('waiting_client_approval','ready_to_publish');
  UPDATE public.onboarding_checklist_items checklist
  SET status='pending',completed_at=NULL,completed_by_user_id=NULL,
    version=checklist.version+1
  FROM public.onboarding_cases case_record
  WHERE case_record.site_id=affected_site
    AND checklist.onboarding_case_id=case_record.id
    AND checklist.item_key IN ('client_approval_valid','publication_ready');
  RETURN COALESCE(NEW,OLD);
END
$function$;
CREATE TRIGGER onboarding_draft_invalidates_approval
AFTER INSERT OR UPDATE ON public.site_content_drafts
FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_onboarding_approval();
CREATE TRIGGER onboarding_template_invalidates_approval
AFTER UPDATE ON public.site_template_assignments
FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_onboarding_approval();
CREATE TRIGGER onboarding_media_invalidates_approval
AFTER INSERT OR UPDATE OR DELETE ON public.content_media_references
FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_onboarding_approval();

ALTER TABLE public.onboarding_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_client_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_intake_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_profiles_onboarding_admin_all
  ON public.tenant_profiles FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY tenant_plan_assignments_onboarding_admin_all
  ON public.tenant_plan_assignments FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY plans_onboarding_admin_select ON public.plans FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());
CREATE POLICY memberships_onboarding_admin_select
  ON public.tenant_memberships FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());

CREATE POLICY onboarding_intake_admin_all
  ON public.onboarding_intake_requests FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_cases_admin_all ON public.onboarding_cases FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_cases_client_select ON public.onboarding_cases FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_cases_client_update ON public.onboarding_cases FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_answers_admin_all ON public.onboarding_answers FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_answers_client_all ON public.onboarding_answers FOR ALL
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND updated_by_user_id=app_context.current_user_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_checklist_admin_all
  ON public.onboarding_checklist_items FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_checklist_client_select
  ON public.onboarding_checklist_items FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id() AND client_visible
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_checklist_client_update
  ON public.onboarding_checklist_items FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND (
      source='client'
      OR item_key IN ('client_approval_valid','publication_ready')
    )
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND (
      source='client'
      OR item_key IN ('client_approval_valid','publication_ready')
    )
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_approvals_admin_all
  ON public.onboarding_client_approvals FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_approvals_client_select
  ON public.onboarding_client_approvals FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_approvals_client_update
  ON public.onboarding_client_approvals FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND status IN ('pending','approved')
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND (
      (
        status IN ('approved','changes_requested')
        AND decided_by_user_id=app_context.current_user_id()
      )
      OR (
        status='invalidated'
        AND invalidation_reason IN ('answers_changed','revision_mismatch')
      )
    )
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY onboarding_history_admin_select
  ON public.onboarding_state_history FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_notes_admin_all
  ON public.onboarding_internal_notes FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY onboarding_intake_notes_admin_all
  ON public.onboarding_intake_internal_notes FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());

REVOKE ALL ON TABLE
  public.onboarding_intake_requests,public.onboarding_cases,
  public.onboarding_answers,public.onboarding_checklist_items,
  public.onboarding_client_approvals,public.onboarding_state_history,
  public.onboarding_internal_notes,public.onboarding_intake_internal_notes
FROM PUBLIC,nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_intake_requests TO nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_cases TO nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_answers TO nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_checklist_items TO nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_client_approvals TO nexi_app;
GRANT SELECT,INSERT ON public.onboarding_state_history TO nexi_app;
GRANT SELECT,INSERT ON public.onboarding_internal_notes TO nexi_app;
GRANT SELECT,INSERT ON public.onboarding_intake_internal_notes TO nexi_app;
GRANT INSERT,UPDATE ON public.tenant_plan_assignments TO nexi_app;

CREATE FUNCTION app_private.onboarding_list_active_admins()
RETURNS TABLE(id uuid,name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    RAISE EXCEPTION 'onboarding admin lookup denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT account.id,account.display_name
  FROM public.platform_staff staff
  JOIN public.users account ON account.id=staff.user_id
  WHERE staff.role='nexi_admin' AND staff.status='active'
    AND account.status='active' AND account.deleted_at IS NULL
  ORDER BY account.display_name;
END
$function$;
REVOKE ALL ON FUNCTION app_private.onboarding_list_active_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.onboarding_list_active_admins() TO nexi_app;

CREATE FUNCTION app_private.onboarding_submit_intake(
  requested_idempotency_key uuid,
  requested_fingerprint text,
  requested_business_name text,
  requested_business_category text,
  requested_contact_name text,
  requested_contact_email text,
  requested_contact_phone text,
  requested_contact_method text,
  requested_city text,
  requested_presence text,
  requested_goal text,
  requested_notes text,
  requested_source_hint text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE created_id uuid;
DECLARE stored_fingerprint text;
BEGIN
  IF requested_business_category NOT IN (
    'restaurant','cafe','hotel','hostel','gym','school','clinic',
    'professional_services','other'
  ) OR requested_contact_method NOT IN ('email','phone','whatsapp')
    OR requested_fingerprint !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'invalid intake' USING ERRCODE='22023'; END IF;
  INSERT INTO public.onboarding_intake_requests(
    idempotency_key,request_fingerprint,source,business_name,business_category,
    contact_name,contact_email_normalized,contact_phone,
    preferred_contact_method,city,current_digital_presence,primary_goal,
    short_notes,source_hint,supported_category
  ) VALUES(
    requested_idempotency_key,requested_fingerprint,'public_form',
    requested_business_name,requested_business_category,requested_contact_name,
    requested_contact_email,requested_contact_phone,requested_contact_method,
    requested_city,requested_presence,requested_goal,requested_notes,
    requested_source_hint,requested_business_category='restaurant'
  )
  ON CONFLICT(idempotency_key) DO NOTHING
  RETURNING id INTO created_id;
  IF created_id IS NULL THEN
    SELECT id,request_fingerprint INTO created_id,stored_fingerprint
    FROM public.onboarding_intake_requests
    WHERE idempotency_key=requested_idempotency_key;
    IF stored_fingerprint IS DISTINCT FROM requested_fingerprint THEN
      RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';
    END IF;
  ELSE
    INSERT INTO public.platform_audit_events(
      action,resource_type,resource_id,outcome,correlation_id,metadata
    ) VALUES(
      'onboarding_intake_received','onboarding_intake',created_id::text,
      'succeeded','public-onboarding',
      jsonb_build_object(
        'source','public_form',
        'supported',requested_business_category='restaurant'
      )
    );
  END IF;
  RETURN created_id;
END
$function$;
REVOKE ALL ON FUNCTION app_private.onboarding_submit_intake(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.onboarding_submit_intake(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) TO nexi_app;

CREATE FUNCTION app_private.onboarding_record_event(
  requested_tenant_id uuid,
  requested_action text,
  requested_resource_type text,
  requested_resource_id text,
  requested_correlation_id text,
  requested_previous_state jsonb DEFAULT NULL,
  requested_new_state jsonb DEFAULT NULL,
  requested_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE actor_id uuid;
DECLARE created_event_id bigint;
BEGIN
  actor_id:=nullif(current_setting('app.current_user_id',true),'')::uuid;
  IF NOT (
    app_private.current_actor_is_nexi_admin()
    OR (
      requested_tenant_id=app_context.current_tenant_id()
      AND app_private.current_actor_is_active_member()
    )
  ) THEN RAISE EXCEPTION 'onboarding audit denied' USING ERRCODE='42501'; END IF;
  IF requested_action NOT IN (
    'onboarding_intake_manual_created','onboarding_intake_reviewed',
    'onboarding_intake_accepted','onboarding_intake_rejected',
    'onboarding_information_requested','onboarding_intake_converted',
    'onboarding_case_created','onboarding_assignee_changed',
    'onboarding_priority_changed','onboarding_answers_saved',
    'onboarding_checklist_changed','onboarding_draft_generated',
    'onboarding_internal_reviewed','onboarding_approval_requested',
    'onboarding_approval_granted','onboarding_changes_requested',
    'onboarding_approval_invalidated','onboarding_ready_to_publish',
    'onboarding_published','onboarding_verified','onboarding_case_paused',
    'onboarding_case_resumed','onboarding_case_canceled',
    'onboarding_case_transitioned','onboarding_access_denied','content_published'
  ) THEN RAISE EXCEPTION 'invalid onboarding event' USING ERRCODE='22023'; END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES(
    actor_id,requested_tenant_id,requested_action,requested_resource_type,
    requested_resource_id,
    CASE WHEN requested_action='onboarding_access_denied'
      THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;
REVOKE ALL ON FUNCTION app_private.onboarding_record_event(
  uuid,text,text,text,text,jsonb,jsonb,jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.onboarding_record_event(
  uuid,text,text,text,text,jsonb,jsonb,jsonb
) TO nexi_app;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT notification_outbox_template_valid;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_template_valid CHECK (
    template_key IN ('new_support_message','onboarding_update')
  );

CREATE OR REPLACE FUNCTION app_private.operation_enqueue_notification(
  requested_tenant_id uuid,
  requested_recipient_user_id uuid,
  requested_template_key text,
  requested_payload jsonb,
  requested_deduplication_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE created_id uuid;
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    IF requested_tenant_id IS DISTINCT FROM app_context.current_tenant_id()
      OR NOT app_private.current_actor_is_active_member()
    THEN
      RAISE EXCEPTION 'notification enqueue denied' USING ERRCODE='42501';
    END IF;
  END IF;
  IF requested_template_key NOT IN ('new_support_message','onboarding_update')
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

ALTER TABLE public.platform_audit_events
  DROP CONSTRAINT platform_audit_action_valid;
ALTER TABLE public.platform_audit_events
  ADD CONSTRAINT platform_audit_action_valid CHECK (
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
      'conversation_priority_changed','support_message_sent','operation_access_denied',
      'template_assigned','template_version_changed','content_initialized',
      'content_draft_saved','content_edit_conflict','content_previewed',
      'content_published','content_restored','content_publish_rejected',
      'content_access_denied','renderer_unknown','public_resolution_failed',
      'media_upload_started','media_upload_completed','media_asset_rejected',
      'media_processing_started','media_processing_completed','media_processing_failed',
      'media_asset_archived','media_asset_restored','media_metadata_updated',
      'media_reference_added','media_reference_removed','media_published',
      'template_previewed','template_changed','media_cross_tenant_blocked',
      'media_quota_exceeded','media_format_rejected','media_dimensions_rejected',
      'restaurant_v2_migrated','media_local_provider_blocked',
      'onboarding_intake_received','onboarding_intake_manual_created',
      'onboarding_intake_reviewed','onboarding_intake_accepted',
      'onboarding_intake_rejected','onboarding_information_requested',
      'onboarding_intake_converted','onboarding_case_created',
      'onboarding_assignee_changed','onboarding_priority_changed',
      'onboarding_answers_saved','onboarding_checklist_changed',
      'onboarding_draft_generated','onboarding_internal_reviewed',
      'onboarding_approval_requested','onboarding_approval_granted',
      'onboarding_changes_requested','onboarding_approval_invalidated',
      'onboarding_ready_to_publish','onboarding_published',
      'onboarding_verified','onboarding_case_paused','onboarding_case_resumed',
      'onboarding_case_canceled','onboarding_case_transitioned',
      'onboarding_access_denied'
    )
  );
ALTER TABLE public.platform_audit_events
  DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events
  ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
    resource_type IN (
      'tenant','invitation','membership','admin_route','client_route',
      'user_profile','tenant_profile','site','deletion_request','domain_request',
      'domain','conversation','message','outbox','template','template_version',
      'template_assignment','template_history','content_draft','content_publication',
      'public_site','media_asset','media_variant','media_reference','media_quota',
      'onboarding_intake','onboarding_case','onboarding_answers',
      'onboarding_checklist','onboarding_approval','onboarding_note'
    )
  );
