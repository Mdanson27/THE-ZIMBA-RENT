-- ZIMBA 0022: printable, editable draft agreements + durable scanned execution evidence.
-- Notes: existing zimba_lease_records is the editable draft/issued system of record.
-- A tenant acknowledgement is NOT a physical signature. This separate immutable
-- PDF history becomes 'signed (both confirmed)' ONLY after manager attestation
-- and confirmation by the linked tenant of the exact PDF SHA-256.
-- Restrict raw bytes and all direct table access; no public storage bucket.
CREATE TABLE IF NOT EXISTS public.zimba_lease_signed_scans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES public.zimba_lease_records(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 10),
  pdf_content bytea NOT NULL CHECK(octet_length(pdf_content) BETWEEN 150 AND 3000000),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 150 AND 3000000),
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 120),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  manager_attested_at timestamptz NOT NULL DEFAULT now(),
  tenant_confirmed_at timestamptz,
  tenant_confirmed_by uuid,
  UNIQUE(lease_id,revision),
  CHECK((tenant_confirmed_at IS NULL)=(tenant_confirmed_by IS NULL))
);
ALTER TABLE public.zimba_lease_signed_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_lease_signed_scans FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_lease_scan_lease_rev_idx ON public.zimba_lease_signed_scans(lease_id,revision DESC);

-- The manager gets a full, printable property snapshot including organisation and
-- exact unit. No signed PDF bytes are returned to an ordinary list endpoint.
CREATE OR REPLACE FUNCTION public.zimba_manager_lease_contracts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',l.id,'connectionId',l.connection_id,'tenant',coalesce(nullif(trim(t.name),''),'Tenant'),
 'property',p.title,'propertyId',p.id,'propertyAddress',coalesce(p.address_line,''),'city',p.city,
 'country',coalesce(p.country,'Uganda'),'room',coalesce(u.unit_number,''),
 'landlord',o.name,'rent',l.monthly_rent_ugx,'deposit',l.deposit_required_ugx,
 'start',l.start_date,'end',l.end_date,'terms',l.terms,'depositTerms',l.deposit_terms,
 'status',l.status,'issuedAt',l.issued_at,'acknowledgedAt',l.tenant_ack_at,
 'docStatus',CASE WHEN scan.tenant_confirmed_at IS NOT NULL THEN 'signed'
     WHEN scan.id IS NOT NULL THEN 'pending_tenant_confirmation'
     WHEN l.status='draft' THEN 'draft' ELSE 'not_signed' END,
 'scanId',scan.id,'scanHash',scan.sha256,'scanRevision',scan.revision,
 'uploadedAt',scan.uploaded_at,'tenantConfirmedAt',scan.tenant_confirmed_at
 ) ORDER BY l.created_at DESC),'[]'::jsonb)
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id AND c.organization_id=l.organization_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 JOIN public.organizations o ON o.id=l.organization_id
 JOIN neon_auth."user" t ON t.id=c.resident_auth_user_id
 LEFT JOIN public.units u ON u.id=c.unit_id
 LEFT JOIN LATERAL (SELECT sc.id,sc.sha256,sc.revision,sc.uploaded_at,sc.tenant_confirmed_at
   FROM public.zimba_lease_signed_scans sc WHERE sc.lease_id=l.id ORDER BY sc.revision DESC LIMIT 1) scan ON true
 WHERE l.organization_id=public.zimba_my_manager_org()
 $function$;

-- Linked resident can only view their own issued/acknowledged/ended agreements,
-- including uploaded signed file metadata but never bytes until specific download.
CREATE OR REPLACE FUNCTION public.zimba_tenant_lease_contracts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',l.id,'connectionId',l.connection_id,'tenant',coalesce(nullif(trim(t.name),''),'Tenant'),
 'property',p.title,'propertyId',p.id,'propertyAddress',coalesce(p.address_line,''),'city',p.city,
 'country',coalesce(p.country,'Uganda'),'room',coalesce(u.unit_number,''),
 'landlord',o.name,'rent',l.monthly_rent_ugx,'deposit',l.deposit_required_ugx,
 'start',l.start_date,'end',l.end_date,'terms',l.terms,'depositTerms',l.deposit_terms,
 'status',l.status,'issuedAt',l.issued_at,'acknowledgedAt',l.tenant_ack_at,
 'docStatus',CASE WHEN scan.tenant_confirmed_at IS NOT NULL THEN 'signed'
     WHEN scan.id IS NOT NULL THEN 'pending_tenant_confirmation'
     ELSE 'not_signed' END,
 'scanId',scan.id,'scanHash',scan.sha256,'scanRevision',scan.revision,
 'uploadedAt',scan.uploaded_at,'tenantConfirmedAt',scan.tenant_confirmed_at
 ) ORDER BY l.created_at DESC),'[]'::jsonb)
 FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id
 JOIN public.properties p ON p.id=c.property_id AND p.organization_id=l.organization_id
 JOIN public.organizations o ON o.id=l.organization_id
 JOIN neon_auth."user" t ON t.id=c.resident_auth_user_id
 LEFT JOIN public.units u ON u.id=c.unit_id
 LEFT JOIN LATERAL (SELECT sc.id,sc.sha256,sc.revision,sc.uploaded_at,sc.tenant_confirmed_at
   FROM public.zimba_lease_signed_scans sc WHERE sc.lease_id=l.id ORDER BY sc.revision DESC LIMIT 1) scan ON true
 WHERE c.resident_auth_user_id=auth.uid()
   AND l.status IN ('issued','acknowledged','ended')
 $function$;

-- Store the exact PDF submitted by an authenticated manager. Only accepts
-- a real PDF header, max 3 MB, a matching client-side SHA, and explicit attestation
-- that both physical signatures appear on the identical unaltered document.
-- Allow corrected uploads while tenant confirmation is outstanding; keep old copies
-- append-only, and never permit replacement after confirmation.
CREATE OR REPLACE FUNCTION public.zimba_manager_upload_signed_lease(
 p_lease uuid,p_pdf_base64 text,p_sha256 text,p_filename text,p_attest_both boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_l public.zimba_lease_records%ROWTYPE;
 v_bytes bytea;v_hash text;v_next integer;v_latest public.zimba_lease_signed_scans%ROWTYPE;
 v_id uuid;v_resident uuid;
BEGIN
 IF p_attest_both IS DISTINCT FROM true THEN RAISE EXCEPTION 'Both signatures must be visually checked and attested' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_l FROM public.zimba_lease_records
  WHERE id=p_lease AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_l.status NOT IN ('issued','acknowledged') THEN
   RAISE EXCEPTION 'Only issued, unfinished leases can accept signed copies' USING ERRCODE='42501'; END IF;
 IF p_pdf_base64 IS NULL OR length(p_pdf_base64)>4000000 OR length(p_pdf_base64)<200
   OR p_pdf_base64 !~ '^[A-Za-z0-9+/]+={0,2}$'
 THEN RAISE EXCEPTION 'Invalid or oversized PDF upload' USING ERRCODE='22023'; END IF;
 BEGIN
  v_bytes:=decode(p_pdf_base64,'base64');
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid PDF encoding' USING ERRCODE='22023';
 END;
 IF octet_length(v_bytes) NOT BETWEEN 150 AND 3000000 OR
    substring(v_bytes FROM 1 FOR 5)<>decode('255044462d','hex') OR
    position(decode('2525454f46','hex') in v_bytes)=0
 THEN RAISE EXCEPTION 'A valid signed PDF of up to 3 MB is required' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(v_bytes,'sha256'),'hex');
 IF v_hash<>lower(coalesce(p_sha256,'')) THEN RAISE EXCEPTION 'PDF checksum mismatch' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_filename,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Valid filename required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_latest FROM public.zimba_lease_signed_scans
  WHERE lease_id=p_lease ORDER BY revision DESC LIMIT 1;
 IF v_latest.tenant_confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Confirmed executed agreements are immutable' USING ERRCODE='42501'; END IF;
 v_next:=coalesce(v_latest.revision,0)+1;
 IF v_next>10 THEN RAISE EXCEPTION 'Signed copy version limit reached' USING ERRCODE='22023'; END IF;
 INSERT INTO public.zimba_lease_signed_scans(
 lease_id,organization_id,revision,pdf_content,sha256,size_bytes,filename,uploaded_by)
 VALUES(p_lease,v_org,v_next,v_bytes,v_hash,octet_length(v_bytes),btrim(p_filename),auth.uid())
 RETURNING id INTO v_id;
 SELECT c.resident_auth_user_id INTO v_resident
 FROM public.resident_connections c WHERE c.id=v_l.connection_id AND c.organization_id=v_org;
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_resident,'general','Signed agreement ready for confirmation',
 'Review the uploaded signed PDF against the agreement before confirming the exact copy.',
 '#/workspace/lease',p_lease);
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'signed_lease_pdf_uploaded','lease',p_lease,
 jsonb_build_object('scanId',v_id,'revision',v_next,'sha256',v_hash,'bytes',octet_length(v_bytes)));
 RETURN jsonb_build_object('success',true,'scanId',v_id,'sha256',v_hash,'revision',v_next,
 'status','pending_tenant_confirmation','note','Manager attestation recorded; tenant confirmation still required');
END $function$;

-- Resident must authenticate, download and review the exact current SHA-256.
-- Tenant confirmation records identity and time. It is not biometric identity
-- proof or an independent forensic verification of wet-ink signatures.
CREATE OR REPLACE FUNCTION public.zimba_tenant_confirm_signed_lease(
 p_lease uuid,p_scan uuid,p_sha256 text,p_confirm_both boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid();v_l public.zimba_lease_records%ROWTYPE;
 v_current public.zimba_lease_signed_scans%ROWTYPE;v_last uuid;
BEGIN
 IF v_uid IS NULL OR p_confirm_both IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Explicit signed-document confirmation is required' USING ERRCODE='42501';END IF;
 SELECT l.* INTO v_l FROM public.zimba_lease_records l
 JOIN public.resident_connections c ON c.id=l.connection_id
 WHERE l.id=p_lease AND c.resident_auth_user_id=v_uid
 AND c.organization_id=l.organization_id AND c.status='active'
 AND l.status IN ('issued','acknowledged') FOR UPDATE OF l;
 IF NOT FOUND THEN RAISE EXCEPTION 'This lease is not available to your resident account' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_current FROM public.zimba_lease_signed_scans
  WHERE lease_id=p_lease ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF v_current.id IS DISTINCT FROM p_scan OR v_current.sha256 IS DISTINCT FROM lower(p_sha256) THEN
   RAISE EXCEPTION 'The signed PDF version has changed; download and review it again' USING ERRCODE='42501'; END IF;
 IF v_current.uploaded_by=v_uid THEN
   RAISE EXCEPTION 'A different authenticated tenant account must confirm the uploaded PDF' USING ERRCODE='42501'; END IF;
 IF v_current.tenant_confirmed_at IS NOT NULL THEN
   RETURN jsonb_build_object('success',true,'status','signed','sha256',v_current.sha256); END IF;
 UPDATE public.zimba_lease_signed_scans
 SET tenant_confirmed_at=now(),tenant_confirmed_by=v_uid WHERE id=v_current.id;
 -- Keep legacy billing status compatible, but never use it as signed proof.
 UPDATE public.zimba_lease_records
 SET status='acknowledged',tenant_ack_at=coalesce(tenant_ack_at,now())
 WHERE id=p_lease;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_l.organization_id,'signed_lease_tenant_confirmed','lease',p_lease,
  jsonb_build_object('scanId',v_current.id,'revision',v_current.revision,'sha256',v_current.sha256));
 RETURN jsonb_build_object('success',true,'status','signed','sha256',v_current.sha256,
 'note','Both-party confirmation recorded. Physical signature authenticity has not been forensically verified.');
END $function$;

-- Deliver signed PDF bytes only to the linked tenant or an authorised manager
-- of the organisation; no public URL or direct table read is possible.
CREATE OR REPLACE FUNCTION public.zimba_private_lease_pdf(p_scan uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid();v_s public.zimba_lease_signed_scans%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO v_s FROM public.zimba_lease_signed_scans s
 JOIN public.zimba_lease_records l ON l.id=s.lease_id
 JOIN public.resident_connections c ON c.id=l.connection_id
 WHERE s.id=p_scan AND (
    c.resident_auth_user_id=v_uid
    OR EXISTS(SELECT 1 FROM public.app_users a JOIN public.memberships m ON m.user_id=a.id
      JOIN public.account_onboarding ob ON ob.auth_user_id=v_uid
      WHERE a.external_auth_id=v_uid::text AND m.organization_id=s.organization_id
       AND m.status='active' AND m.role IN ('owner','admin','manager')
       AND ob.account_role IN ('landlord','manager') AND ob.completed_at IS NOT NULL)
  );
 IF NOT FOUND THEN RAISE EXCEPTION 'Signed PDF not available to this account' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('scanId',v_s.id,'leaseId',v_s.lease_id,'revision',v_s.revision,
  'filename',v_s.filename,'sha256',v_s.sha256,'bytes',v_s.size_bytes,
  'signed',v_s.tenant_confirmed_at IS NOT NULL,'base64',encode(v_s.pdf_content,'base64'));
END $function$;

REVOKE ALL ON FUNCTION public.zimba_manager_lease_contracts() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_lease_contracts() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_upload_signed_lease(uuid,text,text,text,boolean) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_tenant_confirm_signed_lease(uuid,uuid,text,boolean) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_private_lease_pdf(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_manager_lease_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_lease_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_upload_signed_lease(uuid,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_tenant_confirm_signed_lease(uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_private_lease_pdf(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
