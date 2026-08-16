INSERT INTO public.templates(
  id,key,display_name,industry_key,status,description
) VALUES(
  'a8bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'gym-pulso',
  'Pulso Club',
  'gym',
  'active',
  'Plantilla de Gimnasio disponible exclusivamente para preview privada.'
);

INSERT INTO public.template_versions(
  id,template_id,version,renderer_key,content_schema_key,
  minimum_schema_version,maximum_schema_version,status,released_at,preview_key
) VALUES(
  'a8cccccc-cccc-4ccc-8ccc-cccccccccccc',
  'a8bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  1,
  'gym-pulso-v1',
  'gym.v1',
  1,
  1,
  'active',
  NULL,
  'gym-pulso'
);
