DO $migration$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.site_template_assignments
    WHERE template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) OR EXISTS(
    SELECT 1 FROM public.site_content_publications
    WHERE template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) OR EXISTS(
    SELECT 1 FROM public.site_template_assignment_history
    WHERE previous_template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
       OR new_template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) OR EXISTS(
    SELECT 1 FROM public.onboarding_cases
    WHERE target_template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) OR EXISTS(
    SELECT 1 FROM public.onboarding_client_approvals
    WHERE template_version_id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0015 while Pulso Club has functional references'
      USING ERRCODE='55006';
  END IF;

  DELETE FROM public.template_versions
  WHERE id='a8cccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND template_id='a8bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    AND renderer_key='gym-pulso-v1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pulso Club template version does not match migration 0015'
      USING ERRCODE='55000';
  END IF;

  DELETE FROM public.templates
  WHERE id='a8bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    AND key='gym-pulso'
    AND industry_key='gym';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pulso Club template does not match migration 0015'
      USING ERRCODE='55000';
  END IF;
END
$migration$;
