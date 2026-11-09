-- Migration 0011: room-level inventory, interactive occupancy planning and resident in-app approvals.
-- Deployed to Neon development 9 November 2026; replay after migrations 0001–0010.
-- Tenant reference is a lookup handle, never a login credential.
-- Pending invitation displays grey; approval links verified tenant and marks unit occupied.
-- All manager RPCs derive authorized organization through zimba_my_manager_org().
-- Each unit belongs to a specific property; unit price is in UGX per month.
CREATE OR REPLACE FUNCTION public.zimba_invite_by_reference(p_property uuid, p_reference text, p_unit uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_actor uuid:=auth.uid();v_org uuid:=public.zimba_my_manager_org();v_tenant uuid;v_inv uuid;v_unit_status text;v_name text;
 BEGIN
  IF p_reference IS NULL OR upper(btrim(p_reference)) !~ '^ZR-[A-F0-9]{12}$' THEN RAISE EXCEPTION 'Enter a valid tenant reference (ZR- followed by 12 characters)' USING ERRCODE='22023'; END IF;
  SELECT r.auth_user_id,u.name INTO v_tenant,v_name FROM resident_public_references r
    JOIN account_onboarding a ON a.auth_user_id=r.auth_user_id AND a.account_role='tenant'
    JOIN neon_auth."user" u ON u.id=r.auth_user_id AND u."emailVerified" IS TRUE
  WHERE r.reference=upper(btrim(p_reference));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No verified tenant matches that reference' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org AND visibility<>'archived') THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM properties WHERE id=p_property FOR UPDATE;
  IF p_unit IS NOT NULL THEN
    SELECT status INTO v_unit_status FROM units WHERE id=p_unit AND property_id=p_property AND organization_id=v_org FOR UPDATE;
    IF v_unit_status IS NULL THEN RAISE EXCEPTION 'Unit does not belong to this property' USING ERRCODE='42501'; END IF;
    IF v_unit_status IN ('occupied','maintenance') OR EXISTS(SELECT 1 FROM resident_connections WHERE unit_id=p_unit AND status='active') THEN
      RAISE EXCEPTION 'Unit is occupied or unavailable' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM resident_invites WHERE unit_id=p_unit AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) THEN
      RAISE EXCEPTION 'This room already has a pending tenant invitation' USING ERRCODE='22023';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM resident_connections WHERE property_id=p_property AND resident_auth_user_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'Tenant already connected to this property' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM resident_invites WHERE property_id=p_property AND invited_auth_user_id=v_tenant AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'Invitation already pending for this tenant' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM resident_invites WHERE invited_by_auth_user_id=v_actor AND created_at>now()-interval '24 hours')>=20 THEN RAISE EXCEPTION 'Daily invitation limit reached' USING ERRCODE='42501'; END IF;
  INSERT INTO resident_invites(organization_id,property_id,unit_id,invited_auth_user_id,invited_by_auth_user_id,invitation_code_hash,expires_at)
  VALUES(v_org,p_property,p_unit,v_tenant,v_actor,encode(digest(gen_random_bytes(32),'sha256'),'hex'),now()+interval '7 days')
  RETURNING id INTO v_inv;
  RETURN jsonb_build_object('success',true,'invitationId',v_inv,'status','pending','tenantName',v_name);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_units(p_property uuid)
 RETURNS TABLE(id uuid, unit_number text, floor_label text, monthly_rent_ugx bigint, status text, pending_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org();
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM properties WHERE properties.id=p_property AND organization_id=v_org) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT u.id,u.unit_number,u.floor_label,u.monthly_rent_ugx,u.status,
    (SELECT count(*) FROM resident_invites i WHERE i.unit_id=u.id AND i.organization_id=v_org AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()) AS pending_count
  FROM units u WHERE u.property_id=p_property AND u.organization_id=v_org ORDER BY u.floor_label,u.unit_number LIMIT 500;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_property_details(p_property uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org();v jsonb;
 BEGIN
 SELECT jsonb_build_object('id',id,'name',title,'description',description,'address',address_line,'city',city,'askingPrice',asking_price_ugx,'category',category,'visibility',visibility) INTO v FROM properties WHERE id=p_property AND organization_id=v_org;
 IF v IS NULL THEN RAISE EXCEPTION 'Property not found' USING ERRCODE='42501'; END IF;
 RETURN v;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_resident_requests(p_property uuid)
 RETURNS TABLE(id uuid, tenant_name text, tenant_reference text, property_title text, unit_number text, request_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org();
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM properties WHERE properties.id=p_property AND organization_id=v_org) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT i.id,u.name,r.reference,p.title,un.unit_number,
  CASE WHEN i.accepted_at IS NOT NULL THEN 'approved'
    WHEN i.revoked_at IS NOT NULL THEN 'declined'
    WHEN i.expires_at<=now() THEN 'expired' ELSE 'pending' END,
  i.created_at
 FROM resident_invites i JOIN properties p ON p.id=i.property_id
 JOIN neon_auth."user" u ON u.id=i.invited_auth_user_id
 JOIN resident_public_references r ON r.auth_user_id=u.id
 LEFT JOIN units un ON un.id=i.unit_id
 WHERE i.organization_id=v_org AND i.property_id=p_property ORDER BY i.created_at DESC LIMIT 100;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_respond_resident_invite(p_invitation uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_auth uuid:=auth.uid();v_inv resident_invites%ROWTYPE;v_status text;v_unit text;
 BEGIN
 IF v_auth IS NULL OR NOT EXISTS(SELECT 1 FROM account_onboarding WHERE auth_user_id=v_auth AND account_role='tenant' AND completed_at IS NOT NULL)
  THEN RAISE EXCEPTION 'Verified tenant account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_inv FROM resident_invites WHERE id=p_invitation FOR UPDATE;
 IF NOT FOUND OR v_inv.invited_auth_user_id<>v_auth OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=now() THEN
  RAISE EXCEPTION 'Invitation is unavailable or does not belong to your account' USING ERRCODE='42501'; END IF;
 IF p_approve IS NOT TRUE THEN
   UPDATE resident_invites SET revoked_at=now() WHERE id=p_invitation;
   RETURN jsonb_build_object('success',true,'status','declined');
 END IF;
 PERFORM 1 FROM properties WHERE id=v_inv.property_id AND organization_id=v_inv.organization_id FOR UPDATE;
 IF v_inv.unit_id IS NOT NULL THEN
  SELECT status INTO v_status FROM units WHERE id=v_inv.unit_id AND property_id=v_inv.property_id AND organization_id=v_inv.organization_id FOR UPDATE;
  IF v_status NOT IN ('vacant','reserved') OR v_status IS NULL THEN RAISE EXCEPTION 'This room is no longer available' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM resident_connections WHERE unit_id=v_inv.unit_id AND status='active') THEN RAISE EXCEPTION 'Room is already assigned' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM resident_connections WHERE resident_auth_user_id=v_auth AND property_id=v_inv.property_id AND status='active') THEN RAISE EXCEPTION 'Already connected' USING ERRCODE='42501'; END IF;
 INSERT INTO resident_connections(organization_id,resident_auth_user_id,property_id,unit_id,linked_from_invitation)
 VALUES(v_inv.organization_id,v_auth,v_inv.property_id,v_inv.unit_id,v_inv.id);
 UPDATE resident_invites SET accepted_at=now() WHERE id=v_inv.id;
 IF v_inv.unit_id IS NOT NULL THEN UPDATE units SET status='occupied' WHERE id=v_inv.unit_id; END IF;
 RETURN jsonb_build_object('success',true,'status','approved');
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_save_unit(p_property uuid, p_unit uuid, p_number text, p_floor text, p_rent bigint, p_status text DEFAULT 'vacant'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org(); v_id uuid; v_old text;
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org AND visibility<>'archived') THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_number,''))) NOT BETWEEN 1 AND 30 OR length(coalesce(p_floor,''))>50 OR p_rent IS NULL OR p_rent<0 OR p_rent>100000000000 OR p_status NOT IN ('vacant','occupied','maintenance','reserved') THEN RAISE EXCEPTION 'Invalid unit information' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM properties WHERE id=p_property FOR UPDATE;
  IF p_unit IS NULL THEN
    IF (SELECT count(*) FROM units WHERE property_id=p_property)>=500 THEN RAISE EXCEPTION 'Maximum 500 units per property reached' USING ERRCODE='22023'; END IF;
    INSERT INTO units(organization_id,property_id,unit_number,floor_label,monthly_rent_ugx,status)
    VALUES(v_org,p_property,btrim(p_number),NULLIF(btrim(p_floor),''),p_rent,p_status) RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_old FROM units WHERE id=p_unit AND organization_id=v_org AND property_id=p_property FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Unit not found in this property' USING ERRCODE='42501'; END IF;
    IF p_status<>'occupied' AND EXISTS(SELECT 1 FROM resident_connections WHERE unit_id=p_unit AND status='active') THEN RAISE EXCEPTION 'End the active tenancy before marking the unit available' USING ERRCODE='42501'; END IF;
    UPDATE units SET unit_number=btrim(p_number),floor_label=NULLIF(btrim(p_floor),''),monthly_rent_ugx=p_rent,status=p_status WHERE id=p_unit RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success',true,'unitId',v_id);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_inbox()
 RETURNS TABLE(id uuid, property_title text, organization_name text, unit_number text, invited_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_auth uuid:=auth.uid();
 BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT i.id,p.title,o.name,u.unit_number,i.created_at,i.expires_at
 FROM resident_invites i JOIN properties p ON p.id=i.property_id JOIN organizations o ON o.id=i.organization_id
 LEFT JOIN units u ON u.id=i.unit_id
 WHERE i.invited_auth_user_id=v_auth AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
 ORDER BY i.created_at DESC LIMIT 100;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_update_property(p_property uuid, p_title text, p_description text, p_address text, p_price bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org();v uuid;
 BEGIN
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 100 OR length(coalesce(p_description,''))>5000 OR length(coalesce(p_address,''))>240 OR (p_price IS NOT NULL AND (p_price<0 OR p_price>100000000000000)) THEN RAISE EXCEPTION 'Invalid property details' USING ERRCODE='22023'; END IF;
 UPDATE properties SET title=btrim(p_title),description=NULLIF(btrim(p_description),''),address_line=NULLIF(btrim(p_address),''),asking_price_ugx=p_price,updated_at=now() WHERE id=p_property AND organization_id=v_org RETURNING id INTO v;
 IF v IS NULL THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('success',true,'propertyId',v);
 END $function$


REVOKE ALL ON FUNCTION public.zimba_invite_by_reference(p_property uuid, p_reference text, p_unit uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_invite_by_reference(p_property uuid, p_reference text, p_unit uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_units(p_property uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_units(p_property uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_property_details(p_property uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_property_details(p_property uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_resident_requests(p_property uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_resident_requests(p_property uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_respond_resident_invite(p_invitation uuid, p_approve boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_respond_resident_invite(p_invitation uuid, p_approve boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_save_unit(p_property uuid, p_unit uuid, p_number text, p_floor text, p_rent bigint, p_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_save_unit(p_property uuid, p_unit uuid, p_number text, p_floor text, p_rent bigint, p_status text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_inbox() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_update_property(p_property uuid, p_title text, p_description text, p_address text, p_price bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_update_property(p_property uuid, p_title text, p_description text, p_address text, p_price bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.zimba_generate_units(p_property uuid, p_floor text, p_prefix text, p_start integer, p_count integer, p_rent bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org(); v_index integer;v_number text;v_created integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org AND visibility<>'archived') THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_floor,''))>50 OR length(coalesce(p_prefix,''))>15 OR p_start IS NULL OR p_start<0 OR p_start>9999 OR p_count NOT BETWEEN 1 AND 100 OR p_rent IS NULL OR p_rent<0 OR p_rent>100000000000 THEN RAISE EXCEPTION 'Invalid room generation settings' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM properties WHERE id=p_property FOR UPDATE;
 IF (SELECT count(*) FROM units WHERE property_id=p_property)+p_count>500 THEN RAISE EXCEPTION 'Property has a maximum of 500 units' USING ERRCODE='22023'; END IF;
 FOR v_index IN 0..(p_count-1) LOOP
  v_number=btrim(coalesce(p_prefix,''))||lpad((p_start+v_index)::text,3,'0');
  IF length(v_number)>30 THEN RAISE EXCEPTION 'Room number is too long' USING ERRCODE='22023'; END IF;
  INSERT INTO units(organization_id,property_id,unit_number,floor_label,monthly_rent_ugx,status)
  VALUES(v_org,p_property,v_number,nullif(btrim(p_floor),''),p_rent,'vacant');
  v_created=v_created+1;
 END LOOP;
 RETURN jsonb_build_object('success',true,'unitsCreated',v_created);
END $function$

REVOKE ALL ON FUNCTION public.zimba_generate_units(uuid,text,text,integer,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_generate_units(uuid,text,text,integer,integer,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.zimba_resident_profiles(p_property uuid)
 RETURNS TABLE(resident_name text, resident_email text, resident_reference text, unit_number text, linked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.name,u.email,r.reference,un.unit_number,c.linked_at
 FROM resident_connections c
 JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id
 JOIN resident_public_references r ON r.auth_user_id=c.resident_auth_user_id
 LEFT JOIN units un ON un.id=c.unit_id
 WHERE c.organization_id=v_org AND c.property_id=p_property AND c.status='active'
 ORDER BY c.linked_at DESC LIMIT 200;
END $function$

REVOKE ALL ON FUNCTION public.zimba_resident_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_resident_profiles(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
