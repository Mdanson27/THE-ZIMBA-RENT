-- ZIMBA RENT migration 0015: lease register, regulated deposits and rent billing.
-- Verified payment evidence may only be written by a trusted reconciliation process.
-- WARNING: This migration does not connect a payment provider or legally execute leases.
CREATE TABLE IF NOT EXISTS zimba_lease_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES resident_connections(id),organization_id uuid NOT NULL REFERENCES organizations(id),monthly_rent_ugx bigint NOT NULL CHECK(monthly_rent_ugx>0),deposit_required_ugx bigint NOT NULL CHECK(deposit_required_ugx>=0),start_date date NOT NULL,end_date date,terms text NOT NULL CHECK(length(terms) BETWEEN 50 AND 10000),deposit_terms text NOT NULL CHECK(length(deposit_terms) BETWEEN 20 AND 3000),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','acknowledged','ended')),tenant_ack_at timestamptz,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),issued_at timestamptz,UNIQUE(connection_id));
ALTER TABLE zimba_lease_records ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_rent_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lease_id uuid NOT NULL REFERENCES zimba_lease_records(id),due_date date NOT NULL,period_start date NOT NULL,period_end date NOT NULL,amount_ugx bigint NOT NULL CHECK(amount_ugx>0),invoice_reference text UNIQUE NOT NULL DEFAULT ('ZI-'||upper(encode(gen_random_bytes(7),'hex'))),status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','void')),issued_at timestamptz NOT NULL DEFAULT now(),UNIQUE(lease_id,period_start),CHECK(period_end>=period_start));
ALTER TABLE zimba_rent_invoices ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_payment_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES zimba_rent_invoices(id),amount_ugx bigint NOT NULL CHECK(amount_ugx>0),external_transaction_id text NOT NULL UNIQUE,payment_source text NOT NULL CHECK(payment_source IN ('provider_verified','reconciled_bank')),receipt_reference text UNIQUE NOT NULL DEFAULT ('ZRCP-'||upper(encode(gen_random_bytes(7),'hex'))),verified_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE zimba_payment_evidence ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_deposit_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lease_id uuid NOT NULL REFERENCES zimba_lease_records(id),entry_kind text NOT NULL CHECK(entry_kind IN ('verified_deposit','verified_refund','verified_deduction')),amount_ugx bigint NOT NULL CHECK(amount_ugx>0),external_reference text UNIQUE NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE zimba_deposit_ledger ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS zimba_deposit_refund_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lease_id uuid NOT NULL REFERENCES zimba_lease_records(id),amount_ugx bigint NOT NULL CHECK(amount_ugx>0),reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved_pending_payout','rejected','settled')),requested_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,reviewed_by uuid,decision_note text);
ALTER TABLE zimba_deposit_refund_requests ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS zimba_one_open_refund_per_lease ON zimba_deposit_refund_requests(lease_id) WHERE status IN ('requested','approved_pending_payout');
CREATE INDEX IF NOT EXISTS zimba_invoices_lease_due ON zimba_rent_invoices(lease_id,due_date);
CREATE INDEX IF NOT EXISTS zimba_deposit_ledger_lease ON zimba_deposit_ledger(lease_id);
CREATE INDEX IF NOT EXISTS zimba_lease_org_idx ON zimba_lease_records(organization_id);
REVOKE ALL ON zimba_lease_records,zimba_rent_invoices,zimba_payment_evidence,zimba_deposit_ledger,zimba_deposit_refund_requests FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE FUNCTION public.zimba_manager_deposit_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();out jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('leaseId',l.id,'tenant',u.name,'property',p.title,'required',l.deposit_required_ugx,'verifiedHeld',coalesce((SELECT sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END) FROM zimba_deposit_ledger WHERE lease_id=l.id),0),'leaseStatus',l.status,'requests',(
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount_ugx,'status',r.status,'reason',r.reason,'requestedAt',r.requested_at)),'[]'::jsonb) FROM zimba_deposit_refund_requests r WHERE r.lease_id=l.id)) ORDER BY l.created_at DESC),'[]'::jsonb) INTO out
 FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id JOIN properties p ON p.id=c.property_id WHERE l.organization_id=org;
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_invoice_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();out jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'reference',i.invoice_reference,'tenant',u.name,'property',p.title,'amount',i.amount_ugx,'period',i.period_start,'due',i.due_date,'status',i.status) ORDER BY i.due_date DESC),'[]'::jsonb) INTO out
 FROM zimba_rent_invoices i JOIN zimba_lease_records l ON l.id=i.lease_id JOIN resident_connections c ON c.id=l.connection_id JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id JOIN properties p ON p.id=c.property_id
 WHERE l.organization_id=org;
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_issue_invoice(p_lease uuid, p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();l zimba_lease_records%ROWTYPE;invoice uuid;due date;period date;tenant uuid;charge bigint;bill_start date;bill_end date;
BEGIN
 SELECT * INTO l FROM zimba_lease_records WHERE id=p_lease AND organization_id=org AND status='acknowledged' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant must acknowledge lease terms first' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR p_period<date_trunc('month',l.start_date)::date OR p_period>date_trunc('month',current_date+interval '3 months')::date THEN RAISE EXCEPTION 'Billing period outside allowed range' USING ERRCODE='22023'; END IF;
 period:=date_trunc('month',p_period)::date;
 due:=(date_trunc('month',period::timestamp)+interval '1 month - 1 day')::date;
 IF l.end_date IS NOT NULL AND period>l.end_date THEN RAISE EXCEPTION 'Lease already ended for billing period' USING ERRCODE='22023'; END IF;
 bill_start:=greatest(period,l.start_date);bill_end:=least(due,coalesce(l.end_date,due));
 charge:=round(l.monthly_rent_ugx::numeric*(bill_end-bill_start+1)::numeric/extract(day from due)::numeric)::bigint;
 IF charge<=0 THEN RAISE EXCEPTION 'No billable days in this period' USING ERRCODE='22023'; END IF;
 INSERT INTO zimba_rent_invoices(lease_id,period_start,period_end,due_date,amount_ugx)
 VALUES(p_lease,bill_start,bill_end,due,charge)
 ON CONFLICT(lease_id,period_start) DO NOTHING RETURNING id INTO invoice;
 IF invoice IS NULL THEN RAISE EXCEPTION 'Invoice for this lease and month already exists' USING ERRCODE='23505'; END IF;
 SELECT c.resident_auth_user_id INTO tenant FROM resident_connections c WHERE c.id=l.connection_id;
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id) VALUES(tenant,'general','Rent invoice issued','Rent invoice for '||to_char(period,'FMMonth YYYY')||' is due '||due::text||'.','#/workspace/payments',invoice);
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'rent_invoice_issued','invoice',invoice,jsonb_build_object('period',period,'amount',charge,'due',due));
 RETURN jsonb_build_object('id',invoice,'due',due);
END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_lease_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();out jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'connectionId',l.connection_id,'tenant',u.name,'property',p.title,'room',unit.unit_number,'rent',l.monthly_rent_ugx,'deposit',l.deposit_required_ugx,'start',l.start_date,'end',l.end_date,'terms',l.terms,'depositTerms',l.deposit_terms,'status',l.status,'acknowledgedAt',l.tenant_ack_at) ORDER BY l.created_at DESC),'[]'::jsonb) INTO out
 FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id AND c.organization_id=org JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id JOIN properties p ON p.id=c.property_id LEFT JOIN units unit ON unit.id=c.unit_id WHERE l.organization_id=org;
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_prepare_lease(p_connection uuid, p_start date, p_end date, p_rent bigint, p_deposit bigint, p_terms text, p_deposit_terms text, p_issue boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();c resident_connections%ROWTYPE;lid uuid;current_status text;
BEGIN
 SELECT * INTO c FROM resident_connections WHERE id=p_connection AND organization_id=org AND status='active' FOR UPDATE;
 IF NOT FOUND OR c.unit_id IS NULL THEN RAISE EXCEPTION 'An approved tenant and assigned room are required' USING ERRCODE='42501'; END IF;
 IF p_rent IS NULL OR p_rent<=0 OR p_deposit IS NULL OR p_deposit<=0 OR p_deposit>p_rent OR p_start IS NULL OR p_end IS NOT NULL AND p_end<=p_start THEN RAISE EXCEPTION 'Invalid rent, deposit cap or dates' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_terms,''))) NOT BETWEEN 50 AND 10000 OR length(btrim(coalesce(p_deposit_terms,''))) NOT BETWEEN 20 AND 3000 THEN RAISE EXCEPTION 'Complete written lease and security deposit terms' USING ERRCODE='22023'; END IF;
 SELECT status INTO current_status FROM zimba_lease_records WHERE connection_id=p_connection FOR UPDATE;
 IF current_status IS NOT NULL AND current_status<>'draft' THEN RAISE EXCEPTION 'Issued lease must be revised through a separate amendment process' USING ERRCODE='42501'; END IF;
 INSERT INTO zimba_lease_records(connection_id,organization_id,monthly_rent_ugx,deposit_required_ugx,start_date,end_date,terms,deposit_terms,status,created_by,issued_at)
 VALUES(p_connection,org,p_rent,p_deposit,p_start,p_end,btrim(p_terms),btrim(p_deposit_terms),CASE WHEN p_issue THEN 'issued' ELSE 'draft' END,auth.uid(),CASE WHEN p_issue THEN now() ELSE NULL END)
 ON CONFLICT(connection_id) DO UPDATE SET monthly_rent_ugx=excluded.monthly_rent_ugx,deposit_required_ugx=excluded.deposit_required_ugx,start_date=excluded.start_date,end_date=excluded.end_date,terms=excluded.terms,deposit_terms=excluded.deposit_terms,status=excluded.status,issued_at=excluded.issued_at RETURNING id INTO lid;
 IF p_issue THEN
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(c.resident_auth_user_id,'general','Lease ready for review','Your landlord has issued lease terms for your assigned home.','#/workspace/lease',lid);
 END IF;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'lease_prepared','lease',lid,jsonb_build_object('issued',p_issue,'monthlyRent',p_rent,'deposit',p_deposit));
 RETURN jsonb_build_object('id',lid,'status',CASE WHEN p_issue THEN 'issued' ELSE 'draft' END);
END $function$


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
 SELECT c.resident_auth_user_id INTO tenant FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id WHERE l.id=inv.lease_id;
 SELECT count(*) INTO already FROM zimba_notifications WHERE recipient_auth_id=tenant AND kind='general' AND related_id=p_invoice AND title='Rent payment reminder' AND created_at>now()-interval '24 hours';
 IF already>0 THEN RAISE EXCEPTION 'Rent reminder already issued in the last 24 hours' USING ERRCODE='P0001'; END IF;
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id) VALUES(tenant,'general','Rent payment reminder','Invoice '||inv.invoice_reference||' for UGX '||inv.amount_ugx||' is due '||inv.due_date::text||'.','#/workspace/payments',p_invoice);
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'rent_reminder_sent','invoice',p_invoice,jsonb_build_object('due',inv.due_date));
 RETURN jsonb_build_object('success',true);
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_acknowledge_lease(p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();org uuid;manager uuid;
BEGIN
 UPDATE zimba_lease_records l SET status='acknowledged',tenant_ack_at=now() FROM resident_connections c
 WHERE l.id=p_lease AND l.connection_id=c.id AND c.resident_auth_user_id=uid AND c.status='active' AND l.status='issued' RETURNING l.organization_id INTO org;
 IF org IS NULL THEN RAISE EXCEPTION 'Issued lease not found for this account' USING ERRCODE='42501'; END IF;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(uid,org,'lease_terms_acknowledged','lease',p_lease,jsonb_build_object('method','account_acknowledgement_only'));
 RETURN jsonb_build_object('success',true,'note','Account acknowledgement recorded; not a legally verified signature');
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_billing()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();out jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'invoiceRef',i.invoice_reference,'property',p.title,'amount',i.amount_ugx,'periodStart',i.period_start,'periodEnd',i.period_end,'due',i.due_date,'status',i.status,'receipts',(
 SELECT coalesce(jsonb_agg(jsonb_build_object('reference',e.receipt_reference,'amount',e.amount_ugx,'source',e.payment_source,'transaction',e.external_transaction_id,'verifiedAt',e.verified_at)),'[]'::jsonb) FROM zimba_payment_evidence e WHERE e.invoice_id=i.id)) ORDER BY i.due_date DESC),'[]'::jsonb) INTO out
 FROM zimba_rent_invoices i JOIN zimba_lease_records l ON l.id=i.lease_id JOIN resident_connections c ON c.id=l.connection_id AND c.resident_auth_user_id=uid JOIN properties p ON p.id=c.property_id;
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_deposit_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();out jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('leaseId',l.id,'property',p.title,'required',l.deposit_required_ugx,'verifiedHeld',coalesce((SELECT sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END) FROM zimba_deposit_ledger WHERE lease_id=l.id),0),'leaseStatus',l.status,'requests',(
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount_ugx,'status',r.status,'reason',r.reason,'requestedAt',r.requested_at,'decision',r.decision_note)),'[]'::jsonb) FROM zimba_deposit_refund_requests r WHERE r.lease_id=l.id))),'[]'::jsonb) INTO out
 FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id JOIN properties p ON p.id=c.property_id WHERE c.resident_auth_user_id=uid;
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_lease()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();out jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'connectionId',l.connection_id,'property',p.title,'room',u.unit_number,'landlord',o.name,'start',l.start_date,'end',l.end_date,'rent',l.monthly_rent_ugx,'deposit',l.deposit_required_ugx,'terms',l.terms,'depositTerms',l.deposit_terms,'status',l.status,'issuedAt',l.issued_at,'acknowledgedAt',l.tenant_ack_at) ORDER BY l.created_at DESC),'[]'::jsonb) INTO out
 FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id AND c.status='active' JOIN properties p ON p.id=c.property_id AND p.organization_id=c.organization_id JOIN organizations o ON o.id=c.organization_id LEFT JOIN units u ON u.id=c.unit_id
 WHERE c.resident_auth_user_id=uid AND l.status IN ('issued','acknowledged','ended');
 RETURN out;
END $function$


CREATE OR REPLACE FUNCTION public.zimba_tenant_request_deposit_refund(p_lease uuid, p_amount bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();l zimba_lease_records%ROWTYPE;verified bigint;pending bigint;request_id uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT l.* INTO l FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id WHERE l.id=p_lease AND c.resident_auth_user_id=uid FOR UPDATE OF l;
 IF NOT FOUND OR l.status<>'ended' THEN RAISE EXCEPTION 'Deposit refunds require an ended lease' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Explain the refund request in 10-1000 characters' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END),0) INTO verified FROM zimba_deposit_ledger WHERE lease_id=p_lease;
 SELECT coalesce(sum(amount_ugx),0) INTO pending FROM zimba_deposit_refund_requests WHERE lease_id=p_lease AND status IN ('requested','approved_pending_payout');
 IF p_amount IS NULL OR p_amount<1 OR p_amount>verified-pending THEN RAISE EXCEPTION 'Refund cannot exceed verified available security deposit' USING ERRCODE='22023'; END IF;
 INSERT INTO zimba_deposit_refund_requests(lease_id,amount_ugx,reason) VALUES(p_lease,p_amount,btrim(p_reason)) RETURNING id INTO request_id;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(uid,l.organization_id,'deposit_refund_requested','deposit_refund',request_id,jsonb_build_object('amount',p_amount));
 RETURN jsonb_build_object('id',request_id,'status','requested','payoutEnabled',false);
END $function$

REVOKE ALL ON FUNCTION public.zimba_manager_deposit_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_deposit_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_invoice_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_invoice_list() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_issue_invoice(p_lease uuid, p_period date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_issue_invoice(p_lease uuid, p_period date) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_lease_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_lease_list() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_prepare_lease(p_connection uuid, p_start date, p_end date, p_rent bigint, p_deposit bigint, p_terms text, p_deposit_terms text, p_issue boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_prepare_lease(p_connection uuid, p_start date, p_end date, p_rent bigint, p_deposit bigint, p_terms text, p_deposit_terms text, p_issue boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_send_rent_reminder(p_invoice uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_send_rent_reminder(p_invoice uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_acknowledge_lease(p_lease uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_acknowledge_lease(p_lease uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_billing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_billing() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_deposit_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_deposit_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_lease() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_lease() TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_tenant_request_deposit_refund(p_lease uuid, p_amount bigint, p_reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_request_deposit_refund(p_lease uuid, p_amount bigint, p_reason text) TO authenticated;
CREATE OR REPLACE FUNCTION public.zimba_manager_end_lease(p_lease uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();l zimba_lease_records%ROWTYPE;uid uuid;
BEGIN
 SELECT * INTO l FROM zimba_lease_records WHERE id=p_lease AND organization_id=org AND status='acknowledged' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only an acknowledged active lease may be marked ended' USING ERRCODE='42501'; END IF;
 IF l.end_date IS NULL OR l.end_date>current_date THEN RAISE EXCEPTION 'End date must have passed; early termination requires separately documented agreement' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN RAISE EXCEPTION 'Provide an audit reason of 12–500 characters' USING ERRCODE='22023'; END IF;
 UPDATE zimba_lease_records SET status='ended' WHERE id=p_lease;
 SELECT resident_auth_user_id INTO uid FROM resident_connections WHERE id=l.connection_id;
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id) VALUES(uid,'general','Lease status updated','Your landlord recorded the lease as ended. Review deposit settlement and keep copies of all records.','#/workspace/deposits',p_lease);
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'lease_marked_ended','lease',p_lease,jsonb_build_object('reason',btrim(p_reason),'contractEnd',l.end_date));
 RETURN jsonb_build_object('success',true,'status','ended','note','This status update is an administrative record and not an eviction or physical access change');
END $function$

REVOKE ALL ON FUNCTION public.zimba_manager_end_lease(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_end_lease(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.zimba_manager_review_deposit_refund(p_request uuid, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE org uuid:=public.zimba_my_manager_org();r zimba_deposit_refund_requests%ROWTYPE;tenant uuid;verified bigint;previous_approved bigint;
BEGIN
 SELECT r.* INTO r FROM zimba_deposit_refund_requests r JOIN zimba_lease_records l ON l.id=r.lease_id
 WHERE r.id=p_request AND l.organization_id=org AND l.status='ended' AND r.status='requested' FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending refund request not found for this organisation' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000 THEN RAISE EXCEPTION 'Provide a written review decision (15–1000 characters)' USING ERRCODE='22023'; END IF;
 IF p_approve THEN
 SELECT coalesce(sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END),0) INTO verified FROM zimba_deposit_ledger WHERE lease_id=r.lease_id;
 SELECT coalesce(sum(amount_ugx),0) INTO previous_approved FROM zimba_deposit_refund_requests WHERE lease_id=r.lease_id AND status='approved_pending_payout';
 IF r.amount_ugx>verified-previous_approved THEN RAISE EXCEPTION 'Verified held deposit is insufficient to approve this request' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE zimba_deposit_refund_requests SET status=CASE WHEN p_approve THEN 'approved_pending_payout' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),decision_note=btrim(p_note) WHERE id=r.id;
 SELECT c.resident_auth_user_id INTO tenant FROM zimba_lease_records l JOIN resident_connections c ON c.id=l.connection_id WHERE l.id=r.lease_id;
 INSERT INTO zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(tenant,'general',CASE WHEN p_approve THEN 'Deposit refund approved for review' ELSE 'Deposit refund request declined' END,CASE WHEN p_approve THEN 'Refund request approved pending external payout verification. No funds have been transferred.' ELSE 'Your landlord has responded to the refund request. View the decision.' END,'#/workspace/deposits',r.id);
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'deposit_refund_reviewed','deposit_refund',r.id,jsonb_build_object('approved',p_approve,'amount',r.amount_ugx,'reason',btrim(p_note)));
 RETURN jsonb_build_object('success',true,'status',CASE WHEN p_approve THEN 'approved_pending_payout' ELSE 'rejected' END,'moneyTransferred',false);
END $function$

REVOKE ALL ON FUNCTION public.zimba_manager_review_deposit_refund(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_review_deposit_refund(uuid,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
