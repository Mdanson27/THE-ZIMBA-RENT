-- Zimba Rent migration 0006: secure resident linking through invitations.
-- Installed on Neon development branch 9 November 2026.
-- Requires migration 0004 and 0005. Uses pgcrypto for SHA-256 token hashes.
-- References are not access credentials; the intended tenant must authenticate
-- and explicitly accept a time-limited, single-use invitation.

CREATE OR REPLACE FUNCTION public.create_resident_invite(p_property uuid, p_tenant_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid:=auth.uid();v_app uuid;v_org uuid;v_tenant uuid;v_token text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM account_onboarding WHERE auth_user_id=v_actor AND account_role IN ('landlord','manager') AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Manager account required' USING ERRCODE='42501'; END IF;
 SELECT a.id INTO v_app FROM app_users a JOIN neon_auth."user" u ON u.id=v_actor
 WHERE a.external_auth_id=v_actor::text AND u."emailVerified" IS TRUE;
 IF v_app IS NULL THEN RAISE EXCEPTION 'Verified landlord account required' USING ERRCODE='42501'; END IF;
 SELECT p.organization_id INTO v_org
 FROM properties p JOIN memberships m ON m.organization_id=p.organization_id
 WHERE p.id=p_property AND m.user_id=v_app AND m.status='active'
  AND m.role IN ('owner','admin','manager') AND p.visibility<>'archived';
 IF v_org IS NULL THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 IF p_tenant_reference IS NULL OR p_tenant_reference !~ '^ZR-[A-F0-9]{12}$' THEN
  RAISE EXCEPTION 'Invalid resident reference' USING ERRCODE='22023'; END IF;
 SELECT r.auth_user_id INTO v_tenant FROM resident_public_references r
 JOIN account_onboarding a ON a.auth_user_id=r.auth_user_id AND a.account_role='tenant'
 JOIN neon_auth."user" u ON u.id=r.auth_user_id AND u."emailVerified" IS TRUE
 WHERE r.reference=p_tenant_reference;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Resident reference could not be verified' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM resident_connections WHERE resident_auth_user_id=v_tenant AND property_id=p_property AND status='active') THEN
  RAISE EXCEPTION 'Resident already connected to this property' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM resident_invites WHERE invited_by_auth_user_id=v_actor AND created_at>now()-interval '24 hours')>=20 THEN
  RAISE EXCEPTION 'Invitation limit reached for today' USING ERRCODE='42501'; END IF;
 v_token=encode(gen_random_bytes(24),'hex');
 INSERT INTO resident_invites(organization_id,property_id,invited_auth_user_id,invited_by_auth_user_id,invitation_code_hash,expires_at)
 VALUES(v_org,p_property,v_tenant,v_actor,encode(digest(v_token,'sha256'),'hex'),now()+interval '7 days');
 RETURN jsonb_build_object('token',v_token,'expiresInDays',7);
END $function$


CREATE OR REPLACE FUNCTION public.accept_resident_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_auth uuid:=auth.uid();v_inv resident_invites%ROWTYPE;v_property text;v_city text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM account_onboarding a JOIN neon_auth."user" u ON u.id=a.auth_user_id
  WHERE a.auth_user_id=v_auth AND a.account_role='tenant' AND u."emailVerified" IS TRUE) THEN
  RAISE EXCEPTION 'Verified tenant account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' THEN
  RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_inv FROM resident_invites
 WHERE invitation_code_hash=encode(digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR v_inv.invited_auth_user_id<>v_auth
   OR v_inv.revoked_at IS NOT NULL OR v_inv.accepted_at IS NOT NULL
   OR v_inv.expires_at<=now() THEN
  RAISE EXCEPTION 'Invitation expired, already used, or not issued to your account' USING ERRCODE='42501'; END IF;
 SELECT p.title,p.city INTO v_property,v_city FROM properties p
 WHERE p.id=v_inv.property_id AND p.organization_id=v_inv.organization_id AND p.visibility<>'archived';
 IF v_property IS NULL THEN RAISE EXCEPTION 'Property unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO resident_connections(organization_id,resident_auth_user_id,property_id,unit_id,linked_from_invitation)
 VALUES(v_inv.organization_id,v_auth,v_inv.property_id,v_inv.unit_id,v_inv.id);
 UPDATE resident_invites SET accepted_at=now() WHERE id=v_inv.id;
 RETURN jsonb_build_object('success',true,'property',v_property,'city',v_city);
END $function$


CREATE OR REPLACE FUNCTION public.my_residences()
 RETURNS TABLE(property_title text, city text, linked_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_auth uuid:=auth.uid();
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.title,p.city,c.linked_at,c.status
 FROM resident_connections c JOIN properties p ON p.id=c.property_id AND p.organization_id=c.organization_id
 WHERE c.resident_auth_user_id=v_auth AND c.status='active'
 ORDER BY c.linked_at DESC;
END $function$


REVOKE ALL ON FUNCTION public.create_resident_invite(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_resident_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_residences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_resident_invite(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_resident_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_residences() TO authenticated;

-- All resident_invites/resident_connections tables remain without blanket
-- SELECT/INSERT/UPDATE privileges for browser roles. Add offline notification,
-- revocation, expiry cleanup, unit verification, and invite telemetry before launch.
