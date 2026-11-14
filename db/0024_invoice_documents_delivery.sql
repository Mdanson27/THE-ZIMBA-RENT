-- ZIMBA Rent Invoice V3 — private, verified-payment aware invoice documents.
-- Only in-app notices are truly sent. Email/WhatsApp are user-owned composer workflows.
-- Never assume an unverified payment, fabricate a receipt, or claim EFRIS tax issuance.

CREATE TABLE IF NOT EXISTS public.zimba_invoice_delivery_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES public.zimba_rent_invoices(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 recipient_auth_id uuid NOT NULL,
 actor_auth_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel='in_app'),
 intent text NOT NULL CHECK(intent IN ('invoice','reminder')),
 message_body text NOT NULL CHECK(length(message_body) BETWEEN 10 AND 700),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zimba_invoice_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_invoice_delivery_log FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_invoice_delivery_idx ON public.zimba_invoice_delivery_log(invoice_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.zimba_manager_invoice_documents()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',i.id,'leaseId',i.lease_id,'reference',i.invoice_reference,
 'tenant',coalesce(nullif(btrim(t.name),''),'Tenant'),
 'tenantEmail',t.email,'tenantEmailVerified',t."emailVerified",
 'tenantPhone',coalesce(contact.phone,''),
 'tenantAuthId',c.resident_auth_user_id,
 'property',p.title,'propertyId',p.id,
 'propertyAddress',coalesce(p.address_line,''),'city',coalesce(p.city,''),
 'country',coalesce(p.country,'Uganda'),'unit',coalesce(un.unit_number,''),
 'landlord',o.name,
 'amount',i.amount_ugx,'periodStart',i.period_start,'periodEnd',i.period_end,
 'issuedAt',i.issued_at,'due',i.due_date,'rawStatus',i.status,
 'verifiedPaid',pay.paid,'balance',greatest(i.amount_ugx-pay.paid,0),
 'overpayment',greatest(pay.paid-i.amount_ugx,0),
 'receipts',pay.receipts,
 'status',CASE WHEN i.status='void' THEN 'void'
  WHEN pay.paid>=i.amount_ugx THEN 'paid'
  WHEN pay.paid>0 THEN 'partial'
  WHEN i.due_date<current_date THEN 'overdue'
  ELSE 'unpaid' END,
 'lastInAppAt',last_delivery.created_at,'lastInAppKind',last_delivery.intent
 ) ORDER BY i.issued_at DESC),'[]'::jsonb)
 FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 JOIN public.organizations o ON o.id=l.organization_id
 JOIN neon_auth."user" t ON t.id=c.resident_auth_user_id
 LEFT JOIN public.units un ON un.id=c.unit_id AND un.property_id=p.id
 LEFT JOIN LATERAL (
  SELECT a.phone FROM public.app_users a
  WHERE a.external_auth_id=c.resident_auth_user_id::text ORDER BY a.created_at DESC LIMIT 1
 ) contact ON true
 LEFT JOIN LATERAL (
  SELECT coalesce(sum(ev.amount_ugx),0)::bigint paid,
   coalesce(jsonb_agg(jsonb_build_object(
    'reference',ev.receipt_reference,'amount',ev.amount_ugx,
    'source',ev.payment_source,'verifiedAt',ev.verified_at)
    ORDER BY ev.verified_at),'[]'::jsonb) receipts
  FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id
 ) pay ON true
 LEFT JOIN LATERAL (
  SELECT dl.created_at,dl.intent FROM public.zimba_invoice_delivery_log dl
  WHERE dl.invoice_id=i.id ORDER BY dl.created_at DESC LIMIT 1
 ) last_delivery ON true
 WHERE l.organization_id=public.zimba_my_manager_org()
$function$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_invoice_documents()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_user uuid:=auth.uid();v_out jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',i.id,'leaseId',i.lease_id,'reference',i.invoice_reference,
 'tenant',coalesce(nullif(btrim(t.name),''),'Tenant'),
 'tenantEmail',t.email,'property',p.title,'propertyId',p.id,
 'propertyAddress',coalesce(p.address_line,''),'city',coalesce(p.city,''),
 'country',coalesce(p.country,'Uganda'),'unit',coalesce(un.unit_number,''),
 'landlord',o.name,'amount',i.amount_ugx,
 'periodStart',i.period_start,'periodEnd',i.period_end,'issuedAt',i.issued_at,
 'due',i.due_date,'rawStatus',i.status,
 'verifiedPaid',pay.paid,'balance',greatest(i.amount_ugx-pay.paid,0),
 'overpayment',greatest(pay.paid-i.amount_ugx,0),
 'receipts',pay.receipts,
 'status',CASE WHEN i.status='void' THEN 'void'
  WHEN pay.paid>=i.amount_ugx THEN 'paid'
  WHEN pay.paid>0 THEN 'partial'
  WHEN i.due_date<current_date THEN 'overdue'
  ELSE 'unpaid' END
 ) ORDER BY i.issued_at DESC),'[]'::jsonb) INTO v_out
 FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 JOIN public.organizations o ON o.id=l.organization_id
 JOIN neon_auth."user" t ON t.id=c.resident_auth_user_id
 LEFT JOIN public.units un ON un.id=c.unit_id AND un.property_id=p.id
 LEFT JOIN LATERAL (
  SELECT coalesce(sum(ev.amount_ugx),0)::bigint paid,
   coalesce(jsonb_agg(jsonb_build_object(
    'reference',ev.receipt_reference,'amount',ev.amount_ugx,
    'source',ev.payment_source,'verifiedAt',ev.verified_at)
    ORDER BY ev.verified_at),'[]'::jsonb) receipts
  FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id
 ) pay ON true
 WHERE c.resident_auth_user_id=v_user;
 RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION public.zimba_manager_deliver_invoice_in_app(
 p_invoice uuid,p_intent text,p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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

REVOKE ALL ON FUNCTION public.zimba_manager_invoice_documents() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_invoice_documents() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_deliver_invoice_in_app(uuid,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_manager_invoice_documents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_invoice_documents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_deliver_invoice_in_app(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
