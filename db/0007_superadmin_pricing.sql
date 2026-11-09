-- ZIMBA RENT / migration 0007
-- Super Admin administration and proposed Uganda launch pricing.
-- Applied to development Neon on 9 November 2026.
-- Prices are market-researched suggestions, NOT approved offers or active billing.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS pricing_status text NOT NULL DEFAULT 'proposal'
 CHECK (pricing_status IN ('proposal','approved'));
UPDATE subscription_plans SET price_ugx=0,pricing_status='approved' WHERE code='free';
UPDATE subscription_plans SET price_ugx=49000,pricing_status='proposal' WHERE code='starter';
UPDATE subscription_plans SET price_ugx=149000,pricing_status='proposal' WHERE code='growth';
UPDATE subscription_plans SET price_ugx=349000,pricing_status='proposal' WHERE code='business';
UPDATE subscription_plans SET price_ugx=NULL,pricing_status='proposal' WHERE code='enterprise';

-- Grant only when the exact identity is email-verified and linked with Google.
INSERT INTO platform_admins(auth_user_id)
SELECT u.id FROM neon_auth."user" u
WHERE lower(u.email)='automindsafrica@gmail.com' AND u."emailVerified" IS TRUE
 AND EXISTS (SELECT 1 FROM neon_auth.account a WHERE a."userId"=u.id AND a."providerId"='google')
ON CONFLICT(auth_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.zimba_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS (SELECT 1 FROM platform_admins pa JOIN neon_auth."user" u ON u.id=pa.auth_user_id WHERE pa.auth_user_id=auth.uid() AND lower(u.email)='automindsafrica@gmail.com' AND u."emailVerified" IS TRUE AND pa.disabled_at IS NULL AND EXISTS(SELECT 1 FROM neon_auth.account a WHERE a."userId"=u.id AND a."providerId"='google')) $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE result jsonb; BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; SELECT jsonb_build_object('users',(SELECT count(*) FROM neon_auth."user"),'verifiedUsers',(SELECT count(*) FROM neon_auth."user" WHERE "emailVerified" IS TRUE),'organizations',(SELECT count(*) FROM organizations),'properties',(SELECT count(*) FROM properties WHERE visibility<>'archived'),'activeInvitations',(SELECT count(*) FROM resident_invites WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()),'residentConnections',(SELECT count(*) FROM resident_connections WHERE status='active'),'subscriptions',(SELECT coalesce(jsonb_object_agg(code,qty),'{}'::jsonb) FROM (SELECT code,(SELECT count(*) FROM user_plan_assignments WHERE plan_code=sp.code)::int qty FROM subscription_plans sp) t),'onboarding',(SELECT coalesce(jsonb_object_agg(account_role,qty),'{}'::jsonb) FROM (SELECT account_role,count(*)::int qty FROM account_onboarding GROUP BY account_role) t),'database','connected','observedAt',now()) INTO result; RETURN result; END $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_properties()
 RETURNS TABLE(property_id uuid, title text, city text, visibility text, organization_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; RETURN QUERY SELECT p.id,p.title,p.city,p.visibility,o.name,p.created_at FROM properties p JOIN organizations o ON o.id=p.organization_id ORDER BY p.created_at DESC LIMIT 200; END $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_organizations()
 RETURNS TABLE(organization_id uuid, name text, slug text, property_count bigint, subscription_tier text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; RETURN QUERY SELECT o.id,o.name,o.slug,(SELECT count(*) FROM properties p WHERE p.organization_id=o.id AND p.visibility<>'archived'),s.plan_code,o.created_at FROM organizations o LEFT JOIN organization_subscriptions s ON s.organization_id=o.id ORDER BY o.created_at DESC LIMIT 200; END $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_activity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE result jsonb; BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; SELECT jsonb_build_object('tierChanges',(SELECT coalesce(jsonb_agg(jsonb_build_object('email',u.email,'from',e.previous_plan,'to',e.new_plan,'reason',e.reason,'at',e.occurred_at) ORDER BY e.occurred_at DESC),'[]'::jsonb) FROM (SELECT * FROM user_plan_events ORDER BY occurred_at DESC LIMIT 35) e JOIN neon_auth."user" u ON u.id=e.auth_user_id),'recentAccounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('email',u.email,'createdAt',u."createdAt",'verified',u."emailVerified") ORDER BY u."createdAt" DESC),'[]'::jsonb) FROM (SELECT * FROM neon_auth."user" ORDER BY "createdAt" DESC LIMIT 15) u)) INTO result; RETURN result; END $function$


CREATE OR REPLACE FUNCTION public.zimba_admin_plans()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE result jsonb; BEGIN IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF; SELECT COALESCE(jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'price',s.price_ugx,'status',s.pricing_status,'cap',s.entitlements->'properties','users',(SELECT count(*) FROM user_plan_assignments up WHERE up.plan_code=s.code)) ORDER BY s.rank),'[]'::jsonb) INTO result FROM subscription_plans s WHERE s.is_active IS TRUE; RETURN result; END $function$


REVOKE ALL ON FUNCTION public.zimba_is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_is_super_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_properties() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_properties() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_organizations() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_activity() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_plans() TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Guarded admin_user_directory and admin_assign_plan remain in migration 0003.
-- No direct browser grants to platform_admins, neon_auth.user or the audit tables.
