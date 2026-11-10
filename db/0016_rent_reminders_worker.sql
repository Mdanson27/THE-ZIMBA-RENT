-- ZIMBA 0016: idempotent rent reminders.
-- IMPORTANT: the routine is installed but not scheduled. Deploy a trusted
-- Neon scheduled Function to invoke it once per Uganda calendar day.
-- Do not expose this RPC to anonymous or authenticated browser roles.
CREATE TABLE IF NOT EXISTS zimba_rent_reminder_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES zimba_rent_invoices(id),
 reminder_stage text NOT NULL CHECK(reminder_stage IN ('before_7','before_3','before_1','overdue_1','overdue_7')),
 sent_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(invoice_id,reminder_stage)
);
ALTER TABLE zimba_rent_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zimba_rent_reminder_log FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE FUNCTION public.zimba_run_daily_rent_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE n integer:=0;inv record;stage text;d date:=(now() AT TIME ZONE 'Africa/Kampala')::date;new_id uuid;
 BEGIN
 FOR inv IN SELECT i.id,i.invoice_reference,i.due_date,i.amount_ugx,c.resident_auth_user_id AS resident,l.organization_id
 FROM zimba_rent_invoices i JOIN zimba_lease_records l ON l.id=i.lease_id
 JOIN resident_connections c ON c.id=l.connection_id
 WHERE i.status='unpaid' AND c.status='active' AND i.due_date BETWEEN d-7 AND d+7
 LOOP
 stage:=CASE WHEN inv.due_date=d+7 THEN 'before_7' WHEN inv.due_date=d+3 THEN 'before_3' WHEN inv.due_date=d+1 THEN 'before_1' WHEN inv.due_date=d-1 THEN 'overdue_1' WHEN inv.due_date=d-7 THEN 'overdue_7' ELSE NULL END;
 IF stage IS NULL THEN CONTINUE; END IF;
 INSERT INTO zimba_rent_reminder_log(invoice_id,reminder_stage) VALUES(inv.id,stage) ON CONFLICT DO NOTHING RETURNING id INTO new_id;
 IF new_id IS NOT NULL THEN
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id) VALUES(inv.resident,'general',CASE WHEN stage LIKE 'overdue%' THEN 'Outstanding rent reminder' ELSE 'Upcoming rent payment' END,'Invoice '||inv.invoice_reference||' for UGX '||inv.amount_ugx||' is due '||inv.due_date::text||'.','#/workspace/invoices',inv.id);
 n:=n+1;
 END IF;
 new_id:=NULL;
 END LOOP;
 RETURN jsonb_build_object('delivered',n,'localDate',d,'schedule','requires_external_UTC_scheduler');
 END $function$

REVOKE ALL ON FUNCTION public.zimba_run_daily_rent_reminders() FROM PUBLIC,anonymous,authenticated;
NOTIFY pgrst,'reload schema';
