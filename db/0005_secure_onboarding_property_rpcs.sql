-- Zimba Rent migration 0005: authenticated onboarding and server-enforced property limits.
-- Installed and verified on Neon development database on 9 November 2026.
-- Apply after 0004_role_onboarding_free_plan.sql.
-- Uses Neon Data API JWT identity via auth.uid(). Never expose owner credentials.
CREATE TABLE IF NOT EXISTS resident_public_references (
 auth_user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
 reference text NOT NULL UNIQUE DEFAULT ('ZR-' || upper(encode(gen_random_bytes(6),'hex'))),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE resident_public_references ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_onboarding_role ON account_onboarding(account_role,completed_at);
CREATE INDEX IF NOT EXISTS idx_properties_org_created ON properties(organization_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.my_onboarding()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_auth uuid:=auth.uid(); v_row account_onboarding%ROWTYPE; v_ref text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_row FROM account_onboarding WHERE auth_user_id=v_auth;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT reference INTO v_ref FROM resident_public_references WHERE auth_user_id=v_auth;
 RETURN jsonb_build_object('role',v_row.account_role,'area',v_row.preferred_area,
  'budget',v_row.budget_preference,'firstProperty',v_row.first_property_name,
  'completedAt',v_row.completed_at,'tenantRef',v_ref,'version',v_row.onboarding_version);
END $function$


CREATE OR REPLACE FUNCTION public.finish_my_onboarding(p_role text, p_area text DEFAULT NULL::text, p_budget text DEFAULT NULL::text, p_first_property_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_auth uuid:=auth.uid(); v_email text; v_name text; v_app uuid; v_org uuid;
 v_existing_role text; v_initial boolean:=false; v_name_prop text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT email,name INTO v_email,v_name FROM neon_auth."user"
 WHERE id=v_auth AND "emailVerified" IS TRUE;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('landlord','manager','tenant','renter','buyer') THEN
  RAISE EXCEPTION 'Invalid account role' USING ERRCODE='22023';
 END IF;
 IF length(coalesce(p_area,''))>120 OR length(coalesce(p_budget,''))>120 OR
  length(coalesce(p_first_property_name,''))>100 THEN
  RAISE EXCEPTION 'Onboarding details too long' USING ERRCODE='22023';
 END IF;
 SELECT account_role INTO v_existing_role FROM account_onboarding WHERE auth_user_id=v_auth FOR UPDATE;
 IF v_existing_role IS NOT NULL AND v_existing_role<>p_role THEN
  RAISE EXCEPTION 'To change your account type, request a verified role change' USING ERRCODE='42501';
 END IF;
 v_initial:=v_existing_role IS NULL;
 INSERT INTO account_onboarding(auth_user_id,account_role,preferred_area,budget_preference,first_property_name,onboarding_version,completed_at)
 VALUES(v_auth,p_role,nullif(btrim(p_area),''),nullif(btrim(p_budget),''),nullif(btrim(p_first_property_name),''),1,now())
 ON CONFLICT(auth_user_id) DO UPDATE SET preferred_area=EXCLUDED.preferred_area,
  budget_preference=EXCLUDED.budget_preference,
  first_property_name=EXCLUDED.first_property_name,updated_at=now();
 IF p_role='tenant' THEN
  INSERT INTO resident_public_references(auth_user_id) VALUES(v_auth)
  ON CONFLICT(auth_user_id) DO NOTHING;
 END IF;
 IF p_role IN ('landlord','manager') THEN
  SELECT id INTO v_app FROM app_users WHERE external_auth_id=v_auth::text;
  IF v_app IS NULL THEN
   INSERT INTO app_users(external_auth_id,email,display_name)
   VALUES(v_auth::text,v_email,coalesce(nullif(v_name,''),v_email))
   ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name
   WHERE app_users.external_auth_id=EXCLUDED.external_auth_id
   RETURNING id INTO v_app;
   IF v_app IS NULL THEN RAISE EXCEPTION 'Account identity conflict' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT m.organization_id INTO v_org FROM memberships m
   WHERE m.user_id=v_app AND m.status='active' AND m.role IN ('owner','admin','manager') LIMIT 1;
  IF v_org IS NULL THEN
   INSERT INTO organizations(name,slug) VALUES(
     coalesce(nullif(v_name,''),'Zimba member')||' Properties',
     'zimba-'||replace(gen_random_uuid()::text,'-',''))
   RETURNING id INTO v_org;
   INSERT INTO memberships(organization_id,user_id,role)
    VALUES(v_org,v_app,'owner');
  END IF;
  INSERT INTO user_plan_assignments(auth_user_id,plan_code,status)
   VALUES(v_auth,'free','active') ON CONFLICT(auth_user_id) DO NOTHING;
  INSERT INTO organization_subscriptions(organization_id,plan_code,status,assigned_by)
   VALUES(v_org,'free','active',v_auth) ON CONFLICT(organization_id) DO NOTHING;
  v_name_prop=nullif(btrim(p_first_property_name),'');
  IF v_initial AND v_name_prop IS NOT NULL THEN
   INSERT INTO properties(organization_id,title,city,category,listing_intent,visibility,created_by)
   VALUES(v_org,v_name_prop,nullif(btrim(p_area),''),'mixed','internal','draft',v_app);
  END IF;
 END IF;
 RETURN public.my_onboarding();
END $function$


CREATE OR REPLACE FUNCTION public.my_properties()
 RETURNS TABLE(id uuid, title text, city text, category text, visibility text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_auth uuid:=auth.uid();
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT p.id,p.title,p.city,p.category,p.visibility,p.created_at
 FROM properties p
 JOIN memberships m ON m.organization_id=p.organization_id AND m.status='active'
 JOIN app_users a ON a.id=m.user_id
 WHERE a.external_auth_id=v_auth::text
   AND m.role IN ('owner','admin','manager')
 ORDER BY p.created_at DESC
 LIMIT 500;
END $function$


CREATE OR REPLACE FUNCTION public.create_my_property(p_title text, p_city text, p_category text DEFAULT 'mixed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_auth uuid:=auth.uid();v_app uuid;v_org uuid;v_plan text;v_limit int;v_count int;v_property uuid;v_role text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT account_role INTO v_role FROM account_onboarding WHERE auth_user_id=v_auth AND completed_at IS NOT NULL;
 IF v_role NOT IN ('landlord','manager') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Landlord or manager account required' USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(p_title),'') IS NULL OR length(p_title)>100
   OR length(coalesce(p_city,''))>120
   OR p_category NOT IN ('apartment','house','land','commercial','mixed') THEN
  RAISE EXCEPTION 'Invalid property details' USING ERRCODE='22023';
 END IF;
 SELECT a.id INTO v_app FROM app_users a
 JOIN neon_auth."user" u ON u.id=v_auth
 WHERE a.external_auth_id=v_auth::text AND u."emailVerified" IS TRUE;
 IF v_app IS NULL THEN RAISE EXCEPTION 'Verified identity required' USING ERRCODE='42501'; END IF;
 SELECT m.organization_id INTO v_org FROM memberships m
 WHERE m.user_id=v_app AND m.role IN ('owner','admin','manager') AND m.status='active'
 LIMIT 1;
 IF v_org IS NULL THEN RAISE EXCEPTION 'Managed organisation missing' USING ERRCODE='42501'; END IF;
 -- Lock the organisation row so concurrent insertions cannot bypass property limits.
 PERFORM 1 FROM organizations WHERE id=v_org FOR UPDATE;
 SELECT up.plan_code INTO v_plan FROM user_plan_assignments up
  WHERE up.auth_user_id=v_auth AND up.status IN ('active','trial');
 v_plan=coalesce(v_plan,'free');
 SELECT (sp.entitlements->>'properties')::int INTO v_limit
 FROM subscription_plans sp WHERE sp.code=v_plan AND sp.is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not active' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_count FROM properties WHERE organization_id=v_org AND visibility<>'archived';
 IF v_limit IS NOT NULL AND v_count>=v_limit THEN
  RAISE EXCEPTION 'Your subscription property limit has been reached' USING ERRCODE='42501';
 END IF;
 INSERT INTO properties(organization_id,title,city,category,listing_intent,visibility,created_by)
 VALUES(v_org,btrim(p_title),nullif(btrim(p_city),''),p_category,'internal','draft',v_app)
 RETURNING id INTO v_property;
 RETURN jsonb_build_object('success',true,'id',v_property,'plan',v_plan,'propertyCount',v_count+1);
END $function$


REVOKE ALL ON FUNCTION public.my_onboarding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_my_onboarding(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_properties() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_my_property(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_onboarding(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_properties() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_property(text,text,text) TO authenticated;

-- Invite issuance and acceptance are NOT activated. A tenant's short public
-- reference is informational and never sufficient to grant property access.
-- Do not enable direct table grants on resident_invites, resident_connections
-- or any of the financial, card, resident or audit tables.
