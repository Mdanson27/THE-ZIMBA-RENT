-- ZIMBA RENT Phase 4A: enterprise operations, scoped document registry, staff directory and portfolio governance.
-- Secure metadata only: no file bytes stored and no claim of file upload capability.
-- All document writes require a verified organisation manager, archive additionally requires owner/admin.
-- Financial reporting here uses VERIFIED rent evidence, capped per invoice; refundable deposits are excluded.
-- Do not give client roles direct table access; all access goes through SECURITY DEFINER functions.

CREATE TABLE IF NOT EXISTS public.zimba_enterprise_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 property_id uuid NOT NULL,
 title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
 category text NOT NULL CHECK (category IN ('agreement','compliance','inspection','insurance','maintenance','finance','other')),
 reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
 expires_on date,
 notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 archive_reason text CHECK (archive_reason IS NULL OR char_length(archive_reason) <= 500),
 CONSTRAINT zimba_enterprise_documents_property_org_fk FOREIGN KEY (property_id, organization_id) REFERENCES public.properties(id, organization_id)
);

CREATE INDEX IF NOT EXISTS zimba_enterprise_documents_scope_idx ON public.zimba_enterprise_documents(organization_id,property_id,created_at DESC);

ALTER TABLE public.zimba_enterprise_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.zimba_enterprise_documents FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.zimba_enterprise_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_org uuid := public.zimba_my_manager_org();
 v_role text;
 v_team jsonb;
 v_properties jsonb;
 v_summary jsonb;
BEGIN
 SELECT m.role INTO v_role FROM public.memberships m
 JOIN public.app_users a ON a.id=m.user_id
 WHERE a.external_auth_id=auth.uid()::text AND m.organization_id=v_org AND m.status='active'
 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END LIMIT 1;
 IF v_role NOT IN ('owner','admin','manager') OR v_role IS NULL
 THEN RAISE EXCEPTION 'Organisation management access required' USING ERRCODE='42501'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.display_name,'email',t.email,'role',t.role,'status',t.status)
 ORDER BY t.role,t.display_name),'[]'::jsonb) INTO v_team
 FROM (
  SELECT a.display_name,a.email,m.role,m.status FROM public.memberships m
  JOIN public.app_users a ON a.id=m.user_id
  WHERE m.organization_id=v_org ORDER BY m.role,a.display_name LIMIT 150
 ) t;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'name',p.title,'city',p.city,
  'units',(SELECT count(*) FROM public.units u WHERE u.property_id=p.id AND u.organization_id=v_org),
  'occupied',(SELECT count(*) FROM public.units u WHERE u.property_id=p.id AND u.organization_id=v_org AND u.status='occupied'),
  'openMaintenance',(SELECT count(*) FROM public.maintenance_requests m WHERE m.property_id=p.id AND m.organization_id=v_org AND m.status NOT IN ('completed','cancelled'))
 ) ORDER BY p.title),'[]'::jsonb) INTO v_properties
 FROM (SELECT id,title,city FROM public.properties WHERE organization_id=v_org AND visibility<>'archived' ORDER BY title LIMIT 250) p;

 SELECT jsonb_build_object(
  'properties',(SELECT count(*) FROM public.properties WHERE organization_id=v_org AND visibility<>'archived'),
  'units',(SELECT count(*) FROM public.units WHERE organization_id=v_org),
  'occupied',(SELECT count(*) FROM public.units WHERE organization_id=v_org AND status='occupied'),
  'activeResidents',(SELECT count(*) FROM public.resident_connections WHERE organization_id=v_org AND status='active'),
  'openMaintenance',(SELECT count(*) FROM public.maintenance_requests WHERE organization_id=v_org AND status NOT IN ('completed','cancelled')),
  'recordedExpenses',(SELECT coalesce(sum(amount_ugx),0) FROM public.property_expenses WHERE organization_id=v_org),
  'registeredDocuments',(SELECT count(*) FROM public.zimba_enterprise_documents WHERE organization_id=v_org AND archived_at IS NULL),
  'auditEvents',(SELECT count(*) FROM public.zimba_security_audit WHERE organization_id=v_org),
  'verifiedRent',(SELECT coalesce(sum(least(i.amount_ugx,coalesce(e.paid,0))),0)
    FROM public.zimba_rent_invoices i
    JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
    LEFT JOIN LATERAL (SELECT sum(amount_ugx) paid FROM public.zimba_payment_evidence WHERE invoice_id=i.id) e ON true
    WHERE i.status<>'void'),
  'outstandingRent',(SELECT coalesce(sum(greatest(i.amount_ugx-coalesce(e.paid,0),0)),0)
    FROM public.zimba_rent_invoices i
    JOIN public.zimba_lease_records l ON l.id=i.lease_id AND l.organization_id=v_org
    LEFT JOIN LATERAL (SELECT sum(amount_ugx) paid FROM public.zimba_payment_evidence WHERE invoice_id=i.id) e ON true
    WHERE i.status<>'void')
 ) INTO v_summary;
 RETURN jsonb_build_object('organization',(SELECT name FROM public.organizations WHERE id=v_org),
   'role',v_role,'team',v_team,'properties',v_properties,'summary',v_summary,
   'currency','UGX','asOf',now(),'permissions',jsonb_build_object('registerDocuments',true,'archiveDocuments',v_role IN ('owner','admin'),'manageStaff',false));
END $function$;

CREATE OR REPLACE FUNCTION public.zimba_enterprise_documents_list(p_property uuid DEFAULT NULL::uuid, p_include_archived boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_items jsonb;
BEGIN
 IF p_property IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND organization_id=v_org)
 THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'propertyId',d.property_id,'property',p.title,'title',d.title,
   'category',d.category,'reference',d.reference,'expiresOn',d.expires_on,
   'notes',d.notes,'createdAt',d.created_at,'archivedAt',d.archived_at
 ) ORDER BY d.created_at DESC),'[]'::jsonb) INTO v_items
 FROM (SELECT * FROM public.zimba_enterprise_documents
   WHERE organization_id=v_org AND (p_property IS NULL OR property_id=p_property)
     AND (coalesce(p_include_archived,false) OR archived_at IS NULL)
   ORDER BY created_at DESC LIMIT 300) d
 JOIN public.properties p ON p.id=d.property_id AND p.organization_id=v_org;
 RETURN jsonb_build_object('documents',v_items,'asOf',now());
END $function$;

CREATE OR REPLACE FUNCTION public.zimba_enterprise_document_register(
 p_property uuid,p_title text,p_category text,p_reference text DEFAULT NULL::text,
 p_expires_on date DEFAULT NULL::date,p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid;
BEGIN
 IF p_property IS NULL OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND organization_id=v_org AND visibility<>'archived')
 THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 180 OR
    p_category NOT IN ('agreement','compliance','inspection','insurance','maintenance','finance','other') OR
    char_length(coalesce(p_reference,''))>120 OR char_length(coalesce(p_notes,''))>1000
 THEN RAISE EXCEPTION 'Invalid document register details' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.zimba_enterprise_documents WHERE organization_id=v_org AND archived_at IS NULL)>=5000
 THEN RAISE EXCEPTION 'Document register limit reached' USING ERRCODE='22023'; END IF;
 INSERT INTO public.zimba_enterprise_documents(organization_id,property_id,title,category,reference,expires_on,notes,created_by)
 VALUES(v_org,p_property,btrim(p_title),p_category,nullif(btrim(p_reference),''),p_expires_on,nullif(btrim(p_notes),''),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'enterprise_document_registered','zimba_enterprise_documents',v_id,jsonb_build_object('property',p_property,'category',p_category));
 RETURN jsonb_build_object('id',v_id,'success',true,'fileUploaded',false);
END $function$;

CREATE OR REPLACE FUNCTION public.zimba_enterprise_document_archive(p_document uuid,p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memberships m JOIN public.app_users a ON a.id=m.user_id
  WHERE a.external_auth_id=auth.uid()::text AND m.organization_id=v_org AND m.status='active'
    AND m.role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'Owner or administrator permission required' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500
 THEN RAISE EXCEPTION 'An archive reason of 8 to 500 characters is required' USING ERRCODE='22023'; END IF;
 UPDATE public.zimba_enterprise_documents SET archived_at=now(),archive_reason=btrim(p_reason)
 WHERE id=p_document AND organization_id=v_org AND archived_at IS NULL RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Active document register entry not found' USING ERRCODE='42501'; END IF;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'enterprise_document_archived','zimba_enterprise_documents',v_id,jsonb_build_object('reason',left(btrim(p_reason),100)));
 RETURN jsonb_build_object('success',true,'id',v_id);
END $function$;

REVOKE ALL ON FUNCTION public.zimba_enterprise_overview() FROM PUBLIC, anonymous;

REVOKE ALL ON FUNCTION public.zimba_enterprise_documents_list(uuid,boolean) FROM PUBLIC, anonymous;

REVOKE ALL ON FUNCTION public.zimba_enterprise_document_register(uuid,text,text,text,date,text) FROM PUBLIC, anonymous;

REVOKE ALL ON FUNCTION public.zimba_enterprise_document_archive(uuid,text) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.zimba_enterprise_overview() TO authenticated;

GRANT EXECUTE ON FUNCTION public.zimba_enterprise_documents_list(uuid,boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.zimba_enterprise_document_register(uuid,text,text,text,date,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.zimba_enterprise_document_archive(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
