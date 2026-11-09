-- ZIMBA RENT migration 0010 — live maintenance, finance, organisation settings and portfolio pulse.
-- Applied to Neon development on 9 November 2026.
-- All tenant data remains organisation-scoped by auth.uid() through Zimba manager permissions.
-- Expenses are bookkeeping records, NOT verified payments or funds transfer.
CREATE TABLE IF NOT EXISTS property_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid REFERENCES properties(id),
 description text NOT NULL,
 category text NOT NULL CHECK(category IN ('maintenance','utilities','taxes','management','other')),
 amount_ugx bigint NOT NULL CHECK(amount_ugx>=0),
 expense_date date NOT NULL DEFAULT CURRENT_DATE,
 created_by uuid NOT NULL REFERENCES neon_auth."user"(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE property_expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_property_expenses_org_date ON property_expenses(organization_id,expense_date DESC);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"maintenance":true,"financial":true,"property":true}'::jsonb;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS assigned_note text;

CREATE OR REPLACE FUNCTION public.zimba_create_maintenance(p_property uuid, p_issue text, p_priority text DEFAULT 'medium'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid; BEGIN IF p_property IS NULL OR NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org AND visibility<>'archived') THEN RAISE EXCEPTION 'Property not found in your organisation' USING ERRCODE='42501'; END IF; IF length(btrim(coalesce(p_issue,''))) NOT BETWEEN 8 AND 1200 OR p_priority NOT IN ('low','medium','high','urgent') THEN RAISE EXCEPTION 'Valid issue and priority are required' USING ERRCODE='22023'; END IF; INSERT INTO maintenance_requests(organization_id,property_id,issue,priority,status) VALUES(v_org,p_property,btrim(p_issue),p_priority,'open') RETURNING id INTO v_id; RETURN jsonb_build_object('id',v_id,'status','open'); END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();out jsonb; BEGIN SELECT jsonb_build_object('organization',o.name,'properties',(SELECT count(*) FROM properties p WHERE p.organization_id=v_org AND p.visibility<>'archived'),'maintenanceOpen',(SELECT count(*) FROM maintenance_requests m WHERE m.organization_id=v_org AND m.status IN ('open','in_progress')),'maintenanceUrgent',(SELECT count(*) FROM maintenance_requests m WHERE m.organization_id=v_org AND m.status<>'completed' AND m.status<>'cancelled' AND m.priority='urgent'),'residents',(SELECT count(*) FROM resident_connections c WHERE c.organization_id=v_org AND c.status='active'),'rentDue',(SELECT coalesce(sum(r.amount_ugx),0) FROM rent_charges r WHERE r.organization_id=v_org AND r.status IN ('due','partial')),'recordedExpenses',(SELECT coalesce(sum(e.amount_ugx),0) FROM property_expenses e WHERE e.organization_id=v_org),'latestMaintenance',(SELECT coalesce(jsonb_agg(jsonb_build_object('issue',s.issue,'status',s.status,'priority',s.priority,'property',s.title)),'[]'::jsonb) FROM (SELECT m.issue,m.status,m.priority,p.title FROM maintenance_requests m JOIN properties p ON p.id=m.property_id WHERE m.organization_id=v_org ORDER BY m.created_at DESC LIMIT 4) s)) INTO out FROM organizations o WHERE o.id=v_org; RETURN out; END $function$


CREATE OR REPLACE FUNCTION public.zimba_my_financials()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();out jsonb; BEGIN SELECT jsonb_build_object('receivables',(SELECT coalesce(sum(amount_ugx),0) FROM rent_charges WHERE organization_id=v_org AND status IN ('due','partial')),'recordedExpenses',(SELECT coalesce(sum(amount_ugx),0) FROM property_expenses WHERE organization_id=v_org),'charges',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',r.due_date,'amount',r.amount_ugx,'status',r.status,'reference',r.external_reference) ORDER BY r.due_date DESC),'[]'::jsonb) FROM (SELECT * FROM rent_charges WHERE organization_id=v_org ORDER BY due_date DESC LIMIT 100) r),'expenses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'date',e.expense_date,'amount',e.amount_ugx,'category',e.category,'description',e.description,'property',p.title) ORDER BY e.expense_date DESC),'[]'::jsonb) FROM (SELECT * FROM property_expenses WHERE organization_id=v_org ORDER BY expense_date DESC LIMIT 100) e LEFT JOIN properties p ON p.id=e.property_id)) INTO out; RETURN out; END $function$


CREATE OR REPLACE FUNCTION public.zimba_my_maintenance()
 RETURNS TABLE(id uuid, property_id uuid, property_title text, issue text, priority text, status text, created_at timestamp with time zone, assigned_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org(); BEGIN RETURN QUERY SELECT m.id,m.property_id,p.title,m.issue,m.priority,m.status,m.created_at,m.assigned_note FROM maintenance_requests m JOIN properties p ON p.id=m.property_id AND p.organization_id=m.organization_id WHERE m.organization_id=v_org ORDER BY m.created_at DESC LIMIT 300; END $function$


CREATE OR REPLACE FUNCTION public.zimba_my_manager_org()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v uuid; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF; SELECT m.organization_id INTO v FROM app_users a JOIN memberships m ON m.user_id=a.id JOIN account_onboarding ob ON ob.auth_user_id=auth.uid() WHERE a.external_auth_id=auth.uid()::text AND m.status='active' AND m.role IN ('owner','admin','manager') AND ob.account_role IN ('landlord','manager') AND ob.completed_at IS NOT NULL ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1; IF v IS NULL THEN RAISE EXCEPTION 'Active property management account required' USING ERRCODE='42501'; END IF; RETURN v; END $function$


CREATE OR REPLACE FUNCTION public.zimba_my_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();result jsonb; BEGIN SELECT jsonb_build_object('organization',o.name,'area',b.preferred_area,'role',b.account_role,'notifications',a.notification_preferences,'email',a.email,'createdAt',o.created_at) INTO result FROM organizations o JOIN app_users a ON a.external_auth_id=auth.uid()::text JOIN account_onboarding b ON b.auth_user_id=auth.uid() WHERE o.id=v_org; RETURN result; END $function$


CREATE OR REPLACE FUNCTION public.zimba_record_expense(p_description text, p_amount_ugx bigint, p_category text, p_property uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid; BEGIN IF length(btrim(coalesce(p_description,''))) NOT BETWEEN 4 AND 300 OR p_amount_ugx IS NULL OR p_amount_ugx<=0 OR p_amount_ugx>100000000000 OR p_category NOT IN ('maintenance','utilities','taxes','management','other') THEN RAISE EXCEPTION 'Invalid expense details' USING ERRCODE='22023'; END IF; IF p_property IS NOT NULL AND NOT EXISTS (SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF; INSERT INTO property_expenses(organization_id,property_id,description,category,amount_ugx,created_by) VALUES(v_org,p_property,btrim(p_description),p_category,p_amount_ugx,auth.uid()) RETURNING id INTO v_id; RETURN jsonb_build_object('id',v_id,'amount',p_amount_ugx,'status','recorded'); END $function$


CREATE OR REPLACE FUNCTION public.zimba_update_maintenance(p_request uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid; BEGIN IF p_status NOT IN ('open','in_progress','completed','cancelled') OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Invalid maintenance update' USING ERRCODE='22023'; END IF; UPDATE maintenance_requests SET status=p_status,assigned_note=nullif(btrim(p_note),''),updated_at=now() WHERE id=p_request AND organization_id=v_org RETURNING id INTO v_id; IF v_id IS NULL THEN RAISE EXCEPTION 'Maintenance record not found' USING ERRCODE='42501'; END IF; RETURN jsonb_build_object('id',v_id,'status',p_status); END $function$


CREATE OR REPLACE FUNCTION public.zimba_update_settings(p_org_name text, p_area text, p_notifications jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid:=public.zimba_my_manager_org();v_auth uuid:=auth.uid(); BEGIN IF length(btrim(coalesce(p_org_name,''))) NOT BETWEEN 2 AND 100 OR length(coalesce(p_area,''))>120 OR jsonb_typeof(p_notifications)<>'object' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF; IF (SELECT m.role FROM memberships m JOIN app_users a ON a.id=m.user_id WHERE a.external_auth_id=v_auth::text AND m.organization_id=v_org AND m.status='active' LIMIT 1)='owner' THEN UPDATE organizations SET name=btrim(p_org_name) WHERE id=v_org; END IF; UPDATE account_onboarding SET preferred_area=nullif(btrim(p_area),''),updated_at=now() WHERE auth_user_id=v_auth; UPDATE app_users SET notification_preferences=jsonb_build_object('maintenance',coalesce((p_notifications->>'maintenance')::boolean,true),'financial',coalesce((p_notifications->>'financial')::boolean,true),'property',coalesce((p_notifications->>'property')::boolean,true)) WHERE external_auth_id=v_auth::text; RETURN public.zimba_my_settings(); END $function$


REVOKE ALL ON FUNCTION public.zimba_create_maintenance(p_property uuid, p_issue text, p_priority text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_create_maintenance(p_property uuid, p_issue text, p_priority text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_my_financials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_my_financials() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_my_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_my_maintenance() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_my_manager_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_my_manager_org() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_my_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_my_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_record_expense(p_description text, p_amount_ugx bigint, p_category text, p_property uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_record_expense(p_description text, p_amount_ugx bigint, p_category text, p_property uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_update_maintenance(p_request uuid, p_status text, p_note text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_update_maintenance(p_request uuid, p_status text, p_note text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_update_settings(p_org_name text, p_area text, p_notifications jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_update_settings(p_org_name text, p_area text, p_notifications jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
