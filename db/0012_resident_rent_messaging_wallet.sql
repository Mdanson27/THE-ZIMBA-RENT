-- ZIMBA RENT 0012 · resident account, month-end billing dates and secure messaging
-- Verified in the development branch 2026-11-09.
-- This migration does NOT turn on payment collection. Zimba wallet entries
-- cannot be credited from the browser. Sample deposits are frontend-only.
ALTER TABLE resident_invites ADD COLUMN IF NOT EXISTS rent_start_date date;
ALTER TABLE resident_connections ADD COLUMN IF NOT EXISTS rent_start_date date;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS requested_by_auth_id uuid REFERENCES neon_auth."user"(id);
CREATE TABLE IF NOT EXISTS zimba_resident_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES resident_connections(id),
  sender_auth_id uuid NOT NULL REFERENCES neon_auth."user"(id),
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zimba_resident_messages_thread_idx ON zimba_resident_messages(connection_id, created_at DESC);
ALTER TABLE zimba_resident_messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_wallets (
  resident_auth_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id),
  reference text NOT NULL UNIQUE DEFAULT ('ZW-'||upper(encode(gen_random_bytes(6),'hex'))),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zimba_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_auth_id uuid NOT NULL REFERENCES zimba_wallets(resident_auth_id),
  amount_ugx bigint NOT NULL CHECK(amount_ugx<>0),
  payment_reference text NOT NULL UNIQUE,
  verification_source text NOT NULL CHECK(verification_source IN ('provider_verified','reconciled_bank','rent_debit')),
  provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zimba_wallet_entries_resident_idx ON zimba_wallet_entries(resident_auth_id, created_at DESC);
ALTER TABLE zimba_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE zimba_wallet_entries ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.zimba_connection_messages(p_connection uuid)
 RETURNS TABLE(id uuid, sender text, body text, sent_at timestamp with time zone, mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); c resident_connections%ROWTYPE;
BEGIN
 SELECT * INTO c FROM resident_connections WHERE resident_connections.id=p_connection AND status='active';
 IF NOT FOUND OR uid IS NULL THEN RAISE EXCEPTION 'Active connection required' USING ERRCODE='42501'; END IF;
 IF uid<>c.resident_auth_user_id AND NOT EXISTS(SELECT 1 FROM memberships m JOIN app_users a ON a.id=m.user_id WHERE a.external_auth_id=uid::text AND m.organization_id=c.organization_id AND m.role IN ('owner','admin','manager') AND m.status='active') THEN RAISE EXCEPTION 'Not authorized for this conversation' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT msg.id,coalesce(u.name,'Member'),msg.body,msg.created_at,msg.sender_auth_id=uid FROM (SELECT * FROM zimba_resident_messages WHERE connection_id=p_connection ORDER BY created_at DESC LIMIT 100) msg JOIN neon_auth."user" u ON u.id=msg.sender_auth_id ORDER BY msg.created_at ASC;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_invite_with_rent_start(p_property uuid, p_reference text, p_unit uuid, p_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE res jsonb;inv uuid;
BEGIN
 PERFORM public.zimba_my_manager_org();
 IF p_start IS NULL OR p_start < current_date - 365 OR p_start>current_date+interval '3 years' THEN RAISE EXCEPTION 'Enter a valid rent start date' USING ERRCODE='22023'; END IF;
 res:=public.zimba_invite_by_reference(p_property,p_reference,p_unit);
 inv:=(res->>'invitationId')::uuid;
 UPDATE resident_invites SET rent_start_date=p_start WHERE id=inv;
 RETURN res||jsonb_build_object('rentStart',p_start,'billingCycle','calendar_month_end');
END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_threads()
 RETURNS TABLE(connection_id uuid, resident_name text, property_title text, unit_number text, last_message_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();
BEGIN
 RETURN QUERY SELECT c.id,u.name,p.title,un.unit_number,(SELECT max(m.created_at) FROM zimba_resident_messages m WHERE m.connection_id=c.id) FROM resident_connections c JOIN properties p ON p.id=c.property_id JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id LEFT JOIN units un ON un.id=c.unit_id WHERE c.organization_id=org AND c.status='active' ORDER BY c.linked_at DESC LIMIT 200;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_resident_service_request(p_connection uuid, p_issue text, p_priority text DEFAULT 'medium'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();c resident_connections%ROWTYPE;rid uuid;
BEGIN
 SELECT * INTO c FROM resident_connections WHERE id=p_connection AND resident_auth_user_id=uid AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Active tenant home required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_issue,''))) NOT BETWEEN 8 AND 1200 OR p_priority NOT IN ('low','medium','high','urgent') THEN RAISE EXCEPTION 'Provide a valid issue and priority' USING ERRCODE='22023'; END IF;
 INSERT INTO maintenance_requests(organization_id,property_id,unit_id,issue,priority,status,requested_by_auth_id) VALUES(c.organization_id,c.property_id,c.unit_id,btrim(p_issue),p_priority,'open',uid) RETURNING id INTO rid;
 RETURN jsonb_build_object('success',true,'id',rid);
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
 INSERT INTO resident_connections(organization_id,resident_auth_user_id,property_id,unit_id,linked_from_invitation,rent_start_date)
 VALUES(v_inv.organization_id,v_auth,v_inv.property_id,v_inv.unit_id,v_inv.id,v_inv.rent_start_date);
 UPDATE resident_invites SET accepted_at=now() WHERE id=v_inv.id;
 IF v_inv.unit_id IS NOT NULL THEN UPDATE units SET status='occupied' WHERE id=v_inv.unit_id; END IF;
 RETURN jsonb_build_object('success',true,'status','approved');
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_send_connection_message(p_connection uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); c resident_connections%ROWTYPE; msgid uuid;
BEGIN
 SELECT * INTO c FROM resident_connections WHERE resident_connections.id=p_connection AND status='active';
 IF NOT FOUND OR uid IS NULL THEN RAISE EXCEPTION 'Active residence connection required' USING ERRCODE='42501'; END IF;
 IF uid<>c.resident_auth_user_id AND NOT EXISTS(SELECT 1 FROM memberships m JOIN app_users a ON a.id=m.user_id WHERE a.external_auth_id=uid::text AND m.organization_id=c.organization_id AND m.role IN ('owner','admin','manager') AND m.status='active') THEN RAISE EXCEPTION 'Messaging is restricted to this resident and their property management team' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Message must contain 1–2000 characters' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM zimba_resident_messages WHERE sender_auth_id=uid AND created_at>now()-interval '1 minute')>=12 THEN RAISE EXCEPTION 'Messaging rate limit exceeded' USING ERRCODE='42900'; END IF;
 INSERT INTO zimba_resident_messages(connection_id,sender_auth_id,body) VALUES(p_connection,uid,btrim(p_body)) RETURNING id INTO msgid;
 RETURN jsonb_build_object('success',true,'id',msgid);
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('homes',coalesce(jsonb_agg(jsonb_build_object('connectionId',c.id,'propertyId',p.id,'property',p.title,'city',p.city,'address',p.address_line,'manager',o.name,'room',u.unit_number,'monthlyRent',u.monthly_rent_ugx,'rentStart',c.rent_start_date,'nextDue',CASE WHEN c.rent_start_date IS NULL THEN NULL ELSE (date_trunc('month',greatest(current_date,c.rent_start_date)::timestamp)+interval '1 month - 1 day')::date END,'status',c.status) ORDER BY c.linked_at DESC),'[]'::jsonb)) INTO result
 FROM resident_connections c JOIN properties p ON p.id=c.property_id AND p.organization_id=c.organization_id JOIN organizations o ON o.id=c.organization_id LEFT JOIN units u ON u.id=c.unit_id AND u.property_id=c.property_id WHERE c.resident_auth_user_id=uid AND c.status='active';
 RETURN result;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_inbox_v2()
 RETURNS TABLE(id uuid, property_title text, organization_name text, unit_number text, monthly_rent_ugx bigint, rent_start_date date, invited_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT i.id,p.title,o.name,u.unit_number,u.monthly_rent_ugx,i.rent_start_date,i.created_at,i.expires_at
 FROM resident_invites i JOIN properties p ON p.id=i.property_id AND p.organization_id=i.organization_id JOIN organizations o ON o.id=i.organization_id LEFT JOIN units u ON u.id=i.unit_id AND u.property_id=i.property_id
 WHERE i.invited_auth_user_id=uid AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() ORDER BY i.created_at DESC LIMIT 100;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_service_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();j jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('issue',m.issue,'status',m.status,'priority',m.priority,'property',p.title,'date',m.created_at) ORDER BY m.created_at DESC),'[]'::jsonb) INTO j FROM (SELECT m.* FROM maintenance_requests m JOIN resident_connections c ON c.organization_id=m.organization_id AND c.property_id=m.property_id AND (m.unit_id=c.unit_id OR (m.unit_id IS NULL AND c.unit_id IS NULL)) WHERE c.resident_auth_user_id=uid AND c.status='active' AND m.requested_by_auth_id=uid ORDER BY m.created_at DESC LIMIT 100) m JOIN properties p ON p.id=m.property_id;
 RETURN j;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_wallet()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();ref text;balance bigint;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM account_onboarding WHERE auth_user_id=uid AND account_role='tenant') THEN RAISE EXCEPTION 'Tenant account required' USING ERRCODE='42501'; END IF;
 INSERT INTO zimba_wallets(resident_auth_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT w.reference INTO ref FROM zimba_wallets w WHERE w.resident_auth_id=uid;
 SELECT coalesce(sum(amount_ugx),0) INTO balance FROM zimba_wallet_entries WHERE resident_auth_id=uid;
 RETURN jsonb_build_object('reference',ref,'verifiedBalance',balance,'currency','UGX','depositsEnabled',false,'withdrawalsEnabled',false,'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',e.amount_ugx,'reference',e.payment_reference,'date',e.created_at) ORDER BY e.created_at DESC),'[]'::jsonb) FROM (SELECT * FROM zimba_wallet_entries WHERE resident_auth_id=uid ORDER BY created_at DESC LIMIT 50)e));
END $function$

REVOKE ALL ON FUNCTION public.zimba_connection_messages(p_connection uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_connection_messages(p_connection uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_invite_with_rent_start(p_property uuid, p_reference text, p_unit uuid, p_start date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_invite_with_rent_start(p_property uuid, p_reference text, p_unit uuid, p_start date) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_threads() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_resident_service_request(p_connection uuid, p_issue text, p_priority text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_resident_service_request(p_connection uuid, p_issue text, p_priority text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_respond_resident_invite(p_invitation uuid, p_approve boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_respond_resident_invite(p_invitation uuid, p_approve boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_send_connection_message(p_connection uuid, p_body text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_send_connection_message(p_connection uuid, p_body text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_home() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_home() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_inbox_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_inbox_v2() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_service_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_service_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_wallet() TO authenticated;
NOTIFY pgrst, 'reload schema';
