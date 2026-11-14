-- ZIMBA 0026: organisation-scoped portfolio calendar + truthful invoice metrics.
-- Events are derived only from recorded dates. No guessed rent schedules or fabricated payments.
-- Uses Africa/Kampala for overdue day boundaries.
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
   greatest(i.amount_ugx-coalesce(pay.total,0),0)::bigint remaining
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
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
  'openMaintenance',(SELECT count(*) FROM public.maintenance_requests m
    WHERE m.organization_id=v_org AND m.status IN ('open','in_progress')),
  'urgentMaintenance',(SELECT count(*) FROM public.maintenance_requests m
    WHERE m.organization_id=v_org AND m.status IN ('open','in_progress') AND m.priority='urgent'),
  'pendingDepositRequests',(SELECT count(*) FROM public.zimba_deposit_refund_requests r
    JOIN public.zimba_lease_records l ON l.id=r.lease_id
    WHERE l.organization_id=v_org AND r.status='requested')
 ) INTO v_metrics FROM invoice_balances;

 WITH dates AS (
  SELECT i.id id,i.due_date day,'rent'::text kind,
   ('Invoice '||i.invoice_reference)::text title,p.title::text property,
   CASE WHEN remaining.balance=0 THEN 'paid'
        WHEN i.due_date<v_today THEN 'overdue'
        WHEN remaining.balance<i.amount_ugx THEN 'partial'
        ELSE 'unpaid' END::text status,
   remaining.balance::bigint amount,'#/workspace/invoices'::text link,
   ('Due '||i.due_date::text||' · '||i.invoice_reference)::text detail
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  CROSS JOIN LATERAL (
    SELECT greatest(i.amount_ugx-coalesce((SELECT sum(ev.amount_ugx)
      FROM public.zimba_payment_evidence ev WHERE ev.invoice_id=i.id),0),0)::bigint balance
  ) remaining
  WHERE i.status<>'void' AND i.due_date BETWEEN p_start AND p_end
  UNION ALL
  SELECT m.id,m.created_at::date,'maintenance',
    left('Repair reported: '||m.issue,130),p.title,
    CASE WHEN m.status='completed' THEN 'completed' ELSE m.priority END,
    NULL::bigint,'#/workspace/maintenance',
    ('Reported '||m.created_at::date::text||' · '||m.status)
  FROM public.maintenance_requests m
  JOIN public.properties p ON p.id=m.property_id AND p.organization_id=v_org
  WHERE m.organization_id=v_org AND m.created_at::date BETWEEN p_start AND p_end
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
  SELECT r.id,r.requested_at::date,'deposit','Deposit refund requested',
    p.title,r.status,r.amount_ugx,'#/workspace/deposits',
    'Refund requested · review deductions and approval'
  FROM public.zimba_deposit_refund_requests r
  JOIN public.zimba_lease_records l ON l.id=r.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections rc ON rc.id=l.connection_id AND rc.organization_id=v_org
  JOIN public.properties p ON p.id=rc.property_id AND p.organization_id=v_org
  WHERE r.requested_at::date BETWEEN p_start AND p_end
  UNION ALL
  SELECT e.id,e.expense_date,'expense',left('Expense: '||e.description,130),
    coalesce(pr.title,'Organisation-wide'),'recorded',
    e.amount_ugx,'#/workspace/finance','Recorded expense · not a payment receipt'
  FROM public.property_expenses e
  LEFT JOIN public.properties pr ON pr.id=e.property_id AND pr.organization_id=v_org
  WHERE e.organization_id=v_org AND e.expense_date BETWEEN p_start AND p_end
 ),
 limited AS (
  SELECT id,day,kind,title,property,status,amount,link,detail
  FROM dates ORDER BY day,CASE WHEN status='overdue' THEN 0 ELSE 1 END,kind,id LIMIT 350
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'date',day,'kind',kind,'title',title,'property',property,
  'status',status,'amount',amount,'link',link,'detail',detail
 ) ORDER BY day,kind,id),'[]'::jsonb) INTO v_events FROM limited;

 RETURN jsonb_build_object('events',v_events,'metrics',v_metrics,
  'start',p_start,'end',p_end,'today',v_today,
  'note','Events are from recorded source dates. Unissued rent periods are not inferred.');
END $f$;

REVOKE ALL ON FUNCTION public.zimba_manager_overview_calendar(date,date) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_manager_overview_calendar(date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
