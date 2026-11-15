-- ZIMBA RENT 0029: Block delivery/reminders for invoices whose monthly rate conflicts with the tenant's actual unit.
-- No existing billing records or notifications are edited.
CREATE OR REPLACE FUNCTION public.zimba_manager_deliver_invoice_in_app(p_invoice uuid, p_intent text, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();
 v_inv public.zimba_rent_invoices%ROWTYPE;v_recipient uuid;v_paid bigint;
 v_log uuid;v_msg text:=btrim(coalesce(p_message,''));v_previous timestamptz;
BEGIN
 IF v_org IS NULL THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501';END IF;
 IF p_intent NOT IN ('invoice','reminder') THEN
  RAISE EXCEPTION 'Choose invoice or reminder' USING ERRCODE='22023';END IF;
 IF length(v_msg) NOT BETWEEN 10 AND 700 THEN
  RAISE EXCEPTION 'Message must be 10 to 700 characters' USING ERRCODE='22023';END IF;
 SELECT i.* INTO v_inv FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id
 WHERE i.id=p_invoice AND l.organization_id=v_org FOR UPDATE OF i;
 IF NOT FOUND OR v_inv.status='void' THEN
  RAISE EXCEPTION 'Invoice not available for delivery' USING ERRCODE='42501';END IF;
 IF EXISTS (
 SELECT 1 FROM public.zimba_lease_records lease
 JOIN public.resident_connections rc ON rc.id=lease.connection_id AND rc.organization_id=lease.organization_id
 LEFT JOIN public.units u ON u.id=rc.unit_id AND u.organization_id=lease.organization_id
 WHERE lease.id=v_inv.lease_id
 AND u.monthly_rent_ugx IS DISTINCT FROM lease.monthly_rent_ugx
 ) THEN
 RAISE EXCEPTION 'Invoice is on hold: rent disagrees with the occupied room. Resolve the tenant-approved correction before sending any reminders.'
 USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(amount_ugx),0)::bigint INTO v_paid
 FROM public.zimba_payment_evidence WHERE invoice_id=p_invoice;
 IF p_intent='reminder' AND v_paid>=v_inv.amount_ugx THEN
  RAISE EXCEPTION 'Cannot remind a fully paid invoice' USING ERRCODE='22023';END IF;
 SELECT c.resident_auth_user_id INTO v_recipient FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE l.id=v_inv.lease_id AND l.organization_id=v_org;
 IF v_recipient IS NULL THEN RAISE EXCEPTION 'Connected tenant not found' USING ERRCODE='42501';END IF;
 SELECT max(created_at) INTO v_previous FROM public.zimba_invoice_delivery_log
 WHERE invoice_id=p_invoice AND intent=p_intent;
 IF v_previous IS NOT NULL AND v_previous>now()-interval '24 hours' THEN
  RAISE EXCEPTION 'This in-app message was already sent in the last 24 hours' USING ERRCODE='P0001';END IF;
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_recipient,'general',
 CASE WHEN p_intent='reminder' THEN 'Rent invoice payment reminder' ELSE 'Your rent invoice' END,
 v_msg,'#/workspace/invoices',p_invoice);
 INSERT INTO public.zimba_invoice_delivery_log(
  invoice_id,organization_id,recipient_auth_id,actor_auth_id,channel,intent,message_body)
 VALUES(p_invoice,v_org,v_recipient,auth.uid(),'in_app',p_intent,v_msg) RETURNING id INTO v_log;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'invoice_in_app_delivered','invoice',p_invoice,
  jsonb_build_object('dispatchId',v_log,'intent',p_intent,'channel','in_app'));
 RETURN jsonb_build_object('success',true,'channel','in_app','intent',p_intent,
  'dispatchId',v_log,'sentAt',now());
END $function$;

CREATE OR REPLACE FUNCTION public.zimba_manager_send_rent_reminder(p_invoice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();inv zimba_rent_invoices%ROWTYPE;tenant uuid;already integer;
BEGIN
 SELECT i.* INTO inv FROM zimba_rent_invoices i JOIN zimba_lease_records l ON l.id=i.lease_id WHERE i.id=p_invoice AND l.organization_id=org AND i.status='unpaid';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only unpaid invoices may be reminded' USING ERRCODE='42501'; END IF;
 IF EXISTS (
 SELECT 1 FROM public.zimba_lease_records lease
 JOIN public.resident_connections rc ON rc.id=lease.connection_id AND rc.organization_id=lease.organization_id
 LEFT JOIN public.units u ON u.id=rc.unit_id AND u.organization_id=lease.organization_id
 WHERE lease.id=inv.lease_id
 AND u.monthly_rent_ugx IS DISTINCT FROM lease.monthly_rent_ugx
 ) THEN
 RAISE EXCEPTION 'Invoice is on hold: rent disagrees with the occupied room. Resolve the tenant-approved correction before sending any reminders.'
 USING ERRCODE='42501';END IF;
 SELECT c.resident_auth_user_id INTO tenant FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id WHERE l.id=inv.lease_id;
 SELECT count(*) INTO already FROM zimba_notifications WHERE recipient_auth_id=tenant AND kind='general' AND related_id=p_invoice AND title='Rent payment reminder' AND created_at>now()-interval '24 hours';
 IF already>0 THEN RAISE EXCEPTION 'Rent reminder already issued in the last 24 hours' USING ERRCODE='P0001'; END IF;
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id) VALUES(tenant,'general','Rent payment reminder','Invoice '||inv.invoice_reference||' for UGX '||inv.amount_ugx||' is due '||inv.due_date::text||'.','#/workspace/payments',p_invoice);
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'rent_reminder_sent','invoice',p_invoice,jsonb_build_object('due',inv.due_date));
 RETURN jsonb_build_object('success',true);
END $function$;
