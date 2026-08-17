DO $rollback$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.media_assets WHERE storage_provider='supabase'
  ) OR EXISTS (
    SELECT 1 FROM public.media_variants WHERE storage_provider='supabase'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE='55006',
      MESSAGE='cannot rollback alpha media provider while Supabase objects are referenced';
  END IF;
END
$rollback$;

ALTER TABLE public.media_variants
  DROP CONSTRAINT media_variants_provider_valid;
ALTER TABLE public.media_variants
  ADD CONSTRAINT media_variants_provider_valid CHECK (
    storage_provider IN ('bundled','local')
  );

ALTER TABLE public.media_assets
  DROP CONSTRAINT media_assets_provider_valid;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_provider_valid CHECK (
    storage_provider IN ('bundled','local')
  );
