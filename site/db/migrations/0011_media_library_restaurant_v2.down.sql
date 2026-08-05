DROP FUNCTION IF EXISTS app_private.resolve_publication_media_manifest(uuid);
DROP FUNCTION IF EXISTS app_private.resolve_public_media(uuid,text,text);
DROP FUNCTION IF EXISTS app_private.media_record_event(
  uuid,text,text,text,text,text,jsonb
);

-- A local/test rollback cannot retain events whose action/resource constraints
-- disappear with this migration. Object bytes are intentionally left to the
-- separately guarded media:clean-test command.
DELETE FROM public.platform_audit_events
WHERE action IN (
  'media_upload_started','media_upload_completed','media_asset_rejected',
  'media_processing_started','media_processing_completed','media_processing_failed',
  'media_asset_archived','media_asset_restored','media_metadata_updated',
  'media_reference_added','media_reference_removed','media_published',
  'template_previewed','template_changed','media_cross_tenant_blocked',
  'media_quota_exceeded','media_format_rejected','media_dimensions_rejected',
  'restaurant_v2_migrated','media_local_provider_blocked'
);

DROP TRIGGER IF EXISTS site_template_assignment_history
  ON public.site_template_assignments;
DROP FUNCTION IF EXISTS app_private.record_template_assignment_history();
DROP TRIGGER IF EXISTS publication_media_references_immutable
  ON public.content_media_references;
DROP FUNCTION IF EXISTS app_private.prevent_publication_media_changes();
DROP TRIGGER IF EXISTS content_media_reference_consistency
  ON public.content_media_references;
DROP FUNCTION IF EXISTS app_private.enforce_content_media_reference();
DROP TRIGGER IF EXISTS media_variants_asset_consistency
  ON public.media_variants;
DROP FUNCTION IF EXISTS app_private.enforce_media_variant_asset();
DROP TRIGGER IF EXISTS media_assets_site_consistency ON public.media_assets;
DROP FUNCTION IF EXISTS app_private.enforce_media_asset_site();

DROP TABLE IF EXISTS public.site_template_assignment_history;
DROP TABLE IF EXISTS public.content_media_references;
DROP TABLE IF EXISTS public.media_variants;
DROP TABLE IF EXISTS public.media_assets;
DROP TABLE IF EXISTS public.plan_media_capabilities;

ALTER TABLE public.template_versions DROP CONSTRAINT template_versions_preview_key_valid;
ALTER TABLE public.template_versions DROP COLUMN preview_key;
DROP POLICY IF EXISTS template_versions_client_catalog_select
  ON public.template_versions;
DROP POLICY IF EXISTS templates_client_catalog_select ON public.templates;
DROP POLICY IF EXISTS template_assignments_client_update
  ON public.site_template_assignments;
DROP TRIGGER IF EXISTS client_template_assignment_update_fields
  ON public.site_template_assignments;
DROP FUNCTION IF EXISTS app_private.protect_client_template_assignment_update();
