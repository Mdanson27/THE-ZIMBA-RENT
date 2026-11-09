-- ZIMBA RENT migration 0008
-- Enriched directory and auditable landlord-only tier assignments.
-- Applied to development Neon on November 9, 2026.
-- Updates both user and owner organisation subscriptions in one transaction.
-- Do not grant direct table writes to authenticated or anonymous clients.

CREATE OR REPLACE FUNCTION public.admin_assign_plan(p_target_user uuid, p_plan_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid:=auth.uid();v_previous text;v_role text;v_org uuid;
BEGIN
 IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF;
 IF p_target_user IS NULL OR NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_target_user AND "emailVerified" IS TRUE) THEN
  RAISE EXCEPTION 'Verified user not found' USING ERRCODE='22023'; END IF;
 SELECT account_role INTO v_role FROM account_onboarding WHERE auth_user_id=p_target_user;
 IF v_role NOT IN ('landlord','manager') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Management subscription is available only to landlords and property managers' USING ERRCODE='42501'; END IF;
 IF p_plan_code IS NULL OR NOT EXISTS(SELECT 1 FROM subscription_plans WHERE code=p_plan_code AND is_active IS TRUE) THEN
  RAISE EXCEPTION 'Invalid subscription plan' USING ERRCODE='22023'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Provide an audit reason of 5–300 characters' USING ERRCODE='22023'; END IF;
 SELECT plan_code INTO v_previous FROM user_plan_assignments WHERE auth_user_id=p_target_user FOR UPDATE;
 INSERT INTO user_plan_assignments(auth_user_id,plan_code,status,assigned_by,assigned_at,notes)
 VALUES(p_target_user,p_plan_code,'active',v_actor,now(),btrim(p_reason))
 ON CONFLICT(auth_user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status='active',
 assigned_by=EXCLUDED.assigned_by,assigned_at=now(),notes=EXCLUDED.notes;
 SELECT m.organization_id INTO v_org FROM memberships m JOIN app_users a ON a.id=m.user_id
 WHERE a.external_auth_id=p_target_user::text AND m.role='owner' AND m.status='active' LIMIT 1;
 IF v_org IS NOT NULL THEN
  INSERT INTO organization_subscriptions(organization_id,plan_code,status,assigned_by,assigned_at,notes)
  VALUES(v_org,p_plan_code,'active',v_actor,now(),btrim(p_reason))
  ON CONFLICT(organization_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status='active',
  assigned_by=EXCLUDED.assigned_by,assigned_at=now(),notes=EXCLUDED.notes;
 END IF;
 INSERT INTO user_plan_events(auth_user_id,actor_auth_user_id,previous_plan,new_plan,reason)
 VALUES(p_target_user,v_actor,v_previous,p_plan_code,btrim(p_reason));
 RETURN jsonb_build_object('success',true,'userId',p_target_user,'plan',p_plan_code,'organizationUpdated',v_org IS NOT NULL);
END $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_accounts()
 RETURNS TABLE(user_id uuid, display_name text, email text, email_verified boolean, account_role text, plan_code text, plan_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; RETURN QUERY SELECT u.id,u.name,u.email,u."emailVerified",ob.account_role,up.plan_code,up.status,u."createdAt" FROM neon_auth."user" u LEFT JOIN account_onboarding ob ON ob.auth_user_id=u.id LEFT JOIN user_plan_assignments up ON up.auth_user_id=u.id ORDER BY u."createdAt" DESC LIMIT 500; END $function$


REVOKE ALL ON FUNCTION public.admin_assign_plan(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zimba_admin_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_admin_accounts() TO authenticated;
NOTIFY pgrst, 'reload schema';
