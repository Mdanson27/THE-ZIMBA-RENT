-- ZIMBA RENT / 0019: Phase 3 property financial reporting.
-- Read-only, authenticated, property-scoped. Verified evidence only.
-- Security deposits are separate obligations, never treated as rent income.
CREATE OR REPLACE FUNCTION public.zimba_property_financial_report(p_property uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_org uuid:=public.zimba_my_manager_org();
 v_rent_roll jsonb;
 v_invoices jsonb;
 v_expenses jsonb;
 v_deposits jsonb;
 v_receipts jsonb;
 v_summary jsonb;
BEGIN
 IF p_property IS NULL OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND organization_id=v_org)
 THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'room',u.unit_number,'floor',u.floor_label,'status',u.status,
 'configuredRent',u.monthly_rent_ugx,
 'resident',a.name,'agreementRent',l.monthly_rent_ugx,'agreementStatus',l.status,
 'agreementStart',l.start_date,'rentStart',c.rent_start_date
 ) ORDER BY u.floor_label,u.unit_number),'[]'::jsonb) INTO v_rent_roll
 FROM (SELECT * FROM public.units WHERE property_id=p_property AND organization_id=v_org ORDER BY floor_label,unit_number LIMIT 500) u
 LEFT JOIN LATERAL (
 SELECT c.* FROM public.resident_connections c WHERE c.unit_id=u.id AND c.property_id=p_property AND c.organization_id=v_org AND c.status='active' ORDER BY c.linked_at DESC LIMIT 1
 ) c ON true
 LEFT JOIN neon_auth."user" a ON a.id=c.resident_auth_user_id
 LEFT JOIN LATERAL (
 SELECT l.* FROM public.zimba_lease_records l WHERE l.connection_id=c.id AND l.organization_id=v_org ORDER BY l.created_at DESC LIMIT 1
 ) l ON true;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',i.id,'reference',i.invoice_reference,'resident',a.name,
 'room',u.unit_number,'period',i.period_start,'due',i.due_date,'status',i.status,
 'invoiced',i.amount_ugx,'verifiedPaid',least(i.amount_ugx,coalesce(ev.paid,0)),
 'remaining',CASE WHEN i.status='void' THEN 0 ELSE greatest(i.amount_ugx-coalesce(ev.paid,0),0) END,
 'overpaymentFlag',coalesce(ev.paid,0)>i.amount_ugx
 ) ORDER BY i.due_date DESC),'[]'::jsonb) INTO v_invoices
 FROM (
 SELECT i.*,l.connection_id FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.property_id=p_property AND c.organization_id=v_org
 ORDER BY i.due_date DESC LIMIT 250
 ) i
 JOIN public.resident_connections c ON c.id=i.connection_id
 LEFT JOIN public.units u ON u.id=c.unit_id AND u.organization_id=v_org
 LEFT JOIN neon_auth."user" a ON a.id=c.resident_auth_user_id
 LEFT JOIN LATERAL (SELECT sum(e.amount_ugx) paid FROM public.zimba_payment_evidence e WHERE e.invoice_id=i.id) ev ON true;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'date',e.expense_date,
 'category',e.category,'description',e.description,'amount',e.amount_ugx)
 ORDER BY e.expense_date DESC,e.created_at DESC),'[]'::jsonb) INTO v_expenses
 FROM (SELECT * FROM public.property_expenses WHERE organization_id=v_org AND property_id=p_property ORDER BY expense_date DESC,created_at DESC LIMIT 200) e;

 SELECT coalesce(jsonb_agg(jsonb_build_object('leaseId',l.id,'resident',a.name,
 'required',l.deposit_required_ugx,'verifiedHeld',coalesce(d.held,0),
 'refunded',coalesce(d.refunded,0),'deducted',coalesce(d.deducted,0),
 'status',l.status) ORDER BY l.created_at DESC),'[]'::jsonb) INTO v_deposits
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org AND c.property_id=p_property
 LEFT JOIN neon_auth."user" a ON a.id=c.resident_auth_user_id
 LEFT JOIN LATERAL (SELECT sum(CASE WHEN entry_kind='verified_deposit' THEN amount_ugx ELSE -amount_ugx END) held,
 sum(amount_ugx) FILTER(WHERE entry_kind='verified_refund') refunded,
 sum(amount_ugx) FILTER(WHERE entry_kind='verified_deduction') deducted
 FROM public.zimba_deposit_ledger d WHERE d.lease_id=l.id) d ON true;

 SELECT coalesce(jsonb_agg(jsonb_build_object('receipt',e.receipt_reference,
 'invoice',i.invoice_reference,'amount',e.amount_ugx,
 'source',e.payment_source,'verifiedAt',e.verified_at,
 'transactionReference',e.external_transaction_id)
 ORDER BY e.verified_at DESC),'[]'::jsonb) INTO v_receipts
 FROM (SELECT e.*,i.invoice_reference FROM public.zimba_payment_evidence e
 JOIN public.zimba_rent_invoices i ON i.id=e.invoice_id
 JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.property_id=p_property AND c.organization_id=v_org
 ORDER BY e.verified_at DESC LIMIT 100) e
 JOIN public.zimba_rent_invoices i ON i.id=e.invoice_id;

 SELECT jsonb_build_object(
 'totalInvoiced',coalesce(sum(i.amount_ugx) FILTER(WHERE i.status<>'void'),0),
 'totalVerified',coalesce(sum(least(i.amount_ugx,coalesce(ev.paid,0))) FILTER(WHERE i.status<>'void'),0),
 'outstanding',coalesce(sum(greatest(i.amount_ugx-coalesce(ev.paid,0),0)) FILTER(WHERE i.status<>'void'),0),
 'overdue',coalesce(sum(greatest(i.amount_ugx-coalesce(ev.paid,0),0)) FILTER(WHERE i.status<>'void' AND i.due_date<CURRENT_DATE),0),
 'recordedExpenses',(SELECT coalesce(sum(amount_ugx),0) FROM public.property_expenses WHERE organization_id=v_org AND property_id=p_property),
 'depositHeld',(SELECT coalesce(sum(CASE WHEN d.entry_kind='verified_deposit' THEN d.amount_ugx ELSE -d.amount_ugx END),0)
 FROM public.zimba_deposit_ledger d JOIN public.zimba_lease_records l ON l.id=d.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org AND c.property_id=p_property)
 ) INTO v_summary
 FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org AND c.property_id=p_property
 LEFT JOIN LATERAL (SELECT sum(e.amount_ugx) paid FROM public.zimba_payment_evidence e WHERE e.invoice_id=i.id) ev ON true;

 RETURN jsonb_build_object('summary',v_summary,'rentRoll',v_rent_roll,
 'invoices',v_invoices,'expenses',v_expenses,'deposits',v_deposits,'receipts',v_receipts,
 'asOf',now(),'currency','UGX','verifiedPaymentsOnly',true);
END $function$

REVOKE ALL ON FUNCTION public.zimba_property_financial_report(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_property_financial_report(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
