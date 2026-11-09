-- Zimba Rent migration 0009 · Subscription assignment and policy consent.
-- 9 November 2026. Installed on development Neon; replay after migrations 0001–0008.
-- These are operator-authored policies; final lawyer review and verified physical/legal details
-- remain pre-commercial launch requirements.
INSERT INTO legal_policies(policy_type,version,title,body,effective_at,published) VALUES('privacy','1.0','Zimba Rent Privacy Policy','ZIMBA RENT PRIVACY POLICY
Effective: 9 November 2026
Service: Zimba Rent, operated by AutoMinds Africa
Privacy contact: automindsafrica@gmail.com

1. WHAT THIS POLICY COVERS
This notice explains how Zimba Rent collects, uses, shares and safeguards personal data when people register, search for property, manage properties, connect with landlords or tenants, and use our communications and support services.

2. INFORMATION WE MAY PROCESS
Account identity: name, email address, authentication provider identifier, verification and session information.
Property activity: property listings, ownership or management organisation membership, locations, enquiries and search preferences.
Tenancy: invitation references and acceptance, linked properties, maintenance requests and lease-related details when enabled.
Financial records: rent charges, amounts, dates and references when a supported financial service is active. Zimba is not currently collecting card payment details for subscriptions.
Technical information: security logs, browser or device information, limited diagnostics and usage events necessary to protect or improve the service.
We aim to avoid collecting unnecessary sensitive information.

3. WHY INFORMATION IS USED
To create and protect accounts, verify identity, provide user-selected services, connect residents to approved properties, communicate service updates, provide support, investigate misuse, fulfil lawful requests and maintain reliable operations. Marketing communications, if introduced, will use a separate appropriate basis and opt-out control.

4. LAWFUL BASIS AND CHOICES
We process information where necessary to provide requested services or legitimate security activities, to comply with law, or based on valid consent when required. Creating a tenant connection requires a deliberate verified invitation. Refusing optional information may limit corresponding functions. You can request access to and correction of information, subject to applicable law.

5. WHO CAN ACCESS INFORMATION
Authorised platform administrators may access account and operational records needed for support and security. Property owners or managers may see records within organisations they control. Tenants can view only homes to which they have been securely linked. We use Neon for authentication and database hosting; operational infrastructure and selected service providers may process data under applicable arrangements. We do not sell conversation or customer data to advertisers.

6. INTERNATIONAL PROCESSING
Infrastructure providers may host or process information outside Uganda. Where cross-border transfers arise, the responsible operator must verify and implement safeguards required by Ugandan law before enabling affected processing.

7. SECURITY
We use verified sign-in, restricted access functions, encrypted transport and access separation. No platform can promise absolute security. Report suspicious account activity promptly to automindsafrica@gmail.com. Do not share your password or tenant invitation token.

8. RETENTION AND DELETION
We aim to retain personal information only for service purposes or periods required by law. Account data, financial records and security logs may have different retention requirements. A detailed retention schedule and deletion process will be published before production processing of sensitive tenancy or payment information. You may request account closure or personal-data review using the contact above.

9. YOUR RIGHTS
Subject to Ugandan law, you may request information about data held, access, correction, restriction or objection where legally applicable, and lodge complaints with the Personal Data Protection Office. We will assess each request and respond in accordance with applicable requirements.

10. COOKIES AND AUTHENTICATION
The website may use necessary authentication session cookies and local preferences to keep the app functioning securely. Non-essential tracking or marketing technologies should require additional disclosure and consent before introduction.

11. CHILDREN
Zimba is designed for adults arranging property relationships. We do not knowingly invite children to create direct landlord or tenant accounts without an appropriate lawful arrangement.

12. POLICY UPDATES AND CONTACT
Material changes may require a new acceptance. Contact automindsafrica@gmail.com with privacy questions. The operator must publish its full verified legal and physical contact details before commercial launch.','2026-11-08T21:00:00.000Z',true) ON CONFLICT(policy_type,version) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,published=true;

INSERT INTO legal_policies(policy_type,version,title,body,effective_at,published) VALUES('terms','1.0','Zimba Rent Terms of Use','ZIMBA RENT TERMS OF USE
Effective: 9 November 2026
Service operator: Zimba Rent, operated by AutoMinds Africa
Contact: automindsafrica@gmail.com

1. ABOUT THIS SERVICE
Zimba Rent provides an online service for discovering property, managing property portfolios, communicating with residents and organising property records. The service currently includes features under controlled release. Availability of specific services is shown within your account.

2. ELIGIBILITY AND ACCOUNTS
You must provide truthful registration information, be at least 18 years old or otherwise legally capable of entering relevant agreements, safeguard your credentials and notify us of suspected unauthorised access. Accounts are personal to the verified individual. You must not share credentials or impersonate another person.

3. ACCOUNT ROLES AND PERMISSIONS
Landlords and property managers may create and manage property records they are authorised to control. Tenants may access only homes to which they have been securely invited. Property seekers may browse and contact property representatives when contact functions are enabled. Users must not access records outside their permitted organisations or tenancies.

4. PROPERTY LISTINGS AND RESPONSIBILITY
A property owner or authorised manager is responsible for accurate listings, lawful right to list or let property, applicable permissions, property condition and interactions with prospective tenants and buyers. Listings are not guaranteed to be available, accurate or legally verified unless expressly marked as verified. Zimba is not automatically a landlord, letting agent or contracting party to a property transaction.

5. LEASES, MAINTENANCE AND FINANCIAL RECORDS
Landlord and tenant obligations arise from their separate agreements and applicable law. Zimba may organise lease information, requests and financial records when those services are activated. A record shown in the platform does not, by itself, prove that funds were received, a lease was executed or maintenance was completed. Do not rely on unavailable payment or tenancy features as proof of a completed transaction.

6. SUBSCRIPTIONS AND CHARGES
Personal property-seeker and tenant accounts do not require a property-management subscription. Landlords may use a Free tier subject to the published one-property limit. Paid tiers, fees, billing, renewal, cancellation and refund rules will become binding only when explicitly approved and displayed before a paid order. Proposed prices are not charges and no payment is collected merely by selecting a tier. Administrators can assign plan entitlements within Zimba''s access controls.

7. ACCEPTABLE USE
You must not publish fraudulent or discriminatory listings, unlawfully process another person''s information, upload malicious code, scrape or overload the service, circumvent security, harass other users, or use false tenancy invitations. We may restrict access to address fraud, security incidents, legal requests or violations, consistent with applicable law.

8. DATA AND PRIVACY
Personal data is handled under the Privacy Policy. Landlords and managers are responsible for having lawful authority to upload tenant information. Where applicable we may act as an independent data controller for accounts and as a service provider or processor for records controlled by property managers, subject to the actual arrangements.

9. INTELLECTUAL PROPERTY
Zimba branding, software and design remain owned by their respective holders. You retain lawful rights in information you submit and grant the limited permission necessary to host and display it for the requested service. You are responsible for having rights to photographs, documents and other uploads.

10. SERVICE AVAILABILITY AND CHANGES
We work to maintain reliable services but cannot guarantee uninterrupted uptime. We may modify services for security, law or operational requirements. Material changes to accepted policy versions will require renewed acknowledgement where appropriate.

11. COMPLAINTS, DISPUTES AND LAW
Please contact automindsafrica@gmail.com with platform complaints. Property disputes ordinarily remain between the relevant contracting parties. These terms are subject to applicable Ugandan law and mandatory consumer and data-protection rights, which these terms do not exclude.

12. CONTACT AND RECORDS
For account, privacy or policy questions write to automindsafrica@gmail.com. Information about the responsible legal entity, registration details, physical address and transaction-specific commercial terms must be made available before any paid consumer transaction is offered.','2026-11-08T21:00:00.000Z',true) ON CONFLICT(policy_type,version) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,published=true;
-- Unonboarded, verified users get status=pending (no active subscription).
-- This prevents conflating pending invitations with administratively suspended accounts.
ALTER TABLE user_plan_assignments DROP CONSTRAINT IF EXISTS user_plan_assignments_status_check;
ALTER TABLE user_plan_assignments ADD CONSTRAINT user_plan_assignments_status_check CHECK(status IN ('pending','trial','active','suspended','cancelled'));

CREATE OR REPLACE FUNCTION public.admin_assign_plan(p_target_user uuid, p_plan_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid:=auth.uid();v_previous text;v_role text;v_org uuid;v_status text;
BEGIN
 IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator access denied' USING ERRCODE='42501'; END IF;
 IF p_target_user IS NULL OR NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_target_user AND "emailVerified" IS TRUE)
 THEN RAISE EXCEPTION 'Verified user not found' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_target_user AND lower(email)='automindsafrica@gmail.com') THEN
  RAISE EXCEPTION 'The platform administrator is not a landlord subscription account' USING ERRCODE='42501';
 END IF;
 SELECT account_role INTO v_role FROM account_onboarding WHERE auth_user_id=p_target_user;
 IF v_role IN ('tenant','renter','buyer') THEN
  RAISE EXCEPTION 'Management plans cannot be assigned to tenant or property seeker accounts' USING ERRCODE='42501';
 END IF;
 IF p_plan_code IS NULL OR NOT EXISTS(SELECT 1 FROM subscription_plans WHERE code=p_plan_code AND is_active IS TRUE) THEN
  RAISE EXCEPTION 'Invalid subscription plan' USING ERRCODE='22023'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Provide an audit reason of 5 to 300 characters' USING ERRCODE='22023'; END IF;
 -- An unonboarded user has no role yet: stage the assignment as suspended.
 -- This is not an active entitlement until landlord/manager onboarding is verified.
 v_status=CASE WHEN v_role IN ('landlord','manager') THEN 'active' ELSE 'pending' END;
 SELECT plan_code INTO v_previous FROM user_plan_assignments WHERE auth_user_id=p_target_user FOR UPDATE;
 INSERT INTO user_plan_assignments(auth_user_id,plan_code,status,assigned_by,assigned_at,notes)
 VALUES(p_target_user,p_plan_code,v_status,v_actor,now(),btrim(p_reason))
 ON CONFLICT(auth_user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status=EXCLUDED.status,
 assigned_by=EXCLUDED.assigned_by,assigned_at=now(),notes=EXCLUDED.notes;
 IF v_status='active' THEN
  SELECT m.organization_id INTO v_org FROM memberships m JOIN app_users a ON a.id=m.user_id
  WHERE a.external_auth_id=p_target_user::text AND m.role='owner' AND m.status='active' LIMIT 1;
  IF v_org IS NOT NULL THEN
   INSERT INTO organization_subscriptions(organization_id,plan_code,status,assigned_by,assigned_at,notes)
   VALUES(v_org,p_plan_code,'active',v_actor,now(),btrim(p_reason))
   ON CONFLICT(organization_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status='active',
    assigned_by=EXCLUDED.assigned_by,assigned_at=now(),notes=EXCLUDED.notes;
  END IF;
 END IF;
 INSERT INTO user_plan_events(auth_user_id,actor_auth_user_id,previous_plan,new_plan,reason)
 VALUES(p_target_user,v_actor,v_previous,p_plan_code,btrim(p_reason));
 RETURN jsonb_build_object('success',true,'userId',p_target_user,'plan',p_plan_code,'status',v_status,'organizationUpdated',v_org IS NOT NULL);
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
 IF (SELECT count(DISTINCT current_policy.policy_type) FROM public.zimba_current_policies() current_policy JOIN legal_policies l ON l.policy_type=current_policy.policy_type AND l.version=current_policy.version JOIN policy_acceptances pa ON pa.policy_id=l.id AND pa.auth_user_id=v_auth)<>2 THEN
  RAISE EXCEPTION 'Review and accept the current Terms of Use and Privacy Policy before onboarding' USING ERRCODE='42501';
 END IF;
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
   VALUES(v_auth,'free','active') ON CONFLICT(auth_user_id) DO UPDATE
   SET status='active' WHERE user_plan_assignments.status='pending';
   -- Pre-approved tier assignments become active only after landlord/manager setup.
  INSERT INTO organization_subscriptions(organization_id,plan_code,status,assigned_by)
   VALUES(v_org,(SELECT plan_code FROM user_plan_assignments WHERE auth_user_id=v_auth),'active',v_auth)
   ON CONFLICT(organization_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status='active';
  v_name_prop=nullif(btrim(p_first_property_name),'');
  IF v_initial AND v_name_prop IS NOT NULL THEN
   INSERT INTO properties(organization_id,title,city,category,listing_intent,visibility,created_by)
   VALUES(v_org,v_name_prop,nullif(btrim(p_area),''),'mixed','internal','draft',v_app);
  END IF;
 END IF;
 RETURN public.my_onboarding();
END $function$


CREATE OR REPLACE FUNCTION public.zimba_accept_policies()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_auth uuid:=auth.uid(); v_count int; BEGIN IF v_auth IS NULL OR NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=v_auth AND "emailVerified" IS TRUE) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF; SELECT count(*) INTO v_count FROM public.zimba_current_policies(); IF v_count<>2 THEN RAISE EXCEPTION 'Current policies unavailable' USING ERRCODE='55000'; END IF; INSERT INTO policy_acceptances(auth_user_id,policy_id,source) SELECT v_auth,l.id,'web:reviewed-both-v1' FROM legal_policies l JOIN public.zimba_current_policies() p ON p.policy_type=l.policy_type AND p.version=l.version ON CONFLICT(auth_user_id,policy_id) DO NOTHING; RETURN public.zimba_policy_status(); END $function$


CREATE OR REPLACE FUNCTION public.zimba_current_policies()
 RETURNS TABLE(policy_type text, version text, title text, body text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT DISTINCT ON (p.policy_type) p.policy_type,p.version,p.title,p.body FROM legal_policies p WHERE p.published=true AND p.effective_at<=now() AND p.policy_type IN ('terms','privacy') ORDER BY p.policy_type,p.effective_at DESC,p.created_at DESC $function$


CREATE OR REPLACE FUNCTION public.zimba_policy_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_auth uuid:=auth.uid(); result jsonb; BEGIN IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF; SELECT jsonb_build_object('terms',coalesce(bool_or(p.policy_type='terms' AND a.id IS NOT NULL),false),'privacy',coalesce(bool_or(p.policy_type='privacy' AND a.id IS NOT NULL),false)) INTO result FROM public.zimba_current_policies() p LEFT JOIN legal_policies l ON l.policy_type=p.policy_type AND l.version=p.version LEFT JOIN policy_acceptances a ON a.policy_id=l.id AND a.auth_user_id=v_auth; RETURN result; END $function$


REVOKE ALL ON FUNCTION public.zimba_current_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_current_policies() TO authenticated,anonymous;
REVOKE ALL ON FUNCTION public.zimba_policy_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_policy_status() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_accept_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_accept_policies() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_assign_plan(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finish_my_onboarding(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_my_onboarding(text,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
