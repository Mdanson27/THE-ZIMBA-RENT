-- ZIMBA RENT Phase 5A — Explainable Intelligence (read-only, manager-scoped).
-- Rules use live, organisation-authorised records; no third-party AI or hidden forecasts.
-- No tenant PII, document notes, bank details, or free-text prompts leave Neon.
-- Outstanding values subtract independently verified evidence per invoice.
CREATE OR REPLACE FUNCTION public.zimba_intelligence_snapshot(p_property uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_org uuid := public.zimba_my_manager_org();
 v_unit_stats jsonb;
 v_invoice_stats jsonb;
 v_maintenance_stats jsonb;
 v_document_stats jsonb;
 v_invoice_alerts jsonb;
 v_maintenance_alerts jsonb;
 v_document_alerts jsonb;
 v_properties jsonb;
 v_evidence_count bigint;
BEGIN
 IF p_property IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.properties p
  WHERE p.id=p_property AND p.organization_id=v_org
 ) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;

 SELECT jsonb_build_object(
  'units',count(*),
  'occupiedUnits',count(*) FILTER(WHERE status='occupied'),
  'vacantUnits',count(*) FILTER(WHERE status='vacant'),
  'maintenanceUnits',count(*) FILTER(WHERE status='maintenance'),
  'pricedUnits',count(*) FILTER(WHERE monthly_rent_ugx>0),
  'configuredMonthlyRent',coalesce(sum(monthly_rent_ugx),0),
  'vacantMonthlyPotential',coalesce(sum(monthly_rent_ugx) FILTER(WHERE status='vacant'),0)
 ) INTO v_unit_stats
 FROM public.units
 WHERE organization_id=v_org AND (p_property IS NULL OR property_id=p_property);

 WITH scoped AS (
  SELECT i.id,i.amount_ugx,i.status,i.due_date,i.period_start,
         coalesce(ev.paid,0) paid
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org
  JOIN public.properties p ON p.id=c.property_id AND p.organization_id=v_org
  LEFT JOIN LATERAL (
    SELECT sum(amount_ugx) paid FROM public.zimba_payment_evidence
    WHERE invoice_id=i.id
  ) ev ON true
  WHERE p_property IS NULL OR p.id=p_property
 )
 SELECT jsonb_build_object(
  'invoices',count(*) FILTER(WHERE status<>'void'),
  'invoicePeriods',count(DISTINCT date_trunc('month',period_start)) FILTER(WHERE status<>'void'),
  'invoiced',coalesce(sum(amount_ugx) FILTER(WHERE status<>'void'),0),
  'verified',coalesce(sum(least(amount_ugx,paid)) FILTER(WHERE status<>'void'),0),
  'outstanding',coalesce(sum(greatest(amount_ugx-paid,0)) FILTER(WHERE status<>'void'),0),
  'overdue',coalesce(sum(greatest(amount_ugx-paid,0)) FILTER(WHERE status<>'void' AND due_date<CURRENT_DATE),0),
  'overdueCount',count(*) FILTER(WHERE status<>'void' AND due_date<CURRENT_DATE AND amount_ugx>paid),
  'dueNext7Days',count(*) FILTER(WHERE status<>'void' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND amount_ugx>paid),
  'reconciliationFlags',count(*) FILTER(WHERE status<>'void' AND paid>amount_ugx)
 ) INTO v_invoice_stats FROM scoped;

 SELECT jsonb_build_object(
  'openMaintenance',count(*) FILTER(WHERE status NOT IN ('completed','cancelled')),
  'urgentMaintenance',count(*) FILTER(WHERE status NOT IN ('completed','cancelled') AND priority='urgent'),
  'agedMaintenance',count(*) FILTER(WHERE status NOT IN ('completed','cancelled') AND created_at < now()-INTERVAL '7 days'),
  'pastExpectedCompletion',count(*) FILTER(WHERE status NOT IN ('completed','cancelled') AND expected_completion<CURRENT_DATE)
 ) INTO v_maintenance_stats
 FROM public.maintenance_requests
 WHERE organization_id=v_org AND (p_property IS NULL OR property_id=p_property);

 SELECT jsonb_build_object(
  'registeredDocuments',count(*),
  'expiringDocuments',count(*) FILTER(WHERE expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+45),
  'expiredDocuments',count(*) FILTER(WHERE expires_on<CURRENT_DATE)
 ) INTO v_document_stats
 FROM public.zimba_enterprise_documents
 WHERE organization_id=v_org AND archived_at IS NULL
  AND (p_property IS NULL OR property_id=p_property);

 WITH scoped AS (
  SELECT p.id property_id,p.title property_name,i.invoice_reference,i.due_date,
    i.amount_ugx,greatest(i.amount_ugx-coalesce(ev.paid,0),0) remaining,
    CURRENT_DATE-i.due_date days_late
  FROM public.zimba_rent_invoices i
  JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
  JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org
  JOIN public.properties p ON p.id=c.property_id AND p.organization_id=v_org
  LEFT JOIN LATERAL (SELECT sum(amount_ugx) paid FROM public.zimba_payment_evidence WHERE invoice_id=i.id) ev ON true
  WHERE i.status<>'void' AND i.due_date<CURRENT_DATE AND (p_property IS NULL OR p.id=p_property)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'propertyId',x.property_id,'property',x.property_name,'reference',x.invoice_reference,
  'due',x.due_date,'daysLate',x.days_late,'remaining',x.remaining
 ) ORDER BY x.days_late DESC,x.remaining DESC),'[]'::jsonb) INTO v_invoice_alerts
 FROM (SELECT * FROM scoped WHERE remaining>0 ORDER BY days_late DESC,remaining DESC LIMIT 20) x;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'propertyId',x.property_id,'property',x.property_name,'issue',left(x.issue,220),
  'priority',x.priority,'status',x.status,'progress',x.progress_percent,
  'daysOpen',CURRENT_DATE-x.created_at::date,
  'expectedCompletion',x.expected_completion
 ) ORDER BY x.urgency_rank DESC,x.created_at ASC),'[]'::jsonb) INTO v_maintenance_alerts
 FROM (
  SELECT m.*,p.title property_name,
   CASE WHEN m.priority='urgent' THEN 3 WHEN m.expected_completion<CURRENT_DATE THEN 2 ELSE 1 END urgency_rank
  FROM public.maintenance_requests m
  JOIN public.properties p ON p.id=m.property_id AND p.organization_id=v_org
  WHERE m.organization_id=v_org AND m.status NOT IN ('completed','cancelled')
   AND (m.priority='urgent' OR m.created_at<now()-INTERVAL '7 days' OR m.expected_completion<CURRENT_DATE)
   AND (p_property IS NULL OR m.property_id=p_property)
  ORDER BY urgency_rank DESC,m.created_at ASC LIMIT 20
 ) x;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'propertyId',x.property_id,'property',x.property_name,
  'title',x.title,'category',x.category,'expiresOn',x.expires_on,
  'daysUntil',x.expires_on-CURRENT_DATE
 ) ORDER BY x.expires_on ASC),'[]'::jsonb) INTO v_document_alerts
 FROM (
  SELECT d.property_id,p.title property_name,d.title,d.category,d.expires_on
  FROM public.zimba_enterprise_documents d
  JOIN public.properties p ON p.id=d.property_id AND p.organization_id=v_org
  WHERE d.organization_id=v_org AND d.archived_at IS NULL AND d.expires_on<=CURRENT_DATE+45
   AND (p_property IS NULL OR d.property_id=p_property)
  ORDER BY d.expires_on ASC LIMIT 20
 ) x;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'name',p.title,'city',p.city,
  'units',(SELECT count(*) FROM public.units u WHERE u.organization_id=v_org AND u.property_id=p.id),
  'vacant',(SELECT count(*) FROM public.units u WHERE u.organization_id=v_org AND u.property_id=p.id AND u.status='vacant'),
  'vacancyPotential',(SELECT coalesce(sum(u.monthly_rent_ugx),0) FROM public.units u WHERE u.organization_id=v_org AND u.property_id=p.id AND u.status='vacant'),
  'openRepairs',(SELECT count(*) FROM public.maintenance_requests m WHERE m.organization_id=v_org AND m.property_id=p.id AND m.status NOT IN ('completed','cancelled'))
 ) ORDER BY p.title),'[]'::jsonb) INTO v_properties
 FROM (SELECT id,title,city FROM public.properties WHERE organization_id=v_org AND visibility<>'archived'
       AND (p_property IS NULL OR id=p_property) ORDER BY title LIMIT 250) p;

 SELECT count(*) INTO v_evidence_count
 FROM public.zimba_payment_evidence e
 JOIN public.zimba_rent_invoices i ON i.id=e.invoice_id
 JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org
 WHERE p_property IS NULL OR c.property_id=p_property;

 RETURN jsonb_build_object(
  'currency','UGX','asOf',now(),'propertyId',p_property,'readOnly',true,
  'method','transparent_rules_v1','verifiedPaymentsOnly',true,
  'summary',v_unit_stats||v_invoice_stats||v_maintenance_stats||v_document_stats,
  'overdueInvoices',v_invoice_alerts,
  'maintenanceAttention',v_maintenance_alerts,
  'documentDeadlines',v_document_alerts,
  'properties',v_properties,
  'dataQuality',jsonb_build_object(
    'verifiedEvidenceEntries',v_evidence_count,
    'invoicePeriods',coalesce((v_invoice_stats->>'invoicePeriods')::integer,0),
    'invoiceCount',coalesce((v_invoice_stats->>'invoices')::integer,0),
    'forecastReady',coalesce((v_invoice_stats->>'invoicePeriods')::integer,0)>=3
      AND coalesce((v_invoice_stats->>'invoices')::integer,0)>=12
  ),
  'explanations',jsonb_build_object(
    'vacancy','Configured monthly rent on rooms marked vacant; not a collection forecast',
    'arrears','Non-void invoices with due dates before today less independently verified evidence',
    'maintenance','Urgent priority, overdue expected completion, or open longer than seven days',
    'documents','Only expiry dates entered in the document reference register are evaluated',
    'forecast','No predictive values are generated by this rule-based release'
  )
 );
END
$function$;

REVOKE ALL ON FUNCTION public.zimba_intelligence_snapshot(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_intelligence_snapshot(uuid) TO authenticated;
COMMENT ON FUNCTION public.zimba_intelligence_snapshot(uuid) IS
  'Phase 5A organisation-scoped, read-only indicators; explainable rules, not ML forecasts. No PII.';
NOTIFY pgrst, 'reload schema';
