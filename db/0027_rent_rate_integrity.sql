-- ZIMBA RENT 0027 — guard mismatched lease rates and consent-based billing correction.
-- Does NOT rewrite any historical record during migration. Only a tenant-approved
-- authenticated RPC may change an acknowledged lease and an unpaid invoice.
-- Never alter invoices with verified payment evidence or uploaded signed PDF.

CREATE TABLE IF NOT EXISTS public.zimba_rent_correction_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 lease_id uuid NOT NULL REFERENCES public.zimba_lease_records(id),
 old_monthly_ugx bigint NOT NULL CHECK(old_monthly_ugx>0),
 new_monthly_ugx bigint NOT NULL CHECK(new_monthly_ugx>0),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 1000),
 status text NOT NULL DEFAULT 'pending_tenant' CHECK(status IN ('pending_tenant','applied','rejected')),
 manager_auth_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 tenant_auth_id uuid,tenant_note text,responded_at timestamptz,
 CHECK(old_monthly_ugx<>new_monthly_ugx)
);
CREATE UNIQUE INDEX IF NOT EXISTS zimba_one_open_rent_correction
 ON public.zimba_rent_correction_requests(lease_id) WHERE status='pending_tenant';
CREATE INDEX IF NOT EXISTS zimba_rent_corrections_lease_idx
 ON public.zimba_rent_correction_requests(lease_id,created_at DESC);
ALTER TABLE public.zimba_rent_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_rent_correction_requests FROM PUBLIC,anonymous,authenticated;

CREATE TABLE IF NOT EXISTS public.zimba_invoice_amount_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 correction_id uuid NOT NULL REFERENCES public.zimba_rent_correction_requests(id),
 invoice_id uuid NOT NULL REFERENCES public.zimba_rent_invoices(id),
 original_amount_ugx bigint NOT NULL CHECK(original_amount_ugx>0),
 revised_amount_ugx bigint NOT NULL CHECK(revised_amount_ugx>0),
 corrected_at timestamptz NOT NULL DEFAULT now(),
 approved_by_tenant uuid NOT NULL,
 UNIQUE(correction_id,invoice_id)
);
CREATE INDEX IF NOT EXISTS zimba_invoice_corrected_history
 ON public.zimba_invoice_amount_corrections(invoice_id,corrected_at DESC);
ALTER TABLE public.zimba_invoice_amount_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_invoice_amount_corrections FROM PUBLIC,anonymous,authenticated;

-- Read the actual assigned unit's rent vs the acknowledged agreement (never
-- infer a different rate from another vacant room such as A-001).
CREATE OR REPLACE FUNCTION public.zimba_rent_integrity(p_mode text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_org uuid;v_uid uuid:=auth.uid();v_data jsonb;
BEGIN
 IF v_uid IS NULL OR p_mode NOT IN ('manager','tenant') THEN
  RAISE EXCEPTION 'Authenticated manager or tenant required' USING ERRCODE='42501';END IF;
 IF p_mode='manager' THEN v_org:=public.zimba_my_manager_org();END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'leaseId',l.id,'property',p.title,'unit',u.unit_number,
 'leaseRent',l.monthly_rent_ugx,'unitRent',u.monthly_rent_ugx,
 'mismatch',l.monthly_rent_ugx<>u.monthly_rent_ugx,
 'leaseStatus',l.status,
 'activeRequest',CASE WHEN req.id IS NULL THEN NULL ELSE jsonb_build_object(
   'id',req.id,'oldRent',req.old_monthly_ugx,'newRent',req.new_monthly_ugx,
   'reason',req.reason,'status',req.status,'createdAt',req.created_at,
   'managerAuthId',req.manager_auth_id) END,
 'lastCorrection',CASE WHEN recent.id IS NULL THEN NULL ELSE jsonb_build_object(
   'id',recent.id,'original',recent.original_amount_ugx,
   'revised',recent.revised_amount_ugx,'date',recent.corrected_at) END
 ) ORDER BY l.created_at DESC),'[]'::jsonb) INTO v_data
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.units u ON u.id=c.unit_id AND u.organization_id=l.organization_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 LEFT JOIN LATERAL(
  SELECT * FROM public.zimba_rent_correction_requests a
  WHERE a.lease_id=l.id AND a.status='pending_tenant'
  ORDER BY a.created_at DESC LIMIT 1
 ) req ON true
 LEFT JOIN LATERAL(
  SELECT ic.* FROM public.zimba_invoice_amount_corrections ic
  JOIN public.zimba_rent_invoices i ON i.id=ic.invoice_id AND i.lease_id=l.id
  ORDER BY ic.corrected_at DESC LIMIT 1
 ) recent ON true
 WHERE (p_mode='manager' AND l.organization_id=v_org)
 OR (p_mode='tenant' AND c.resident_auth_user_id=v_uid);
 RETURN v_data;
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_propose_rent_correction(
 p_lease uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();
 v_l public.zimba_lease_records%ROWTYPE;
 v_unit bigint;v_tenant uuid;v_id uuid;v_number integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
 SELECT l.* INTO v_l FROM public.zimba_lease_records l
 WHERE l.id=p_lease AND l.organization_id=v_org AND l.status='acknowledged'
 FOR UPDATE OF l;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acknowledged tenancy unavailable' USING ERRCODE='42501';END IF;
 SELECT u.monthly_rent_ugx,c.resident_auth_user_id INTO v_unit,v_tenant
 FROM public.resident_connections c
 JOIN public.units u ON u.id=c.unit_id AND u.organization_id=v_org
 WHERE c.id=v_l.connection_id AND c.organization_id=v_org AND c.status='active';
 IF v_unit IS NULL OR v_unit<=0 OR v_unit=v_l.monthly_rent_ugx THEN
  RAISE EXCEPTION 'There is no assigned unit rate discrepancy to correct' USING ERRCODE='22023';END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 20 AND 1000 THEN
  RAISE EXCEPTION 'Explain the incorrect agreement amount in 20–1000 characters' USING ERRCODE='22023';END IF;
 IF v_tenant=auth.uid() THEN
  RAISE EXCEPTION 'Manager and tenant must use separate accounts' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_lease_signed_scans WHERE lease_id=p_lease) THEN
  RAISE EXCEPTION 'This agreement has a stored signed document; formal re-signing is required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_rent_correction_requests
  WHERE lease_id=p_lease AND status='pending_tenant') THEN
  RAISE EXCEPTION 'Tenant review is already pending' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_rent_invoices i
  WHERE i.lease_id=p_lease AND i.status='paid') THEN
  RAISE EXCEPTION 'A paid invoice requires manual reconciliation and cannot be automatically amended' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_rent_invoices i
  WHERE i.lease_id=p_lease AND i.status<>'void' AND
  EXISTS(SELECT 1 FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id)) THEN
  RAISE EXCEPTION 'Existing verified payments require financial reconciliation before changing invoice values' USING ERRCODE='42501';END IF;
 INSERT INTO public.zimba_rent_correction_requests
 (organization_id,lease_id,old_monthly_ugx,new_monthly_ugx,reason,manager_auth_id)
 VALUES(v_org,p_lease,v_l.monthly_rent_ugx,v_unit,btrim(p_reason),auth.uid())
 RETURNING id INTO v_id;
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_tenant,'general','Review corrected monthly rent',
 'Your property manager identified a mismatch: the lease records UGX '||v_l.monthly_rent_ugx||
 ' while your assigned room shows UGX '||v_unit||
 '. Review the proposed correction; invoices remain under review until you decide.',
 '#/workspace/invoices',v_id);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'rent_correction_proposed','lease',p_lease,
 jsonb_build_object('request',v_id,'old',v_l.monthly_rent_ugx,'new',v_unit,'reason',p_reason));
 RETURN jsonb_build_object('id',v_id,'status','pending_tenant','newMonthlyRent',v_unit);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_tenant_answer_rent_correction(
 p_request uuid,p_accept boolean,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_uid uuid:=auth.uid();v_req public.zimba_rent_correction_requests%ROWTYPE;
 v_l public.zimba_lease_records%ROWTYPE;v_unit bigint;v_tenant uuid;
 v_changed integer:=0;v_i record;v_new bigint;v_end date;
BEGIN
 SELECT a.* INTO v_req FROM public.zimba_rent_correction_requests a
 JOIN public.zimba_lease_records l ON l.id=a.lease_id AND l.organization_id=a.organization_id
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 WHERE a.id=p_request AND a.status='pending_tenant' AND c.resident_auth_user_id=v_uid
 FOR UPDATE OF a;
 IF NOT FOUND OR v_req.manager_auth_id=v_uid THEN
  RAISE EXCEPTION 'Pending correction not available to this tenant' USING ERRCODE='42501';END IF;
 IF p_accept IS NULL OR
  (p_accept=false AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000) THEN
  RAISE EXCEPTION 'Accept or explain the dispute with at least 15 characters' USING ERRCODE='22023';END IF;
 SELECT * INTO v_l FROM public.zimba_lease_records
 WHERE id=v_req.lease_id AND organization_id=v_req.organization_id FOR UPDATE;
 IF v_l.status<>'acknowledged' OR v_l.monthly_rent_ugx<>v_req.old_monthly_ugx THEN
  RAISE EXCEPTION 'Tenancy terms have changed; request a new review' USING ERRCODE='42501';END IF;
 IF p_accept=false THEN
  UPDATE public.zimba_rent_correction_requests
  SET status='rejected',tenant_auth_id=v_uid,tenant_note=btrim(p_note),responded_at=now()
  WHERE id=p_request;
  INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
  SELECT au.external_auth_id::uuid,'general','Rent correction disputed',
   'The tenant disputed the proposed rental correction. Review the original agreement and contact the tenant.',
   '#/workspace/lease',p_request
  FROM public.memberships m JOIN public.app_users au ON au.id=m.user_id
  WHERE m.organization_id=v_req.organization_id AND m.status='active'
    AND m.role IN ('owner','admin','manager')
    AND au.external_auth_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
  VALUES(v_uid,v_req.organization_id,'rent_correction_disputed','lease',v_l.id,
  jsonb_build_object('request',p_request,'reason',p_note));
  RETURN jsonb_build_object('status','rejected','amountsChanged',false);
 END IF;
 SELECT u.monthly_rent_ugx,c.resident_auth_user_id INTO v_unit,v_tenant
 FROM public.resident_connections c
 JOIN public.units u ON u.id=c.unit_id AND u.organization_id=v_req.organization_id
 WHERE c.id=v_l.connection_id AND c.organization_id=v_req.organization_id AND c.status='active';
 IF v_unit IS DISTINCT FROM v_req.new_monthly_ugx OR v_tenant<>v_uid THEN
  RAISE EXCEPTION 'Assigned property rate or tenant has changed; refresh correction proposal' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_lease_signed_scans WHERE lease_id=v_l.id) THEN
  RAISE EXCEPTION 'Signed document exists; both parties must execute a new amendment' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_rent_invoices i
  WHERE i.lease_id=v_l.id AND i.status='paid') THEN
  RAISE EXCEPTION 'Previously paid invoices require independent accounting review' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.zimba_rent_invoices i
  WHERE i.lease_id=v_l.id AND i.status<>'void' AND
   EXISTS(SELECT 1 FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id)) THEN
  RAISE EXCEPTION 'Verified payment evidence prevents direct revision; reconcile manually' USING ERRCODE='42501';END IF;
 -- Avoid overwriting an invoice with unusual charges without review.
 FOR v_i IN SELECT i.* FROM public.zimba_rent_invoices i
  WHERE i.lease_id=v_l.id AND i.status<>'void'
  ORDER BY i.issued_at FOR UPDATE LOOP
  v_end:=(date_trunc('month',v_i.period_start::timestamp)+interval '1 month - 1 day')::date;
  IF v_i.amount_ugx<>round(v_req.old_monthly_ugx::numeric*
    (v_i.period_end-v_i.period_start+1)::numeric/extract(day from v_end)::numeric)::bigint THEN
   RAISE EXCEPTION 'Invoice includes nonstandard charges; manual reconciliation is required' USING ERRCODE='42501';END IF;
 END LOOP;
 -- Single transaction: tenant consent, lease amendment, revision archive and
 -- replacement values all commit together or roll back together.
 UPDATE public.zimba_lease_records SET monthly_rent_ugx=v_req.new_monthly_ugx
 WHERE id=v_l.id;
 FOR v_i IN SELECT i.* FROM public.zimba_rent_invoices i
  WHERE i.lease_id=v_l.id AND i.status<>'void'
  ORDER BY i.issued_at FOR UPDATE LOOP
  v_end:=(date_trunc('month',v_i.period_start::timestamp)+interval '1 month - 1 day')::date;
  v_new:=round(v_req.new_monthly_ugx::numeric*
    (v_i.period_end-v_i.period_start+1)::numeric/extract(day from v_end)::numeric)::bigint;
  IF v_new<1 THEN RAISE EXCEPTION 'Invalid corrected invoice total' USING ERRCODE='22023';END IF;
  INSERT INTO public.zimba_invoice_amount_corrections
   (correction_id,invoice_id,original_amount_ugx,revised_amount_ugx,approved_by_tenant)
  VALUES(p_request,v_i.id,v_i.amount_ugx,v_new,v_uid);
  UPDATE public.zimba_rent_invoices SET amount_ugx=v_new WHERE id=v_i.id;
  v_changed:=v_changed+1;
 END LOOP;
 UPDATE public.zimba_rent_correction_requests SET status='applied',tenant_auth_id=v_uid,
 tenant_note=left(btrim(coalesce(p_note,'')),1000),responded_at=now()
 WHERE id=p_request;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_req.organization_id,'rent_correction_applied','lease',v_l.id,
 jsonb_build_object('request',p_request,'old',v_req.old_monthly_ugx,
 'new',v_req.new_monthly_ugx,'invoicesCorrected',v_changed,'tenantApproved',true));
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_uid,'general','Rental amount and invoices corrected',
 'The monthly rent has been amended to UGX '||v_req.new_monthly_ugx||
 '. Your existing unpaid invoices have been revised. Previous amounts remain in the audit history.',
 '#/workspace/invoices',p_request);
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 SELECT au.external_auth_id::uuid,'general','Tenant approved rent correction',
  'The acknowledged agreement now uses UGX '||v_req.new_monthly_ugx||
  ' monthly; '||v_changed||' unpaid invoice(s) were corrected. Reissue/print the updated documents.',
  '#/workspace/invoices',p_request
 FROM public.memberships m JOIN public.app_users au ON au.id=m.user_id
 WHERE m.organization_id=v_req.organization_id AND m.status='active'
   AND m.role IN ('owner','admin','manager')
   AND au.external_auth_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 RETURN jsonb_build_object('status','applied','monthlyRent',v_req.new_monthly_ugx,
 'invoicesCorrected',v_changed,'tenantApproved',true);
END $f$;

-- Guard future invoice INSERTs. Existing invoice rows remain untouched until
-- the explicit tenant-approved correction action above.
CREATE OR REPLACE FUNCTION public.zimba_rent_invoice_rate_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_lease bigint;v_unit bigint;
BEGIN
 SELECT l.monthly_rent_ugx,u.monthly_rent_ugx INTO v_lease,v_unit
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.units u ON u.id=c.unit_id AND u.organization_id=l.organization_id
 WHERE l.id=NEW.lease_id;
 IF v_unit IS NULL OR v_unit<1 OR v_lease<>v_unit THEN
  RAISE EXCEPTION 'Invoice blocked: agreed rent differs from assigned unit. Correct and approve the rent agreement first.'
   USING ERRCODE='22023';END IF;
 RETURN NEW;
END $f$;
CREATE OR REPLACE TRIGGER zimba_invoice_rate_guard_trg
 BEFORE INSERT ON public.zimba_rent_invoices
 FOR EACH ROW EXECUTE FUNCTION public.zimba_rent_invoice_rate_guard();


-- Block fresh issued or acknowledged leases whose specified rent does not
-- match the assigned unit, so another UGX 5m vs 550k discrepancy cannot begin.
CREATE OR REPLACE FUNCTION public.zimba_lease_rate_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_unit bigint;
BEGIN
 IF NEW.status NOT IN ('issued','acknowledged') THEN RETURN NEW;END IF;
 SELECT u.monthly_rent_ugx INTO v_unit FROM public.resident_connections c
 JOIN public.units u ON u.id=c.unit_id AND u.organization_id=NEW.organization_id
 WHERE c.id=NEW.connection_id AND c.organization_id=NEW.organization_id;
 IF v_unit IS NULL OR v_unit<1 OR NEW.monthly_rent_ugx<>v_unit THEN
  RAISE EXCEPTION 'Agreement cannot be issued: entered monthly rent differs from the assigned room rate. Review the unit and draft amounts first.'
  USING ERRCODE='22023';END IF;
 RETURN NEW;
END $f$;
CREATE OR REPLACE TRIGGER zimba_lease_rate_guard_trg
 BEFORE INSERT OR UPDATE OF monthly_rent_ugx,status ON public.zimba_lease_records
 FOR EACH ROW EXECUTE FUNCTION public.zimba_lease_rate_guard();

REVOKE ALL ON FUNCTION public.zimba_rent_integrity(text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_propose_rent_correction(uuid,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_answer_rent_correction(uuid,boolean,text) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_rent_invoice_rate_guard() FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.zimba_lease_rate_guard() FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_rent_integrity(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_propose_rent_correction(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_answer_rent_correction(uuid,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
