-- ZIMBA phase 2: property-scoped read-only operational hub
-- SECURITY DEFINER checks organisation membership and property ownership before all queries.
CREATE OR REPLACE FUNCTION public.zimba_property_hub(p_property uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid:=public.zimba_my_manager_org();
  v_property jsonb;
  v_units jsonb;
  v_residents jsonb;
  v_maintenance jsonb;
  v_leases jsonb;
  v_invoices jsonb;
  v_stats jsonb;
BEGIN
  IF p_property IS NULL THEN
    RAISE EXCEPTION 'Select a property' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object(
    'id',p.id,'name',p.title,'city',p.city,'address',p.address_line,
    'description',p.description,'category',p.category,
    'visibility',p.visibility,'askingPrice',p.asking_price_ugx
  ) INTO v_property
  FROM public.properties p
  WHERE p.id=p_property AND p.organization_id=v_org;
  IF v_property IS NULL THEN
    RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',u.id,'number',u.unit_number,'floor',u.floor_label,
      'rent',u.monthly_rent_ugx,'status',u.status
  ) ORDER BY u.floor_label,u.unit_number),'[]'::jsonb)
  INTO v_units FROM (
    SELECT id,unit_number,floor_label,monthly_rent_ugx,status
    FROM public.units WHERE property_id=p_property AND organization_id=v_org
    ORDER BY floor_label,unit_number LIMIT 500
  ) u;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'name',coalesce(a.name,'Resident'),'unit',u.unit_number,
    'status',c.status,'rentStart',c.rent_start_date,'connected',c.linked_at
  ) ORDER BY c.linked_at DESC),'[]'::jsonb)
  INTO v_residents
  FROM (
    SELECT * FROM public.resident_connections
    WHERE property_id=p_property AND organization_id=v_org
    ORDER BY linked_at DESC LIMIT 200
  ) c
  JOIN neon_auth."user" a ON a.id=c.resident_auth_user_id
  LEFT JOIN public.units u ON u.id=c.unit_id AND u.organization_id=v_org;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'issue',m.issue,'status',m.status,'priority',m.priority,
      'progress',m.progress_percent,'unit',u.unit_number,'createdAt',m.created_at
  ) ORDER BY m.created_at DESC),'[]'::jsonb)
  INTO v_maintenance FROM (
    SELECT * FROM public.maintenance_requests
    WHERE property_id=p_property AND organization_id=v_org
    ORDER BY created_at DESC LIMIT 60
  ) m LEFT JOIN public.units u ON u.id=m.unit_id AND u.organization_id=v_org;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'resident',coalesce(a.name,'Resident'),'room',u.unit_number,
    'monthlyRent',l.monthly_rent_ugx,'depositRequired',l.deposit_required_ugx,
    'start',l.start_date,'end',l.end_date,'status',l.status
  ) ORDER BY l.created_at DESC),'[]'::jsonb)
  INTO v_leases FROM (
    SELECT l.*,c.resident_auth_user_id,c.unit_id
    FROM public.zimba_lease_records l
    JOIN public.resident_connections c ON c.id=l.connection_id
    WHERE c.property_id=p_property AND c.organization_id=v_org AND l.organization_id=v_org
    ORDER BY l.created_at DESC LIMIT 100
  ) l JOIN neon_auth."user" a ON a.id=l.resident_auth_user_id
  LEFT JOIN public.units u ON u.id=l.unit_id AND u.organization_id=v_org;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'reference',i.invoice_reference,'due',i.due_date,
    'amount',i.amount_ugx,'status',i.status,'period',i.period_start
  ) ORDER BY i.due_date DESC),'[]'::jsonb)
  INTO v_invoices FROM (
    SELECT i.*
    FROM public.zimba_rent_invoices i
    JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
    JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org
    WHERE c.property_id=p_property
    ORDER BY i.due_date DESC LIMIT 100
  ) i;
  SELECT jsonb_build_object(
    'units',(SELECT count(*) FROM public.units WHERE property_id=p_property AND organization_id=v_org),
    'occupiedUnits',(SELECT count(*) FROM public.units WHERE property_id=p_property AND organization_id=v_org AND status='occupied'),
    'activeResidents',(SELECT count(*) FROM public.resident_connections WHERE property_id=p_property AND organization_id=v_org AND status='active'),
    'openMaintenance',(SELECT count(*) FROM public.maintenance_requests WHERE property_id=p_property AND organization_id=v_org AND status NOT IN ('completed','cancelled')),
    'outstandingInvoices',(SELECT count(*) FROM public.zimba_rent_invoices i JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org WHERE c.property_id=p_property AND i.status='unpaid'),
    'outstandingRent',(SELECT coalesce(sum(i.amount_ugx),0) FROM public.zimba_rent_invoices i JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=v_org WHERE c.property_id=p_property AND i.status='unpaid')
  ) INTO v_stats;
  RETURN jsonb_build_object(
    'property',v_property,'stats',v_stats,'units',v_units,'residents',v_residents,
    'maintenance',v_maintenance,'agreements',v_leases,'invoices',v_invoices
  );
END $function$

REVOKE ALL ON FUNCTION public.zimba_property_hub(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_property_hub(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
