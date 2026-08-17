ALTER TABLE public.media_assets
  DROP CONSTRAINT media_assets_provider_valid;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_provider_valid CHECK (
    storage_provider IN ('bundled','local','supabase')
  );

ALTER TABLE public.media_variants
  DROP CONSTRAINT media_variants_provider_valid;
ALTER TABLE public.media_variants
  ADD CONSTRAINT media_variants_provider_valid CHECK (
    storage_provider IN ('bundled','local','supabase')
  );
