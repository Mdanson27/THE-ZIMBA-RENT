-- ZIMBA RENT 0025 — private deposit receipts, deductions, and refund confirmation.
-- Never treat a manager's receipt assertion as bank-verified, nor an approved
-- payout as transferred. Real fund movement remains external to ZIMBA.
-- Only the linked tenant and the property's authorised organisation staff are notified.

CREATE TABLE IF NOT EXISTS public.zimba_deposit_receipt_attestations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lease_id uuid NOT NULL REFERENCES public.zimba_lease_records(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 amount_ugx bigint NOT NULL CHECK(amount_ugx>0),
 reference text NOT NULL CHECK(length(reference) BETWEEN 5 AND 150),
 received_on date NOT NULL,
 note text NOT NULL CHECK(length(note) BETWEEN 15 AND 1000),
 reported_by uuid NOT NULL,reported_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','tenant_acknowledged','disputed')),
 tenant_responded_at timestamptz,tenant_note text,
 UNIQUE(lease_id,reference)
);
ALTER TABLE public.zimba_deposit_receipt_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_deposit_receipt_attestations FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_deposit_receipts_lease_idx ON public.zimba_deposit_receipt_attestations(lease_id,reported_at DESC);

CREATE TABLE IF NOT EXISTS public.zimba_deposit_settlement_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.zimba_deposit_refund_requests(id),
 lease_id uuid NOT NULL REFERENCES public.zimba_lease_records(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 12),
 gross_ugx bigint NOT NULL CHECK(gross_ugx>0),
 deductions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(deductions)='array'),
 deducted_ugx bigint NOT NULL CHECK(deducted_ugx>=0),
 refund_ugx bigint NOT NULL CHECK(refund_ugx>=0),
 decision_note text NOT NULL CHECK(length(decision_note) BETWEEN 20 AND 1000),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN
  ('proposed','accepted','disputed','superseded','awaiting_confirmation','confirmed','payout_disputed')),
 proposed_by uuid NOT NULL, proposed_at timestamptz NOT NULL DEFAULT now(),
 tenant_responded_at timestamptz,tenant_response text,
 transfer_reference text,transfer_reported_at timestamptz,transfer_date date,
 confirmed_by uuid,confirmed_at timestamptz,
 CHECK(gross_ugx=deducted_ugx+refund_ugx),
 UNIQUE(request_id,revision)
);
ALTER TABLE public.zimba_deposit_settlement_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_deposit_settlement_proposals FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_deposit_proposals_lease_idx ON public.zimba_deposit_settlement_proposals(lease_id,proposed_at DESC);

-- Notifications are private to the connected tenant and active owner/admin/manager
-- membership. Other unrelated tenants in the same building never see amounts.
CREATE OR REPLACE FUNCTION public.zimba_deposit_notify_parties(
 p_lease uuid,p_title text,p_body text,p_related uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid;v_tenant uuid;
BEGIN
 SELECT l.organization_id,c.resident_auth_user_id INTO v_org,v_tenant
 FROM public.zimba_lease_records l JOIN public.resident_connections c
 ON c.id=l.connection_id AND c.organization_id=l.organization_id WHERE l.id=p_lease;
 IF v_org IS NULL THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 SELECT recipients.recipient,'general',left(p_title,120),left(p_body,300),'#/workspace/deposits',p_related
 FROM (
 SELECT v_tenant AS recipient
 UNION
 SELECT a.external_auth_id::uuid FROM public.memberships m
 JOIN public.app_users a ON a.id=m.user_id
 WHERE m.organization_id=v_org AND m.status='active'
 AND m.role IN ('owner','admin','manager')
 AND a.external_auth_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND EXISTS(SELECT 1 FROM neon_auth."user" u WHERE u.id=a.external_auth_id::uuid)
 ) recipients WHERE recipients.recipient IS NOT NULL;
END $f$;

-- Agreement deposits notify once when issued, not every time a draft is edited.
CREATE OR REPLACE FUNCTION public.zimba_deposit_agreement_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
BEGIN
 IF NEW.deposit_required_ugx>0 AND NEW.status IN ('issued','acknowledged')
 AND (TG_OP='INSERT' OR OLD.status='draft' OR OLD.deposit_required_ugx IS DISTINCT FROM NEW.deposit_required_ugx) THEN
 PERFORM public.zimba_deposit_notify_parties(NEW.id,
 'Security deposit amount agreed',
 'The tenancy agreement specifies a security deposit. Review the agreed amount and conditions; this is not proof of receipt.',NEW.id);
 END IF;
 RETURN NEW;
END $f$;
CREATE OR REPLACE TRIGGER zimba_deposit_agreement_notice_trg
AFTER INSERT OR UPDATE OF status,deposit_required_ugx ON public.zimba_lease_records
FOR EACH ROW EXECUTE FUNCTION public.zimba_deposit_agreement_notice();

CREATE OR REPLACE FUNCTION public.zimba_deposit_workspace(p_mode text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_org uuid;v_result jsonb;
BEGIN
 IF v_uid IS NULL OR p_mode NOT IN ('manager','tenant') THEN
  RAISE EXCEPTION 'Authenticated workspace mode required' USING ERRCODE='42501';END IF;
 IF p_mode='manager' THEN v_org:=public.zimba_my_manager_org(); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'leaseId',l.id,'tenant',coalesce(nullif(btrim(u.name),''),'Tenant'),
 'tenantAuthId',c.resident_auth_user_id,'property',p.title,'propertyId',p.id,
 'unit',coalesce(un.unit_number,''),'required',l.deposit_required_ugx,
 'leaseStatus',l.status,'start',l.start_date,'end',l.end_date,
 'depositConditions',l.deposit_terms,
 'verifiedHeld',coalesce(ledger.balance,0),'verifiedReceived',coalesce(ledger.credited,0),
 'verifiedRefunded',coalesce(ledger.refunded,0),
 'verifiedDeducted',coalesce(ledger.deducted,0),
 'reportedReceived',coalesce(recv.reported,0),
 'acknowledgedReceived',coalesce(recv.acknowledged,0),
 'confirmedRefunds',coalesce(settled.refunded,0),
 'confirmedDeductions',coalesce(settled.deducted,0),
 'receipts',coalesce(receipt_rows.rows,'[]'::jsonb),
 'requests',coalesce(request_rows.rows,'[]'::jsonb)
 ) ORDER BY l.created_at DESC),'[]'::jsonb) INTO v_result
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 JOIN neon_auth."user" u ON u.id=c.resident_auth_user_id
 LEFT JOIN public.units un ON un.id=c.unit_id AND un.property_id=p.id
 LEFT JOIN LATERAL(
 SELECT coalesce(sum(amount_ugx) FILTER(WHERE entry_kind='verified_deposit'),0)::bigint credited,
 coalesce(sum(amount_ugx) FILTER(WHERE entry_kind='verified_refund'),0)::bigint refunded,
 coalesce(sum(amount_ugx) FILTER(WHERE entry_kind='verified_deduction'),0)::bigint deducted,
 coalesce(sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END),0)::bigint balance
 FROM public.zimba_deposit_ledger WHERE lease_id=l.id
 ) ledger ON true
 LEFT JOIN LATERAL(
 SELECT coalesce(sum(amount_ugx),0)::bigint reported,
 coalesce(sum(amount_ugx) FILTER(WHERE status='tenant_acknowledged'),0)::bigint acknowledged
 FROM public.zimba_deposit_receipt_attestations WHERE lease_id=l.id
 ) recv ON true
 LEFT JOIN LATERAL(
 SELECT coalesce(sum(refund_ugx),0)::bigint refunded,
 coalesce(sum(deducted_ugx),0)::bigint deducted
 FROM public.zimba_deposit_settlement_proposals
 WHERE lease_id=l.id AND status='confirmed'
 ) settled ON true
 LEFT JOIN LATERAL(
 SELECT jsonb_agg(jsonb_build_object('id',ra.id,'amount',ra.amount_ugx,
 'reference',ra.reference,'receivedOn',ra.received_on,'note',ra.note,
 'status',ra.status,'reportedAt',ra.reported_at,'tenantRespondedAt',ra.tenant_responded_at,
 'tenantNote',ra.tenant_note) ORDER BY ra.reported_at DESC) rows
 FROM public.zimba_deposit_receipt_attestations ra WHERE ra.lease_id=l.id
 ) receipt_rows ON true
 LEFT JOIN LATERAL(
 SELECT jsonb_agg(jsonb_build_object(
 'id',r.id,'amount',r.amount_ugx,'reason',r.reason,'status',r.status,
 'requestedAt',r.requested_at,'decision',r.decision_note,
 'proposals',coalesce((
 SELECT jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,
 'gross',s.gross_ugx,'deductions',s.deductions,'deducted',s.deducted_ugx,
 'refund',s.refund_ugx,'decision',s.decision_note,'status',s.status,
 'proposedAt',s.proposed_at,'tenantResponse',s.tenant_response,
 'transferReference',s.transfer_reference,'transferReportedAt',s.transfer_reported_at,
 'confirmedAt',s.confirmed_at) ORDER BY s.revision DESC)
 FROM public.zimba_deposit_settlement_proposals s WHERE s.request_id=r.id
 ),'[]'::jsonb)
 ) ORDER BY r.requested_at DESC) rows
 FROM public.zimba_deposit_refund_requests r WHERE r.lease_id=l.id
 ) request_rows ON true
 WHERE (p_mode='manager' AND l.organization_id=v_org)
 OR (p_mode='tenant' AND c.resident_auth_user_id=v_uid);
 RETURN v_result;
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_attest_deposit_receipt(
 p_lease uuid,p_amount bigint,p_reference text,p_received_on date,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_l public.zimba_lease_records%ROWTYPE;
 v_total bigint;v_id uuid;
BEGIN
 SELECT * INTO v_l FROM public.zimba_lease_records
 WHERE id=p_lease AND organization_id=v_org AND status IN ('issued','acknowledged','ended') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Issued tenancy not available' USING ERRCODE='42501';END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_received_on IS NULL OR p_received_on>current_date
 OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 5 AND 150
 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000 THEN
 RAISE EXCEPTION 'Amount, past receipt date, valid reference and evidence note required' USING ERRCODE='22023';END IF;
 SELECT coalesce(sum(amount_ugx),0)::bigint INTO v_total
 FROM public.zimba_deposit_receipt_attestations WHERE lease_id=p_lease AND status<>'disputed';
 IF p_amount+v_total>v_l.deposit_required_ugx THEN
 RAISE EXCEPTION 'Receipt attestations exceed the agreed deposit amount' USING ERRCODE='22023';END IF;
 INSERT INTO public.zimba_deposit_receipt_attestations(
 lease_id,organization_id,amount_ugx,reference,received_on,note,reported_by)
 VALUES(p_lease,v_org,p_amount,btrim(p_reference),p_received_on,btrim(p_note),auth.uid())
 RETURNING id INTO v_id;
 PERFORM public.zimba_deposit_notify_parties(p_lease,'Security deposit receipt reported',
 'The property manager recorded receiving a security deposit. The tenant must review the amount and reference. Bank reconciliation is separate.',v_id);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'deposit_receipt_attested','deposit_receipt',v_id,
 jsonb_build_object('amount',p_amount,'reference',p_reference,'receivedOn',p_received_on));
 RETURN jsonb_build_object('id',v_id,'status','reported','bankVerified',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_respond_deposit_receipt(
 p_receipt uuid,p_accept boolean,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_r public.zimba_deposit_receipt_attestations%ROWTYPE;
 v_status text;
BEGIN
 SELECT ra.* INTO v_r FROM public.zimba_deposit_receipt_attestations ra
 JOIN public.zimba_lease_records l ON l.id=ra.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE ra.id=p_receipt AND c.resident_auth_user_id=v_uid AND ra.status='reported'
 FOR UPDATE OF ra;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not available or already answered' USING ERRCODE='42501';END IF;
 IF p_accept IS DISTINCT FROM true AND length(btrim(coalesce(p_note,'')))<15 THEN
 RAISE EXCEPTION 'Explain the disputed receipt in at least 15 characters' USING ERRCODE='22023';END IF;
 v_status:=CASE WHEN p_accept THEN 'tenant_acknowledged' ELSE 'disputed' END;
 UPDATE public.zimba_deposit_receipt_attestations SET status=v_status,
 tenant_responded_at=now(),tenant_note=left(btrim(coalesce(p_note,'')),1000) WHERE id=p_receipt;
 PERFORM public.zimba_deposit_notify_parties(v_r.lease_id,'Security deposit receipt reviewed',
 CASE WHEN p_accept THEN 'Tenant acknowledged the stated deposit receipt (bank verification is separate).'
 ELSE 'Tenant disputed the reported deposit receipt. Review the evidence and written explanation.' END,p_receipt);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_r.organization_id,'deposit_receipt_tenant_response','deposit_receipt',p_receipt,
 jsonb_build_object('accepted',p_accept,'note',left(coalesce(p_note,''),1000)));
 RETURN jsonb_build_object('status',v_status,'bankVerified',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_start_deposit_refund(
 p_lease uuid,p_amount bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_l public.zimba_lease_records%ROWTYPE;v_id uuid;
BEGIN
 SELECT l.* INTO v_l FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE l.id=p_lease AND c.resident_auth_user_id=v_uid FOR UPDATE OF l;
 IF NOT FOUND OR v_l.status<>'ended' THEN RAISE EXCEPTION 'Refund requests require an ended tenancy' USING ERRCODE='42501';END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>v_l.deposit_required_ugx
 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 15 AND 1000 THEN
 RAISE EXCEPTION 'Amount and a clear request reason (15–1000 characters) required' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_deposit_refund_requests
 WHERE lease_id=p_lease AND status IN ('requested','approved_pending_payout')) THEN
 RAISE EXCEPTION 'Finish the current open deposit request first' USING ERRCODE='22023';END IF;
 INSERT INTO public.zimba_deposit_refund_requests(lease_id,amount_ugx,reason)
 VALUES(p_lease,p_amount,btrim(p_reason)) RETURNING id INTO v_id;
 PERFORM public.zimba_deposit_notify_parties(p_lease,'Tenant requested a deposit refund',
 'A refund request was submitted. Review receipt evidence, property inspection and any proposed deductions.',v_id);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_l.organization_id,'deposit_refund_requested_v2','deposit_refund',v_id,
 jsonb_build_object('amount',p_amount,'reason',p_reason));
 RETURN jsonb_build_object('id',v_id,'status','requested','moneyTransferred',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_propose_deposit_refund(
 p_request uuid,p_deductions jsonb,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_r public.zimba_deposit_refund_requests%ROWTYPE;
 v_l public.zimba_lease_records%ROWTYPE;v_item jsonb;v_deduct bigint:=0;
 v_amt bigint;v_rev integer;v_id uuid;v_previous public.zimba_deposit_settlement_proposals%ROWTYPE;
BEGIN
 SELECT r.* INTO v_r FROM public.zimba_deposit_refund_requests r
 JOIN public.zimba_lease_records l ON l.id=r.lease_id
 WHERE r.id=p_request AND l.organization_id=v_org AND l.status='ended'
 AND r.status='requested' FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open refund request not found' USING ERRCODE='42501';END IF;
 IF p_deductions IS NULL OR jsonb_typeof(p_deductions)<>'array'
 OR jsonb_array_length(p_deductions)>12
 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 20 AND 1000 THEN
 RAISE EXCEPTION 'Written decision (20–1000 characters) and deduction list required' USING ERRCODE='22023';END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_deductions) LOOP
  IF jsonb_typeof(v_item)<>'object' OR coalesce(v_item->>'amount','') !~ '^[0-9]{1,12}$'
  OR length(btrim(coalesce(v_item->>'reason',''))) NOT BETWEEN 20 AND 500
  OR length(btrim(coalesce(v_item->>'evidence',''))) NOT BETWEEN 8 AND 250
  THEN RAISE EXCEPTION 'Each deduction needs an amount, clear reason (20–500) and evidence reference (8–250)' USING ERRCODE='22023';END IF;
  v_amt:=(v_item->>'amount')::bigint;
  IF v_amt<=0 THEN RAISE EXCEPTION 'Deductions must be positive' USING ERRCODE='22023';END IF;
  v_deduct:=v_deduct+v_amt;
 END LOOP;
 IF v_deduct>v_r.amount_ugx THEN RAISE EXCEPTION 'Deductions exceed the requested amount' USING ERRCODE='22023';END IF;
 SELECT * INTO v_previous FROM public.zimba_deposit_settlement_proposals
 WHERE request_id=p_request ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF v_previous.id IS NOT NULL AND v_previous.status<>'disputed' THEN
 RAISE EXCEPTION 'Current settlement must be answered before a revised proposal' USING ERRCODE='42501';END IF;
 v_rev:=coalesce(v_previous.revision,0)+1;
 IF v_rev>12 THEN RAISE EXCEPTION 'Maximum proposal revisions reached' USING ERRCODE='22023';END IF;
 IF v_previous.id IS NOT NULL THEN
 UPDATE public.zimba_deposit_settlement_proposals SET status='superseded'
 WHERE id=v_previous.id;END IF;
 INSERT INTO public.zimba_deposit_settlement_proposals(
 request_id,lease_id,organization_id,revision,gross_ugx,deductions,
 deducted_ugx,refund_ugx,decision_note,proposed_by)
 VALUES(p_request,v_r.lease_id,v_org,v_rev,v_r.amount_ugx,p_deductions,
 v_deduct,v_r.amount_ugx-v_deduct,btrim(p_note),auth.uid())
 RETURNING id INTO v_id;
 PERFORM public.zimba_deposit_notify_parties(v_r.lease_id,'Deposit refund decision proposed',
 'The property manager proposed a deposit settlement. Review every deduction, reason and evidence reference before agreeing or disputing.',v_id);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'deposit_settlement_proposed','deposit_refund',p_request,
 jsonb_build_object('proposalId',v_id,'deductions',p_deductions,'gross',v_r.amount_ugx,
 'return',v_r.amount_ugx-v_deduct,'reason',p_note));
 RETURN jsonb_build_object('id',v_id,'status','proposed','refund',v_r.amount_ugx-v_deduct,'deducted',v_deduct,'moneyTransferred',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_answer_deposit_proposal(
 p_proposal uuid,p_accept boolean,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_s public.zimba_deposit_settlement_proposals%ROWTYPE;
 v_status text;
BEGIN
 SELECT s.* INTO v_s FROM public.zimba_deposit_settlement_proposals s
 JOIN public.zimba_lease_records l ON l.id=s.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE s.id=p_proposal AND s.status='proposed' AND c.resident_auth_user_id=v_uid FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settlement proposal unavailable' USING ERRCODE='42501';END IF;
 IF p_accept IS DISTINCT FROM true AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000 THEN
 RAISE EXCEPTION 'Explain the dispute in 15–1000 characters' USING ERRCODE='22023';END IF;
 v_status:=CASE WHEN p_accept THEN 'accepted' ELSE 'disputed' END;
 UPDATE public.zimba_deposit_settlement_proposals SET status=v_status,
 tenant_responded_at=now(),tenant_response=left(btrim(coalesce(p_note,'')),1000) WHERE id=p_proposal;
 PERFORM public.zimba_deposit_notify_parties(v_s.lease_id,'Tenant reviewed deposit deductions',
 CASE WHEN p_accept THEN 'The tenant accepted the proposed settlement. No refund has been transferred yet.'
 ELSE 'The tenant disputed the proposed deductions or refund. Review the written reasons before revising.' END,p_proposal);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_s.organization_id,'deposit_settlement_tenant_response','deposit_refund',v_s.request_id,
 jsonb_build_object('proposalId',p_proposal,'accepted',p_accept,'reason',p_note));
 RETURN jsonb_build_object('status',v_status,'moneyTransferred',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_report_deposit_payout(
 p_proposal uuid,p_reference text,p_transfer_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_s public.zimba_deposit_settlement_proposals%ROWTYPE;
 v_verified bigint;v_attested bigint;v_other bigint;v_spent bigint;v_basis bigint;
BEGIN
 SELECT * INTO v_s FROM public.zimba_deposit_settlement_proposals
 WHERE id=p_proposal AND organization_id=v_org AND status='accepted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant-accepted proposal not found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.zimba_lease_records
 WHERE id=v_s.lease_id AND organization_id=v_org AND status='ended' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ended lease not found' USING ERRCODE='42501';END IF;
 IF p_transfer_date IS NULL OR p_transfer_date>current_date OR p_transfer_date<current_date-365
 OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 8 AND 160 THEN
 RAISE EXCEPTION 'Document the external payout date and reference (8–160 characters)' USING ERRCODE='22023';END IF;
 SELECT coalesce(sum(amount_ugx) FILTER(WHERE entry_kind='verified_deposit'),0)::bigint
 INTO v_verified FROM public.zimba_deposit_ledger WHERE lease_id=v_s.lease_id;
 SELECT coalesce(sum(amount_ugx),0)::bigint INTO v_attested
 FROM public.zimba_deposit_receipt_attestations
 WHERE lease_id=v_s.lease_id AND status='tenant_acknowledged';
 v_basis:=greatest(v_verified,v_attested);
 SELECT coalesce(sum(refund_ugx+deducted_ugx),0)::bigint INTO v_other
 FROM public.zimba_deposit_settlement_proposals
 WHERE lease_id=v_s.lease_id AND status IN ('confirmed','awaiting_confirmation') AND id<>v_s.id;
 SELECT coalesce(sum(amount_ugx),0)::bigint INTO v_spent
 FROM public.zimba_deposit_ledger WHERE lease_id=v_s.lease_id AND entry_kind IN ('verified_refund','verified_deduction');
 IF v_s.gross_ugx>v_basis-greatest(v_other,v_spent) THEN
 RAISE EXCEPTION 'Insufficient jointly acknowledged or independently verified deposit. Reconcile receipt evidence first.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_deposit_settlement_proposals
 WHERE transfer_reference=btrim(p_reference) AND id<>p_proposal) THEN
 RAISE EXCEPTION 'Payout reference already used' USING ERRCODE='22023';END IF;
 UPDATE public.zimba_deposit_settlement_proposals SET status='awaiting_confirmation',
 transfer_reference=btrim(p_reference),transfer_date=p_transfer_date,transfer_reported_at=now()
 WHERE id=p_proposal;
 UPDATE public.zimba_deposit_refund_requests SET status='approved_pending_payout',
 reviewed_by=auth.uid(),reviewed_at=now(),decision_note=v_s.decision_note WHERE id=v_s.request_id;
 PERFORM public.zimba_deposit_notify_parties(v_s.lease_id,'Deposit payout reported by manager',
 'The manager reported an external refund or deduction settlement. Tenant: confirm actual receipt or report that money was not received.',p_proposal);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'deposit_payout_reported','deposit_refund',v_s.request_id,
 jsonb_build_object('proposalId',p_proposal,'reference',p_reference,'refund',v_s.refund_ugx,
 'deducted',v_s.deducted_ugx,'bankVerified',false));
 RETURN jsonb_build_object('status','awaiting_confirmation','moneyTransferredVerified',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_confirm_deposit_payout(
 p_proposal uuid,p_confirm boolean,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_s public.zimba_deposit_settlement_proposals%ROWTYPE;v_status text;
BEGIN
 SELECT s.* INTO v_s FROM public.zimba_deposit_settlement_proposals s
 JOIN public.zimba_lease_records l ON l.id=s.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE s.id=p_proposal AND c.resident_auth_user_id=v_uid AND s.status='awaiting_confirmation'
 FOR UPDATE OF s;
 IF NOT FOUND OR v_s.proposed_by=v_uid THEN
 RAISE EXCEPTION 'Payout awaiting this tenant account not found' USING ERRCODE='42501';END IF;
 IF p_confirm IS DISTINCT FROM true AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000 THEN
 RAISE EXCEPTION 'Explain the missing or incorrect refund in 15–1000 characters' USING ERRCODE='22023';END IF;
 v_status:=CASE WHEN p_confirm THEN 'confirmed' ELSE 'payout_disputed' END;
 UPDATE public.zimba_deposit_settlement_proposals SET status=v_status,
 confirmed_by=CASE WHEN p_confirm THEN v_uid ELSE NULL END,
 confirmed_at=CASE WHEN p_confirm THEN now() ELSE NULL END,
 tenant_response=left(btrim(coalesce(p_note,'')),1000) WHERE id=p_proposal;
 IF p_confirm THEN
 UPDATE public.zimba_deposit_refund_requests SET status='settled' WHERE id=v_s.request_id;
 ELSE
 UPDATE public.zimba_deposit_refund_requests SET status='requested' WHERE id=v_s.request_id;
 END IF;
 PERFORM public.zimba_deposit_notify_parties(v_s.lease_id,'Security deposit refund confirmation',
 CASE WHEN p_confirm THEN 'Tenant confirmed receiving the reported refund and reviewed deductions. External bank reconciliation remains separate.'
 ELSE 'Tenant disputes receipt or amount of the reported payout. Resolve the difference and preserve the evidence.' END,p_proposal);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_s.organization_id,'deposit_payout_tenant_response','deposit_refund',v_s.request_id,
 jsonb_build_object('proposalId',p_proposal,'confirmed',p_confirm,'note',p_note,'refund',v_s.refund_ugx,
 'deducted',v_s.deducted_ugx,'bankVerified',false));
 RETURN jsonb_build_object('status',v_status,'tenantConfirmed',p_confirm,'bankVerified',false);
END $f$;

REVOKE ALL ON FUNCTION public.zimba_deposit_notify_parties(uuid,text,text,uuid) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.zimba_deposit_agreement_notice() FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.zimba_deposit_workspace(text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_attest_deposit_receipt(uuid,bigint,text,date,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_respond_deposit_receipt(uuid,boolean,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_start_deposit_refund(uuid,bigint,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_propose_deposit_refund(uuid,jsonb,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_answer_deposit_proposal(uuid,boolean,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_report_deposit_payout(uuid,text,date) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_confirm_deposit_payout(uuid,boolean,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_deposit_workspace(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_attest_deposit_receipt(uuid,bigint,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_respond_deposit_receipt(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_start_deposit_refund(uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_propose_deposit_refund(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_answer_deposit_proposal(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_report_deposit_payout(uuid,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_confirm_deposit_payout(uuid,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
