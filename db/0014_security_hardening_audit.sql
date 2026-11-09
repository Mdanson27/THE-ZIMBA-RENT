-- ZIMBA RENT 0014 Security hardening and auditable rent-start changes
-- Browser roles never receive direct ledger or audit table access.
-- The throttle only applies to authenticated writes via server-side triggers.
CREATE TABLE IF NOT EXISTS zimba_security_rate_buckets(
 actor_auth_id uuid NOT NULL,
 action text NOT NULL,
 bucket_start timestamptz NOT NULL,
 request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0),
 PRIMARY KEY(actor_auth_id,action,bucket_start)
);
ALTER TABLE zimba_security_rate_buckets ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_security_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_auth_id uuid,
 organization_id uuid,
 action text NOT NULL,
 resource text NOT NULL,
 resource_id uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS zimba_security_audit_time_idx ON zimba_security_audit(occurred_at DESC);
CREATE INDEX IF NOT EXISTS zimba_security_audit_org_idx ON zimba_security_audit(organization_id,occurred_at DESC);
ALTER TABLE zimba_security_audit ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.zimba_admin_security_audit(p_limit integer DEFAULT 100, p_action text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE result jsonb;
 BEGIN
 IF NOT public.zimba_is_super_admin() THEN RAISE EXCEPTION 'Super administrator required' USING ERRCODE='42501'; END IF;
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid audit limit' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('events',coalesce(jsonb_agg(jsonb_build_object('id',e.id,'at',e.occurred_at,'actor',coalesce(u.email,'System event'),'organization',e.organization_id,'action',e.action,'resource',e.resource,'resourceId',e.resource_id,'details',e.details) ORDER BY e.occurred_at DESC),'[]'::jsonb),'total',(SELECT count(*) FROM zimba_security_audit))
 INTO result
 FROM (SELECT * FROM zimba_security_audit WHERE (p_action IS NULL OR action=p_action) ORDER BY occurred_at DESC LIMIT p_limit)e
 LEFT JOIN neon_auth."user" u ON u.id=e.actor_auth_id;
 RETURN result;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_change_rent_start(p_connection uuid, p_start date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid:=public.zimba_my_manager_org();c resident_connections%ROWTYPE;
 BEGIN
 IF p_start IS NULL OR p_start<current_date-interval '365 days' OR p_start>current_date+interval '3 years' THEN RAISE EXCEPTION 'Rent start date is outside the supported range' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'An audit reason of 8–500 characters is required' USING ERRCODE='22023'; END IF;
 PERFORM public.zimba_security_throttle('rent_date_update',20,86400);
 SELECT * INTO c FROM resident_connections WHERE id=p_connection AND organization_id=org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resident connection unavailable' USING ERRCODE='42501'; END IF;
 IF c.rent_start_date IS NOT DISTINCT FROM p_start THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
 UPDATE resident_connections SET rent_start_date=p_start WHERE id=p_connection;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),org,'rent_start_changed','resident_connections',p_connection,jsonb_build_object('previous',c.rent_start_date,'new',p_start,'reason',btrim(p_reason)));
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(c.resident_auth_user_id,'general','Your rent start date was updated','Your property manager set your rent start date to '||p_start::text||'. Reason: '||left(btrim(p_reason),150),'#/workspace/payments',p_connection);
 RETURN jsonb_build_object('success',true,'rentStart',p_start);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_security_audit(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid:=public.zimba_my_manager_org();result jsonb;
 BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid audit limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('at',a.occurred_at,'action',a.action,'resource',a.resource,'resourceId',a.resource_id,'details',a.details) ORDER BY a.occurred_at DESC),'[]'::jsonb) INTO result FROM
 (SELECT * FROM zimba_security_audit WHERE organization_id=org ORDER BY occurred_at DESC LIMIT p_limit)a;
 RETURN result;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_resident_profiles_v3(p_property uuid)
 RETURNS TABLE(connection_id uuid, resident_name text, resident_email text, resident_reference text, unit_number text, monthly_rent_ugx bigint, rent_start_date date, linked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND organization_id=v_org) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,u.name,u.email,r.reference,un.unit_number,un.monthly_rent_ugx,c.rent_start_date,c.linked_at
 FROM resident_connections c JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id
 JOIN resident_public_references r ON r.auth_user_id=u.id
 LEFT JOIN units un ON un.id=c.unit_id AND un.property_id=c.property_id AND un.organization_id=c.organization_id
 WHERE c.organization_id=v_org AND c.property_id=p_property AND c.status='active'
 ORDER BY c.linked_at DESC LIMIT 200;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_security_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE uid uuid:=auth.uid();org uuid;key uuid;safe jsonb;action_name text;object_name text:=TG_TABLE_NAME;
 BEGIN
 IF TG_OP='DELETE' THEN org:=OLD.organization_id;key:=OLD.id; ELSE org:=NEW.organization_id;key:=NEW.id;END IF;
 action_name:=lower(TG_OP)||'_'||object_name;
 safe:='{}'::jsonb;
 IF object_name='resident_connections' THEN
   safe:=jsonb_build_object('status',CASE WHEN TG_OP='DELETE' THEN OLD.status ELSE NEW.status END,'rentStart',CASE WHEN TG_OP='DELETE' THEN OLD.rent_start_date ELSE NEW.rent_start_date END,'unit',CASE WHEN TG_OP='DELETE' THEN OLD.unit_id ELSE NEW.unit_id END);
 ELSIF object_name='resident_invites' THEN
   safe:=jsonb_build_object('approved',CASE WHEN TG_OP='DELETE' THEN OLD.accepted_at IS NOT NULL ELSE NEW.accepted_at IS NOT NULL END,'revoked',CASE WHEN TG_OP='DELETE' THEN OLD.revoked_at IS NOT NULL ELSE NEW.revoked_at IS NOT NULL END);
 ELSIF object_name='maintenance_requests' THEN
   safe:=jsonb_build_object('status',CASE WHEN TG_OP='DELETE' THEN OLD.status ELSE NEW.status END,'progress',CASE WHEN TG_OP='DELETE' THEN OLD.progress_percent ELSE NEW.progress_percent END);
 ELSIF object_name='units' THEN
   safe:=jsonb_build_object('status',CASE WHEN TG_OP='DELETE' THEN OLD.status ELSE NEW.status END,'rent',CASE WHEN TG_OP='DELETE' THEN OLD.monthly_rent_ugx ELSE NEW.monthly_rent_ugx END);
 ELSIF object_name='properties' THEN
   safe:=jsonb_build_object('visibility',CASE WHEN TG_OP='DELETE' THEN OLD.visibility ELSE NEW.visibility END);
 END IF;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(uid,org,action_name,object_name,key,safe);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_security_message_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid;
 BEGIN
 SELECT organization_id INTO org FROM resident_connections WHERE id=NEW.connection_id;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(NEW.sender_auth_id,org,'message_sent','resident_message',NEW.id,jsonb_build_object('connectionId',NEW.connection_id,'length',char_length(NEW.body)));
 RETURN NEW;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_security_throttle(p_action text, p_limit integer, p_window_seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE uid uuid:=auth.uid();bucket timestamptz;hits integer;
 BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Verified authentication required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('invite_create','message_send','maintenance_create','maintenance_progress','rent_date_update','unit_create','notification_read') OR p_limit NOT BETWEEN 1 AND 1000 OR p_window_seconds NOT IN (60,3600,86400) THEN RAISE EXCEPTION 'Invalid security rate policy' USING ERRCODE='22023'; END IF;
 bucket:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
 INSERT INTO zimba_security_rate_buckets(actor_auth_id,action,bucket_start,request_count)
 VALUES(uid,p_action,bucket,1) ON CONFLICT (actor_auth_id,action,bucket_start) DO UPDATE SET request_count=zimba_security_rate_buckets.request_count+1 RETURNING request_count INTO hits;
 IF hits>p_limit THEN RAISE EXCEPTION 'Too many requests. Try again after this rate-limit window.' USING ERRCODE='P0001'; END IF;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_security_wallet_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 BEGIN
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),NULL,'wallet_entry_created','wallet_entry',NEW.id,jsonb_build_object('walletOwner',NEW.resident_auth_id,'amount',NEW.amount_ugx,'source',NEW.verification_source,'reference',NEW.payment_reference));
 RETURN NEW;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_security_write_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 BEGIN
 IF TG_TABLE_NAME='resident_invites' THEN
   PERFORM public.zimba_security_throttle('invite_create',20,86400);
 ELSIF TG_TABLE_NAME='maintenance_requests' THEN
   PERFORM public.zimba_security_throttle('maintenance_create',10,3600);
 ELSIF TG_TABLE_NAME='zimba_resident_messages' THEN
   PERFORM public.zimba_security_throttle('message_send',12,60);
 ELSIF TG_TABLE_NAME='units' THEN
   PERFORM public.zimba_security_throttle('unit_create',500,86400);
 ELSIF TG_TABLE_NAME='zimba_maintenance_updates' THEN
   PERFORM public.zimba_security_throttle('maintenance_progress',120,86400);
 END IF;
 RETURN NEW;
 END $function$

DROP TRIGGER IF EXISTS zimba_audit_resident_invites ON resident_invites;
CREATE TRIGGER zimba_audit_resident_invites AFTER INSERT OR UPDATE OR DELETE ON resident_invites FOR EACH ROW EXECUTE FUNCTION public.zimba_security_event();
DROP TRIGGER IF EXISTS zimba_audit_resident_connections ON resident_connections;
CREATE TRIGGER zimba_audit_resident_connections AFTER INSERT OR UPDATE OR DELETE ON resident_connections FOR EACH ROW EXECUTE FUNCTION public.zimba_security_event();
DROP TRIGGER IF EXISTS zimba_audit_maintenance_requests ON maintenance_requests;
CREATE TRIGGER zimba_audit_maintenance_requests AFTER INSERT OR UPDATE OR DELETE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.zimba_security_event();
DROP TRIGGER IF EXISTS zimba_audit_units ON units;
CREATE TRIGGER zimba_audit_units AFTER INSERT OR UPDATE OR DELETE ON units FOR EACH ROW EXECUTE FUNCTION public.zimba_security_event();
DROP TRIGGER IF EXISTS zimba_audit_properties ON properties;
CREATE TRIGGER zimba_audit_properties AFTER INSERT OR UPDATE OR DELETE ON properties FOR EACH ROW EXECUTE FUNCTION public.zimba_security_event();
DROP TRIGGER IF EXISTS zimba_limit_resident_invites ON resident_invites;
CREATE TRIGGER zimba_limit_resident_invites BEFORE INSERT ON resident_invites FOR EACH ROW EXECUTE FUNCTION public.zimba_security_write_limit();
DROP TRIGGER IF EXISTS zimba_limit_maintenance_requests ON maintenance_requests;
CREATE TRIGGER zimba_limit_maintenance_requests BEFORE INSERT ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.zimba_security_write_limit();
DROP TRIGGER IF EXISTS zimba_limit_zimba_resident_messages ON zimba_resident_messages;
CREATE TRIGGER zimba_limit_zimba_resident_messages BEFORE INSERT ON zimba_resident_messages FOR EACH ROW EXECUTE FUNCTION public.zimba_security_write_limit();
DROP TRIGGER IF EXISTS zimba_audit_messages ON zimba_resident_messages;
CREATE TRIGGER zimba_audit_messages AFTER INSERT ON zimba_resident_messages FOR EACH ROW EXECUTE FUNCTION public.zimba_security_message_audit();
DROP TRIGGER IF EXISTS zimba_audit_wallet ON zimba_wallet_entries;
CREATE TRIGGER zimba_audit_wallet AFTER INSERT ON zimba_wallet_entries FOR EACH ROW EXECUTE FUNCTION public.zimba_security_wallet_audit();
REVOKE ALL ON FUNCTION public.zimba_manager_change_rent_start(uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_change_rent_start(uuid,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_admin_security_audit(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_admin_security_audit(integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_security_audit(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_security_audit(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_resident_profiles_v3(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_resident_profiles_v3(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_security_throttle(text,integer,integer) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON TABLE zimba_security_audit,zimba_security_rate_buckets FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS zimba_limit_units ON units;
CREATE TRIGGER zimba_limit_units BEFORE INSERT ON units FOR EACH ROW EXECUTE FUNCTION public.zimba_security_write_limit();
DROP TRIGGER IF EXISTS zimba_limit_maintenance_updates ON zimba_maintenance_updates;
CREATE TRIGGER zimba_limit_maintenance_updates BEFORE INSERT ON zimba_maintenance_updates FOR EACH ROW EXECUTE FUNCTION public.zimba_security_write_limit();
CREATE INDEX IF NOT EXISTS zimba_audit_actor_idx ON zimba_security_audit(actor_auth_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS zimba_rate_bucket_time_idx ON zimba_security_rate_buckets(bucket_start);
NOTIFY pgrst, 'reload schema';
