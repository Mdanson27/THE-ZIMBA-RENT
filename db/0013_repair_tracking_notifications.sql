-- ZIMBA RENT migration 0013 · Maintenance tracking + private notifications
-- Developer note: no direct browser inserts into the notification ledger.
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100);
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS expected_completion date;
CREATE TABLE IF NOT EXISTS zimba_maintenance_updates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES maintenance_requests(id),
 actor_auth_id uuid REFERENCES neon_auth."user"(id),
 status text NOT NULL,
 progress_percent integer NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
 note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zimba_maintenance_updates_request_time ON zimba_maintenance_updates(request_id,created_at DESC);
ALTER TABLE zimba_maintenance_updates ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_auth_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 kind text NOT NULL CHECK(kind IN ('repair','message','invitation','general')),
 title text NOT NULL,
 body text NOT NULL,
 link text NOT NULL DEFAULT '#/workspace/home',
 related_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz
);
CREATE INDEX IF NOT EXISTS zimba_notifications_recipient_idx ON zimba_notifications(recipient_auth_id,created_at DESC);
ALTER TABLE zimba_notifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.zimba_manager_maintenance_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid:=public.zimba_my_manager_org();res jsonb;
 BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'property',p.title,'issue',m.issue,'status',m.status,'priority',m.priority,'progress',m.progress_percent,'eta',m.expected_completion,'note',m.assigned_note,'date',m.created_at) ORDER BY m.created_at DESC),'[]'::jsonb) INTO res
 FROM (SELECT * FROM maintenance_requests WHERE organization_id=org ORDER BY created_at DESC LIMIT 300)m JOIN properties p ON p.id=m.property_id AND p.organization_id=org;
 RETURN res;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_maintenance_progress(p_request uuid, p_status text, p_progress integer, p_note text, p_eta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_org uuid:=public.zimba_my_manager_org();m maintenance_requests%ROWTYPE;uid uuid:=auth.uid();
 BEGIN
 SELECT * INTO m FROM maintenance_requests WHERE id=p_request AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('open','in_progress','completed','cancelled') OR p_progress NOT BETWEEN 0 AND 100 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Provide a valid status, progress and update note' USING ERRCODE='22023'; END IF;
 IF (p_status='completed' AND p_progress<>100) OR (p_status='open' AND p_progress>0) OR (p_status='in_progress' AND (p_progress<1 OR p_progress>99)) OR (p_status='cancelled' AND p_progress=100) THEN RAISE EXCEPTION 'Status and progress percentage do not match' USING ERRCODE='22023'; END IF;
 IF p_eta IS NOT NULL AND (p_eta<current_date-365 OR p_eta>current_date+interval '3 years') THEN RAISE EXCEPTION 'Invalid expected completion date' USING ERRCODE='22023'; END IF;
 UPDATE maintenance_requests SET status=p_status,progress_percent=p_progress,assigned_note=btrim(p_note),expected_completion=p_eta,updated_at=now() WHERE id=p_request;
 INSERT INTO zimba_maintenance_updates(request_id,actor_auth_id,status,progress_percent,note) VALUES(p_request,uid,p_status,p_progress,btrim(p_note));
 IF m.requested_by_auth_id IS NOT NULL THEN
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(m.requested_by_auth_id,'repair','Repair progress updated',left(m.issue,90)||' · '||p_progress::text||'% · '||btrim(p_note),'#/workspace/maintenance',p_request);
 END IF;
 RETURN jsonb_build_object('success',true,'status',p_status,'progress',p_progress);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_mark_notification_read(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE uid uuid:=auth.uid();affected integer;
 BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 UPDATE zimba_notifications SET read_at=coalesce(read_at,now()) WHERE id=p_id AND recipient_auth_id=uid;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Notification not found' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('success',true);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_notification_feed()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE uid uuid:=auth.uid(); output jsonb;
 BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('unread',(SELECT count(*) FROM zimba_notifications WHERE recipient_auth_id=uid AND read_at IS NULL),
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,'body',n.body,'link',n.link,'createdAt',n.created_at,'read',n.read_at IS NOT NULL) ORDER BY n.created_at DESC),'[]'::jsonb)
 FROM (SELECT * FROM zimba_notifications WHERE recipient_auth_id=uid ORDER BY created_at DESC LIMIT 75)n)) INTO output;
 RETURN output;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_notify_new_maintenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 BEGIN
 IF NEW.requested_by_auth_id IS NOT NULL THEN
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 SELECT DISTINCT a.external_auth_id::uuid,'repair','New tenant repair request',left(NEW.issue,170),'#/workspace/maintenance',NEW.id
 FROM memberships m JOIN app_users a ON a.id=m.user_id WHERE m.organization_id=NEW.organization_id
 AND m.status='active' AND m.role IN ('owner','admin','manager')
 AND a.external_auth_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND EXISTS(SELECT 1 FROM neon_auth."user" u WHERE u.id=a.external_auth_id::uuid);
 END IF;
 RETURN NEW;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_notify_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE c resident_connections%ROWTYPE;
 BEGIN
 SELECT * INTO c FROM resident_connections WHERE id=NEW.connection_id AND status='active';
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.sender_auth_id=c.resident_auth_user_id THEN
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 SELECT DISTINCT a.external_auth_id::uuid,'message','New resident message',left(NEW.body,160),'#/workspace/messages',NEW.id
 FROM memberships m JOIN app_users a ON a.id=m.user_id
 WHERE m.organization_id=c.organization_id AND m.status='active' AND m.role IN ('owner','admin','manager')
 AND a.external_auth_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND a.external_auth_id::uuid<>NEW.sender_auth_id
 AND EXISTS(SELECT 1 FROM neon_auth."user" u WHERE u.id=a.external_auth_id::uuid);
 ELSE
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(c.resident_auth_user_id,'message','Message from your property manager',left(NEW.body,160),'#/workspace/messages',NEW.id);
 END IF;
 RETURN NEW;
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_maintenance_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE uid uuid:=auth.uid();res jsonb;
 BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'issue',m.issue,'property',p.title,'status',m.status,'priority',m.priority,'progress',m.progress_percent,'eta',m.expected_completion,'date',m.created_at,'note',m.assigned_note,'updates',(
 SELECT coalesce(jsonb_agg(jsonb_build_object('status',u.status,'progress',u.progress_percent,'note',u.note,'date',u.created_at) ORDER BY u.created_at),'[]'::jsonb) FROM zimba_maintenance_updates u WHERE u.request_id=m.id)) ORDER BY m.created_at DESC),'[]'::jsonb) INTO res
 FROM (SELECT m.* FROM maintenance_requests m JOIN resident_connections c ON c.organization_id=m.organization_id AND c.property_id=m.property_id AND c.resident_auth_user_id=uid AND c.status='active' WHERE m.requested_by_auth_id=uid ORDER BY m.created_at DESC LIMIT 100)m
 JOIN properties p ON p.id=m.property_id AND p.organization_id=m.organization_id;
 RETURN res;
 END $function$

REVOKE ALL ON FUNCTION public.zimba_notification_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_notification_feed() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_mark_notification_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_maintenance_progress(uuid,text,integer,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_maintenance_progress(uuid,text,integer,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_maintenance_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_maintenance_progress() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_maintenance_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_maintenance_list() TO authenticated;
DROP TRIGGER IF EXISTS zimba_new_message_notify ON zimba_resident_messages;
CREATE TRIGGER zimba_new_message_notify AFTER INSERT ON zimba_resident_messages FOR EACH ROW EXECUTE FUNCTION public.zimba_notify_new_message();
DROP TRIGGER IF EXISTS zimba_new_maintenance_notify ON maintenance_requests;
CREATE TRIGGER zimba_new_maintenance_notify AFTER INSERT ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.zimba_notify_new_maintenance();
NOTIFY pgrst, 'reload schema';
