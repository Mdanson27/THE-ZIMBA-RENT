-- ZIMBA RENT 0023 — professional land leases, saved drafts and signed PDF evidence.
-- No land title or legal registration is verified by this application.
-- Retains 0017's land draft table/status for compatibility with existing records.

CREATE TABLE IF NOT EXISTS public.zimba_land_lease_parties(
 land_lease_id uuid PRIMARY KEY REFERENCES public.zimba_land_lease_drafts(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 managed_capacity text NOT NULL DEFAULT 'lessor' CHECK(managed_capacity IN ('lessor','lessee')),
 lessor_name text NOT NULL DEFAULT '',
 lessee_name text NOT NULL DEFAULT '',
 counterparty_email text NOT NULL DEFAULT '',
 title_reference text NOT NULL DEFAULT '',
 tenure_type text NOT NULL DEFAULT 'unverified'
   CHECK(tenure_type IN ('mailo','freehold','leasehold','customary','unverified','other')),
 size_description text NOT NULL DEFAULT '',
 permitted_use text NOT NULL DEFAULT '',
 rent_frequency text NOT NULL DEFAULT 'annual'
   CHECK(rent_frequency IN ('monthly','quarterly','half_yearly','annual','none')),
 payment_terms text NOT NULL DEFAULT '',
 legal_review_note text NOT NULL DEFAULT '',
 workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN ('draft','issued')),
 issued_at timestamptz,issued_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(length(lessor_name)<=160 AND length(lessee_name)<=160 AND length(counterparty_email)<=254),
 CHECK(length(title_reference)<=180 AND length(size_description)<=220 AND length(permitted_use)<=400),
 CHECK(length(payment_terms)<=2000 AND length(legal_review_note)<=2000)
);
ALTER TABLE public.zimba_land_lease_parties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_land_lease_parties FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_land_parties_org_idx ON public.zimba_land_lease_parties(organization_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.zimba_land_lease_signed_scans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 land_lease_id uuid NOT NULL REFERENCES public.zimba_land_lease_drafts(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 10),
 pdf_content bytea NOT NULL CHECK(octet_length(pdf_content) BETWEEN 150 AND 3000000),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 150 AND 3000000),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 120),
 uploaded_by uuid NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now(),
 manager_attested_at timestamptz NOT NULL DEFAULT now(),
 counterparty_confirmed_at timestamptz,counterparty_confirmed_by uuid,
 UNIQUE(land_lease_id,revision),
 CHECK((counterparty_confirmed_at IS NULL)=(counterparty_confirmed_by IS NULL))
);
ALTER TABLE public.zimba_land_lease_signed_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zimba_land_lease_signed_scans FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_land_scan_idx ON public.zimba_land_lease_signed_scans(land_lease_id,revision DESC);

CREATE OR REPLACE FUNCTION public.zimba_manager_land_lease_contracts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',d.id,'parcel',d.parcel_reference,'location',d.location_description,
 'start',d.start_date,'end',d.end_date,'premium',d.premium_ugx,'rent',d.periodic_rent_ugx,
 'renewalTerms',d.renewal_terms,'conditions',d.conditions,
 'propertyId',d.property_id,'linkedProperty',coalesce(pr.title,''),
 'status',CASE WHEN p.workflow_status='issued' THEN 'issued' ELSE 'draft' END,
 'managedCapacity',coalesce(p.managed_capacity,'lessor'),
 'lessorName',coalesce(p.lessor_name,''),'lesseeName',coalesce(p.lessee_name,''),
 'counterpartyEmail',coalesce(p.counterparty_email,''),
 'titleReference',coalesce(p.title_reference,''),'tenureType',coalesce(p.tenure_type,'unverified'),
 'sizeDescription',coalesce(p.size_description,''),'permittedUse',coalesce(p.permitted_use,''),
 'rentFrequency',coalesce(p.rent_frequency,'annual'),'paymentTerms',coalesce(p.payment_terms,''),
 'legalReviewNote',coalesce(p.legal_review_note,''),'issuedAt',p.issued_at,
 'docStatus',CASE WHEN sc.counterparty_confirmed_at IS NOT NULL THEN 'signed'
  WHEN sc.id IS NOT NULL THEN 'pending_counterparty'
  WHEN p.workflow_status='issued' THEN 'issued' ELSE 'draft' END,
 'scanId',sc.id,'scanHash',sc.sha256,'scanRevision',sc.revision,
 'uploadedAt',sc.uploaded_at,'counterpartyConfirmedAt',sc.counterparty_confirmed_at
 ) ORDER BY d.created_at DESC),'[]'::jsonb)
 FROM public.zimba_land_lease_drafts d
 LEFT JOIN public.zimba_land_lease_parties p ON p.land_lease_id=d.id AND p.organization_id=d.organization_id
 LEFT JOIN public.properties pr ON pr.id=d.property_id AND pr.organization_id=d.organization_id
 LEFT JOIN LATERAL (
  SELECT s.id,s.sha256,s.revision,s.uploaded_at,s.counterparty_confirmed_at
  FROM public.zimba_land_lease_signed_scans s WHERE s.land_lease_id=d.id
  ORDER BY s.revision DESC LIMIT 1
 ) sc ON true
 WHERE d.organization_id=public.zimba_my_manager_org()
$f$;

-- p_data uses a single object to keep the draft editable without changing the original v1 signature.
CREATE OR REPLACE FUNCTION public.zimba_manager_save_land_lease(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_id uuid;v_property uuid;
 v_parcel text;v_location text;v_start date;v_end date;v_premium bigint;v_rent bigint;
 v_renewal text;v_conditions text;v_capacity text;v_lessor text;v_lessee text;v_email text;
 v_title text;v_tenure text;v_size text;v_use text;v_freq text;v_payment text;v_note text;v_status text;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Draft details required' USING ERRCODE='22023';END IF;
 v_id:=nullif(p_data->>'id','')::uuid;
 v_property:=nullif(p_data->>'propertyId','')::uuid;
 v_parcel:=btrim(coalesce(p_data->>'parcel',''));
 v_location:=btrim(coalesce(p_data->>'location',''));
 v_start:=(p_data->>'start')::date;v_end:=(p_data->>'end')::date;
 v_premium:=(p_data->>'premium')::bigint;v_rent:=(p_data->>'rent')::bigint;
 v_renewal:=btrim(coalesce(p_data->>'renewalTerms',''));
 v_conditions:=btrim(coalesce(p_data->>'conditions',''));
 v_capacity:=coalesce(p_data->>'managedCapacity','lessor');
 v_lessor:=btrim(coalesce(p_data->>'lessorName',''));
 v_lessee:=btrim(coalesce(p_data->>'lesseeName',''));
 v_email:=lower(btrim(coalesce(p_data->>'counterpartyEmail','')));
 v_title:=btrim(coalesce(p_data->>'titleReference',''));
 v_tenure:=coalesce(p_data->>'tenureType','unverified');
 v_size:=btrim(coalesce(p_data->>'sizeDescription',''));
 v_use:=btrim(coalesce(p_data->>'permittedUse',''));
 v_freq:=coalesce(p_data->>'rentFrequency','annual');
 v_payment:=btrim(coalesce(p_data->>'paymentTerms',''));
 v_note:=btrim(coalesce(p_data->>'legalReviewNote',''));
 IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start OR v_premium IS NULL OR v_premium<0 OR v_rent IS NULL OR v_rent<0
 THEN RAISE EXCEPTION 'Invalid dates, premium or recurring rent' USING ERRCODE='22023';END IF;
 IF length(v_parcel) NOT BETWEEN 3 AND 150 OR length(v_location) NOT BETWEEN 8 AND 500
  OR length(v_renewal) NOT BETWEEN 10 AND 2000 OR length(v_conditions) NOT BETWEEN 30 AND 10000
 THEN RAISE EXCEPTION 'Complete the parcel, location, renewal and lease conditions' USING ERRCODE='22023';END IF;
 IF v_capacity NOT IN ('lessor','lessee') OR v_tenure NOT IN ('mailo','freehold','leasehold','customary','unverified','other')
  OR v_freq NOT IN ('monthly','quarterly','half_yearly','annual','none')
 THEN RAISE EXCEPTION 'Invalid party capacity, land tenure or rent frequency' USING ERRCODE='22023';END IF;
 IF (v_freq='none' AND v_rent<>0) OR (v_freq<>'none' AND v_rent=0)
 THEN RAISE EXCEPTION 'Match the recurring rent amount to its payment frequency' USING ERRCODE='22023';END IF;
 IF length(v_lessor)>160 OR length(v_lessee)>160 OR length(v_email)>254 OR length(v_title)>180
 OR length(v_size)>220 OR length(v_use)>400 OR length(v_payment)>2000 OR length(v_note)>2000
 THEN RAISE EXCEPTION 'A land agreement field is too long' USING ERRCODE='22023';END IF;
 IF length(v_email)>0 AND v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
 THEN RAISE EXCEPTION 'Enter a valid counterparty email' USING ERRCODE='22023';END IF;
 IF v_property IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties
   WHERE id=v_property AND organization_id=v_org)
 THEN RAISE EXCEPTION 'Property belongs to another organisation' USING ERRCODE='42501';END IF;
 IF v_id IS NULL THEN
 INSERT INTO public.zimba_land_lease_drafts(
  organization_id,property_id,parcel_reference,location_description,start_date,end_date,
  premium_ugx,periodic_rent_ugx,renewal_terms,conditions,created_by)
 VALUES(v_org,v_property,v_parcel,v_location,v_start,v_end,v_premium,v_rent,
  v_renewal,v_conditions,auth.uid()) RETURNING id INTO v_id;
 ELSE
 PERFORM 1 FROM public.zimba_land_lease_drafts WHERE id=v_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable to your organisation' USING ERRCODE='42501';END IF;
 SELECT workflow_status INTO v_status FROM public.zimba_land_lease_parties
 WHERE land_lease_id=v_id FOR UPDATE;
 IF coalesce(v_status,'draft')<>'draft' THEN RAISE EXCEPTION 'Issued land agreements cannot be silently edited' USING ERRCODE='42501';END IF;
 UPDATE public.zimba_land_lease_drafts SET property_id=v_property,parcel_reference=v_parcel,
  location_description=v_location,start_date=v_start,end_date=v_end,premium_ugx=v_premium,
  periodic_rent_ugx=v_rent,renewal_terms=v_renewal,conditions=v_conditions
  WHERE id=v_id AND organization_id=v_org;
 END IF;
 INSERT INTO public.zimba_land_lease_parties(
 land_lease_id,organization_id,managed_capacity,lessor_name,lessee_name,
 counterparty_email,title_reference,tenure_type,size_description,permitted_use,
 rent_frequency,payment_terms,legal_review_note)
 VALUES(v_id,v_org,v_capacity,v_lessor,v_lessee,v_email,v_title,v_tenure,v_size,v_use,v_freq,v_payment,v_note)
 ON CONFLICT(land_lease_id) DO UPDATE SET
 managed_capacity=excluded.managed_capacity,lessor_name=excluded.lessor_name,
 lessee_name=excluded.lessee_name,counterparty_email=excluded.counterparty_email,
 title_reference=excluded.title_reference,tenure_type=excluded.tenure_type,
 size_description=excluded.size_description,permitted_use=excluded.permitted_use,
 rent_frequency=excluded.rent_frequency,payment_terms=excluded.payment_terms,
 legal_review_note=excluded.legal_review_note,updated_at=now();
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'land_lease_draft_saved','land_lease',v_id,
 jsonb_build_object('editedExistingDraft',p_data ? 'id'));
 RETURN jsonb_build_object('id',v_id,'status','draft','legalExecution',false);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_issue_land_lease(p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_party public.zimba_land_lease_parties%ROWTYPE;
 v_owner_email text;v_user uuid;
BEGIN
 PERFORM 1 FROM public.zimba_land_lease_drafts WHERE id=p_lease AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Land lease unavailable to manager' USING ERRCODE='42501';END IF;
 SELECT * INTO v_party FROM public.zimba_land_lease_parties WHERE land_lease_id=p_lease
 AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_party.workflow_status<>'draft' THEN
 RAISE EXCEPTION 'Save an editable draft first; issued documents cannot be issued again' USING ERRCODE='42501';END IF;
 IF length(v_party.lessor_name)<3 OR length(v_party.lessee_name)<3 OR
    length(v_party.counterparty_email)<5 OR length(v_party.title_reference)<3 OR
    length(v_party.permitted_use)<8 OR length(v_party.payment_terms)<8
 THEN RAISE EXCEPTION 'Complete both parties, title reference, use, payment terms and counterparty email' USING ERRCODE='22023';END IF;
 SELECT lower(u.email) INTO v_owner_email FROM neon_auth."user" u WHERE u.id=auth.uid();
 IF v_owner_email=v_party.counterparty_email THEN
 RAISE EXCEPTION 'Counterparty must use a different email account' USING ERRCODE='42501'; END IF;
 UPDATE public.zimba_land_lease_parties SET workflow_status='issued',
  issued_at=now(),issued_by=auth.uid(),updated_at=now() WHERE land_lease_id=p_lease;
 SELECT u.id INTO v_user FROM neon_auth."user" u WHERE lower(u.email)=v_party.counterparty_email
  AND u."emailVerified"=true AND coalesce(u.banned,false)=false LIMIT 1;
 IF v_user IS NOT NULL THEN
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_user,'general','Land agreement ready for review',
  'Review the land agreement in your ZIMBA signing requests. This is not a signature.',
  '#/workspace/land-leases',p_lease);
 END IF;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'land_lease_issued','land_lease',p_lease,
 jsonb_build_object('notifiedVerifiedAccount',v_user IS NOT NULL));
 RETURN jsonb_build_object('id',p_lease,'status','issued','notificationCreated',v_user IS NOT NULL);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_my_land_lease_signing_requests()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_email text;v_result jsonb;
BEGIN
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u WHERE u.id=auth.uid()
 AND u."emailVerified"=true AND coalesce(u.banned,false)=false;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified account required for signing requests' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',d.id,'parcel',d.parcel_reference,'location',d.location_description,
 'start',d.start_date,'end',d.end_date,'premium',d.premium_ugx,'rent',d.periodic_rent_ugx,
 'renewalTerms',d.renewal_terms,'conditions',d.conditions,'propertyId',d.property_id,
 'managedCapacity',p.managed_capacity,'lessorName',p.lessor_name,'lesseeName',p.lessee_name,
 'titleReference',p.title_reference,'tenureType',p.tenure_type,'sizeDescription',p.size_description,
 'permittedUse',p.permitted_use,'rentFrequency',p.rent_frequency,
 'paymentTerms',p.payment_terms,'legalReviewNote',p.legal_review_note,'status','issued',
 'docStatus',CASE WHEN s.counterparty_confirmed_at IS NOT NULL THEN 'signed'
  WHEN s.id IS NOT NULL THEN 'pending_counterparty' ELSE 'issued' END,
 'scanId',s.id,'scanHash',s.sha256,'scanRevision',s.revision,
 'uploadedAt',s.uploaded_at,'counterpartyConfirmedAt',s.counterparty_confirmed_at
 ) ORDER BY p.issued_at DESC),'[]'::jsonb) INTO v_result
 FROM public.zimba_land_lease_parties p
 JOIN public.zimba_land_lease_drafts d ON d.id=p.land_lease_id
 LEFT JOIN LATERAL (
  SELECT sc.id,sc.sha256,sc.revision,sc.uploaded_at,sc.counterparty_confirmed_at
  FROM public.zimba_land_lease_signed_scans sc WHERE sc.land_lease_id=d.id
  ORDER BY sc.revision DESC LIMIT 1) s ON true
 WHERE p.workflow_status='issued' AND p.counterparty_email=v_email;
 RETURN v_result;
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_manager_upload_land_lease_pdf(
 p_lease uuid,p_pdf_base64 text,p_sha256 text,p_filename text,p_attest_both boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_org uuid:=public.zimba_my_manager_org();v_party public.zimba_land_lease_parties%ROWTYPE;
 v_bytes bytea;v_hash text;v_next integer;v_previous public.zimba_land_lease_signed_scans%ROWTYPE;
 v_id uuid;v_user uuid;
BEGIN
 IF p_attest_both IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Review and attest to both parties signatures in the PDF' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.zimba_land_lease_drafts WHERE id=p_lease AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Land lease unavailable to manager' USING ERRCODE='42501';END IF;
 SELECT * INTO v_party FROM public.zimba_land_lease_parties
 WHERE land_lease_id=p_lease AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_party.workflow_status<>'issued' THEN
 RAISE EXCEPTION 'Issue this land lease before uploading a signed copy' USING ERRCODE='42501';END IF;
 IF p_pdf_base64 IS NULL OR length(p_pdf_base64)>4000000 OR length(p_pdf_base64)<200
  OR p_pdf_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
 RAISE EXCEPTION 'Invalid or oversized signed PDF' USING ERRCODE='22023';END IF;
 BEGIN v_bytes:=decode(p_pdf_base64,'base64');
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid PDF encoding' USING ERRCODE='22023';END;
 IF octet_length(v_bytes) NOT BETWEEN 150 AND 3000000
  OR substring(v_bytes FROM 1 FOR 5)<>decode('255044462d','hex')
  OR position(decode('2525454f46','hex') in v_bytes)=0 THEN
 RAISE EXCEPTION 'A complete PDF under 3 MB is required' USING ERRCODE='22023';END IF;
 v_hash:=encode(digest(v_bytes,'sha256'),'hex');
 IF v_hash<>lower(coalesce(p_sha256,'')) THEN
 RAISE EXCEPTION 'PDF SHA-256 checksum mismatch' USING ERRCODE='22023';END IF;
 IF length(btrim(coalesce(p_filename,''))) NOT BETWEEN 1 AND 120 THEN
 RAISE EXCEPTION 'Valid PDF filename required' USING ERRCODE='22023';END IF;
 SELECT * INTO v_previous FROM public.zimba_land_lease_signed_scans
  WHERE land_lease_id=p_lease ORDER BY revision DESC LIMIT 1;
 IF v_previous.counterparty_confirmed_at IS NOT NULL THEN
 RAISE EXCEPTION 'Confirmed executed land leases are immutable' USING ERRCODE='42501';END IF;
 v_next:=coalesce(v_previous.revision,0)+1;
 IF v_next>10 THEN RAISE EXCEPTION 'Signed document revision limit reached' USING ERRCODE='22023';END IF;
 INSERT INTO public.zimba_land_lease_signed_scans(
  land_lease_id,organization_id,revision,pdf_content,sha256,size_bytes,filename,uploaded_by)
 VALUES(p_lease,v_org,v_next,v_bytes,v_hash,octet_length(v_bytes),btrim(p_filename),auth.uid())
 RETURNING id INTO v_id;
 SELECT u.id INTO v_user FROM neon_auth."user" u WHERE lower(u.email)=v_party.counterparty_email
  AND u."emailVerified"=true AND coalesce(u.banned,false)=false LIMIT 1;
 IF v_user IS NOT NULL THEN
 INSERT INTO public.zimba_notifications(recipient_auth_id,kind,title,body,link,related_id)
 VALUES(v_user,'general','Signed land agreement ready for confirmation',
  'Please review the exact signed PDF in Land signing requests.',
  '#/workspace/land-leases',p_lease);
 END IF;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(auth.uid(),v_org,'land_lease_signed_pdf_uploaded','land_lease',p_lease,
 jsonb_build_object('scanId',v_id,'revision',v_next,'sha256',v_hash,'bytes',octet_length(v_bytes)));
 RETURN jsonb_build_object('id',p_lease,'scanId',v_id,'revision',v_next,
  'sha256',v_hash,'status','pending_counterparty','notificationCreated',v_user IS NOT NULL);
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_land_lease_private_pdf(p_scan uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_email text;v_scan public.zimba_land_lease_signed_scans%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u
  WHERE u.id=v_uid AND u."emailVerified"=true AND coalesce(u.banned,false)=false;
 SELECT s.* INTO v_scan FROM public.zimba_land_lease_signed_scans s
 JOIN public.zimba_land_lease_parties p ON p.land_lease_id=s.land_lease_id AND p.organization_id=s.organization_id
 WHERE s.id=p_scan AND (
  (p.workflow_status='issued' AND p.counterparty_email=v_email AND v_email IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.app_users a JOIN public.memberships m ON m.user_id=a.id
   JOIN public.account_onboarding ob ON ob.auth_user_id=v_uid
   WHERE a.external_auth_id=v_uid::text AND m.organization_id=s.organization_id
   AND m.status='active' AND m.role IN ('owner','admin','manager')
   AND ob.account_role IN ('landlord','manager') AND ob.completed_at IS NOT NULL)
 );
 IF NOT FOUND THEN RAISE EXCEPTION 'Land lease PDF is not available to this account' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('scanId',v_scan.id,'leaseId',v_scan.land_lease_id,
  'revision',v_scan.revision,'filename',v_scan.filename,'sha256',v_scan.sha256,
  'bytes',v_scan.size_bytes,'signed',v_scan.counterparty_confirmed_at IS NOT NULL,
  'base64',encode(v_scan.pdf_content,'base64'));
END $f$;

CREATE OR REPLACE FUNCTION public.zimba_land_lease_counterparty_confirm(
 p_lease uuid,p_scan uuid,p_sha256 text,p_confirm_both boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_uid uuid:=auth.uid();v_email text;v_party public.zimba_land_lease_parties%ROWTYPE;
 v_scan public.zimba_land_lease_signed_scans%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR p_confirm_both IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Explicit signed PDF confirmation required' USING ERRCODE='42501';END IF;
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u
 WHERE u.id=v_uid AND u."emailVerified"=true AND coalesce(u.banned,false)=false;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified counterparty account required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.zimba_land_lease_drafts WHERE id=p_lease FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Land lease not found' USING ERRCODE='42501';END IF;
 SELECT * INTO v_party FROM public.zimba_land_lease_parties WHERE land_lease_id=p_lease FOR UPDATE;
 IF NOT FOUND OR v_party.workflow_status<>'issued' OR v_party.counterparty_email<>v_email THEN
 RAISE EXCEPTION 'This user is not the designated counterparty' USING ERRCODE='42501';END IF;
 SELECT * INTO v_scan FROM public.zimba_land_lease_signed_scans
 WHERE land_lease_id=p_lease ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF v_scan.id IS DISTINCT FROM p_scan OR v_scan.sha256 IS DISTINCT FROM lower(coalesce(p_sha256,'')) THEN
 RAISE EXCEPTION 'Signed PDF version has changed; download and review it again' USING ERRCODE='42501';END IF;
 IF v_scan.uploaded_by=v_uid OR v_party.issued_by=v_uid THEN
 RAISE EXCEPTION 'Uploader and counterparty must be different authenticated accounts' USING ERRCODE='42501';END IF;
 IF v_scan.counterparty_confirmed_at IS NOT NULL THEN
 RETURN jsonb_build_object('status','signed','sha256',v_scan.sha256,'success',true);END IF;
 UPDATE public.zimba_land_lease_signed_scans
 SET counterparty_confirmed_at=now(),counterparty_confirmed_by=v_uid WHERE id=v_scan.id;
 INSERT INTO public.zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details)
 VALUES(v_uid,v_party.organization_id,'land_lease_counterparty_confirmed','land_lease',p_lease,
 jsonb_build_object('scanId',v_scan.id,'revision',v_scan.revision,'sha256',v_scan.sha256));
 RETURN jsonb_build_object('status','signed','sha256',v_scan.sha256,'success',true,
 'note','Document counter-confirmed; land title and registration are not verified.');
END $f$;

REVOKE ALL ON FUNCTION public.zimba_manager_land_lease_contracts() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_save_land_lease(jsonb) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_issue_land_lease(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_my_land_lease_signing_requests() FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_manager_upload_land_lease_pdf(uuid,text,text,text,boolean) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_land_lease_private_pdf(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.zimba_land_lease_counterparty_confirm(uuid,uuid,text,boolean) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.zimba_manager_land_lease_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_save_land_lease(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_issue_land_lease(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_my_land_lease_signing_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_manager_upload_land_lease_pdf(uuid,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_land_lease_private_pdf(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zimba_land_lease_counterparty_confirm(uuid,uuid,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
