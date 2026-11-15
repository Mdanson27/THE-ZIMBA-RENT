-- ZIMBA RENT 0028: quarantine rate-mismatched invoice amounts in read-only financial dashboards.
-- Original invoice and agreement preserved until tenant-approved correction.
CREATE OR REPLACE FUNCTION public.zimba_manager_overview_calendar(p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $f$
DECLARE
 v_org uuid:=public.zimba_my_manager_org();
 v_today date:=(now() AT TIME ZONE 'Africa/Kampala')::date;
 v_events jsonb;v_metrics jsonb;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL THEN
  RAISE EXCEPTION 'Authenticated property manager required' USING ERRCODE='42501';
 END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR (p_end-p_start)>62
 OR p_start<'2020-01-01'::date OR p_end>'2100-12-31'::date THEN
  RAISE EXCEPTION 'Choose a calendar period of up to 63 days' USING ERRCODE='22023';
 END IF;

 WITH invoice_balances AS (
  SELECT i.id,i.amount_ugx,i.due_date,i.status,
   (u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx) on_hold,
   CASE WHEN u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx THEN 0::bigint
    ELSE greatest(i.amount_ugx-coalesce(pay.total,0),0)::bigint END remaining
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  LEFT JOIN public.units u ON u.id=rc.unit_id AND u.organization_id=v_org
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(ev.amount_ugx),0)::bigint total
   FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id
  ) pay ON true WHERE i.status<>'void'
 )
 SELECT jsonb_build_object(
  'outstanding',coalesce(sum(remaining),0)::bigint,
  'overdueAmount',coalesce(sum(remaining) FILTER(WHERE due_date<v_today),0)::bigint,
  'overdueCount',count(*) FILTER(WHERE due_date<v_today AND remaining>0),
  'dueSoonCount',count(*) FILTER(WHERE due_date BETWEEN v_today AND v_today+7 AND remaining>0),
  'invoices',count(*),
  'onHoldCount',count(*) FILTER(WHERE on_hold),
  'onHoldOriginalAmount',coalesce(sum(amount_ugx) FILTER(WHERE on_hold),0)::bigint,
  'openMaintenance',(SELECT count(*) FROM public.maintenance_requests m
    WHERE m.organization_id=v_org AND m.status IN ('open','in_progress')),
  'urgentMaintenance',(SELECT count(*) FROM public.maintenance_requests m
    WHERE m.organization_id=v_org AND m.status IN ('open','in_progress') AND m.priority='urgent'),
  'pendingDepositRequests',(SELECT count(*) FROM public.zimba_deposit_refund_requests r
    JOIN public.zimba_lease_records l ON l.id=r.lease_id
    WHERE l.organization_id=v_org AND r.status='requested')
 ) INTO v_metrics FROM invoice_balances;

 WITH dates AS (
  SELECT i.id AS id,i.due_date AS event_date,'rent'::text kind,
   ('Invoice '||i.invoice_reference)::text title,p.title::text property,
   CASE WHEN u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx THEN 'under_review'
        WHEN remaining.balance=0 THEN 'paid'
        WHEN i.due_date<v_today THEN 'overdue'
        WHEN remaining.balance<i.amount_ugx THEN 'partial'
        ELSE 'unpaid' END::text status,
   CASE WHEN u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx
     THEN NULL::bigint ELSE remaining.balance::bigint END amount,
   '#/workspace/invoices'::text link,
   CASE WHEN u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx
     THEN ('On hold: agreement UGX '||l.monthly_rent_ugx||' differs from room UGX '||coalesce(u.monthly_rent_ugx::text,'not set'))
     ELSE ('Due '||i.due_date::text||' · '||i.invoice_reference) END::text detail
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  LEFT JOIN public.units u ON u.id=rc.unit_id AND u.organization_id=v_org
  CROSS JOIN LATERAL (
    SELECT greatest(i.amount_ugx-coalesce((SELECT sum(ev.amount_ugx)
      FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id),0),0)::bigint balance
  ) remaining
  WHERE i.status<>'void' AND i.due_date BETWEEN p_start AND p_end
  UNION ALL
  SELECT m.id,(m.created_at AT TIME ZONE 'Africa/Kampala')::date,'maintenance',
    left('Repair reported: '||m.issue,130),p.title,
    CASE WHEN m.status='completed' THEN 'completed' ELSE m.priority END,
    NULL::bigint,'#/workspace/maintenance',
    ('Reported '||(m.created_at AT TIME ZONE 'Africa/Kampala')::date::text||' · '||m.status)
  FROM public.maintenance_requests m
  JOIN public.properties p ON p.id=m.property_id AND p.organization_id=v_org
  WHERE m.organization_id=v_org AND (m.created_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN p_start AND p_end
  UNION ALL
  SELECT m.id,m.expected_completion,'maintenance',
    left('Repair target: '||m.issue,130),p.title,
    CASE WHEN m.status='completed' THEN 'completed'
         WHEN m.expected_completion<v_today THEN 'overdue' ELSE m.priority END,
    NULL::bigint,'#/workspace/maintenance',
    ('Expected completion · '||m.status)
  FROM public.maintenance_requests m
  JOIN public.properties p ON p.id=m.property_id AND p.organization_id=v_org
  WHERE m.organization_id=v_org AND m.expected_completion BETWEEN p_start AND p_end
    AND m.status NOT IN ('cancelled')
  UNION ALL
  SELECT l.id,l.start_date,'lease','Tenancy begins',p.title,'start',NULL::bigint,
    '#/workspace/lease','Lease status: '||l.status
  FROM public.zimba_lease_records l
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  WHERE l.organization_id=v_org AND l.status<>'draft' AND l.start_date BETWEEN p_start AND p_end
  UNION ALL
  SELECT l.id,l.end_date,'lease','Tenancy end date',p.title,
    CASE WHEN l.status='ended' THEN 'completed' WHEN l.end_date<v_today THEN 'overdue' ELSE 'upcoming' END,
    NULL::bigint,'#/workspace/lease','Review renewal, handover and refundable deposit'
  FROM public.zimba_lease_records l
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  WHERE l.organization_id=v_org AND l.status<>'draft' AND l.end_date BETWEEN p_start AND p_end
  UNION ALL
  SELECT d.id,d.end_date,'land','Land lease expiry',
    coalesce(pr.title,d.parcel_reference),
    CASE WHEN d.end_date<v_today THEN 'overdue' ELSE 'upcoming' END,
    NULL::bigint,'#/workspace/land-leases','Check renewal, title and registered lease terms'
  FROM public.zimba_land_lease_drafts d
  JOIN public.zimba_land_lease_parties lp ON lp.land_lease_id=d.id
   AND lp.organization_id=v_org AND lp.workflow_status='issued'
  LEFT JOIN public.properties pr ON pr.id=d.property_id AND pr.organization_id=v_org
  WHERE d.organization_id=v_org AND d.end_date BETWEEN p_start AND p_end
  UNION ALL
  SELECT r.id,(r.requested_at AT TIME ZONE 'Africa/Kampala')::date,'deposit','Deposit refund requested',
    p.title,r.status,r.amount_ugx,'#/workspace/deposits',
    'Refund requested · review deductions and approval'
  FROM public.zimba_deposit_refund_requests r
  JOIN public.zimba_lease_records l ON l.id=r.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  WHERE (r.requested_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN p_start AND p_end
  UNION ALL
  SELECT e.id,e.expense_date,'expense',left('Expense: '||e.description,130),
    coalesce(pr.title,'Organisation-wide'),'recorded',
    e.amount_ugx,'#/workspace/finance','Recorded expense · not a payment receipt'
  FROM public.property_expenses e
  LEFT JOIN public.properties pr ON pr.id=e.property_id AND pr.organization_id=v_org
  WHERE e.organization_id=v_org AND e.expense_date BETWEEN p_start AND p_end
 ),
 limited AS (
  SELECT id,event_date,kind,title,property,status,amount,link,detail
  FROM dates ORDER BY event_date,CASE WHEN status='overdue' THEN 0 ELSE 1 END,kind,id LIMIT 350
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'date',event_date,'kind',kind,'title',title,'property',property,
  'status',status,'amount',amount,'link',link,'detail',detail
 ) ORDER BY event_date,kind,id),'[]'::jsonb) INTO v_events FROM limited;

 RETURN jsonb_build_object('events',v_events,'metrics',v_metrics,
  'start',p_start,'end',p_end,'today',v_today,
  'note','Events are from recorded source dates. Unissued rent periods are not inferred.');
END $f$;



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
 'resident',a.name,'agreementRent',l.monthly_rent_ugx,
 'rateMismatch',CASE WHEN l.id IS NOT NULL THEN (u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx) ELSE false END,
 'agreementStatus',l.status,
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
 'room',u.unit_number,'period',i.period_start,'due',i.due_date,
 'billingHold',(u.monthly_rent_ugx IS DISTINCT FROM i.lease_rate),
 'status',CASE WHEN i.status<>'void' AND u.monthly_rent_ugx IS DISTINCT FROM i.lease_rate THEN 'under_review' ELSE i.status END,
 'invoiced',i.amount_ugx,'verifiedPaid',least(i.amount_ugx,coalesce(ev.paid,0)),
 'remaining',CASE WHEN i.status='void' OR u.monthly_rent_ugx IS DISTINCT FROM i.lease_rate
   THEN 0 ELSE greatest(i.amount_ugx-coalesce(ev.paid,0),0) END,
 'overpaymentFlag',coalesce(ev.paid,0)>i.amount_ugx
 ) ORDER BY i.due_date DESC),'[]'::jsonb) INTO v_invoices
 FROM (
 SELECT i.*,l.connection_id,l.monthly_rent_ugx AS lease_rate FROM public.zimba_rent_invoices i
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
 'totalInvoiced',coalesce(sum(i.amount_ugx) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS NOT DISTINCT FROM l.monthly_rent_ugx),0),
 'totalVerified',coalesce(sum(least(i.amount_ugx,coalesce(ev.paid,0))) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS NOT DISTINCT FROM l.monthly_rent_ugx),0),
 'outstanding',coalesce(sum(greatest(i.amount_ugx-coalesce(ev.paid,0),0)) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS NOT DISTINCT FROM l.monthly_rent_ugx),0),
 'overdue',coalesce(sum(greatest(i.amount_ugx-coalesce(ev.paid,0),0)) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS NOT DISTINCT FROM l.monthly_rent_ugx
   AND i.due_date<(now() AT TIME ZONE 'Africa/Kampala')::date),0),
 'onHoldInvoices',count(*) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx),
 'onHoldOriginalAmount',coalesce(sum(i.amount_ugx) FILTER(
   WHERE i.status<>'void' AND u.monthly_rent_ugx IS DISTINCT FROM l.monthly_rent_ugx),0),
 'recordedExpenses',(SELECT coalesce(sum(amount_ugx),0) FROM public.property_expenses WHERE organization_id=v_org AND property_id=p_property),
 'depositHeld',(SELECT coalesce(sum(CASE WHEN d.entry_kind='verified_deposit' THEN d.amount_ugx ELSE -d.amount_ugx END),0)
 FROM public.zimba_deposit_ledger d JOIN public.zimba_lease_records l ON l.id=d.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org AND c.property_id=p_property)
 ) INTO v_summary
 FROM public.zimba_rent_invoices i
 JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org AND c.property_id=p_property
 LEFT JOIN public.units u ON u.id=c.unit_id AND u.organization_id=v_org
 LEFT JOIN LATERAL (SELECT sum(e.amount_ugx) paid FROM public.zimba_payment_evidence e WHERE e.invoice_id=i.id) ev ON true;

 RETURN jsonb_build_object('summary',v_summary,'rentRoll',v_rent_roll,
 'invoices',v_invoices,'expenses',v_expenses,'deposits',v_deposits,'receipts',v_receipts,
 'asOf',now(),'currency','UGX','verifiedPaymentsOnly',true);
END $function$;
