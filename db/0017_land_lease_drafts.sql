-- ZIMBA RENT / 0017 Separate land lease drafts and monthly rental agreements.
-- The drafts below are neither signed leases nor registered land interests.
-- Land title, consenting parties and registration requirements need independent verification.
CREATE TABLE IF NOT EXISTS zimba_land_lease_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid REFERENCES properties(id),
 parcel_reference text NOT NULL CHECK(length(btrim(parcel_reference)) BETWEEN 3 AND 150),
 location_description text NOT NULL CHECK(length(btrim(location_description)) BETWEEN 8 AND 500),
 start_date date NOT NULL,
 end_date date NOT NULL,
 premium_ugx bigint NOT NULL DEFAULT 0 CHECK(premium_ugx>=0),
 periodic_rent_ugx bigint NOT NULL DEFAULT 0 CHECK(periodic_rent_ugx>=0),
 renewal_terms text NOT NULL CHECK(length(btrim(renewal_terms)) BETWEEN 10 AND 2000),
 conditions text NOT NULL CHECK(length(btrim(conditions)) BETWEEN 30 AND 10000),
 status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>start_date)
);
ALTER TABLE zimba_land_lease_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zimba_land_lease_drafts FROM PUBLIC,anonymous,authenticated;
CREATE INDEX IF NOT EXISTS zimba_land_lease_org_idx ON zimba_land_lease_drafts(organization_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.zimba_manager_create_land_lease_draft(p_parcel text, p_location text, p_start date, p_end date, p_premium bigint, p_rent bigint, p_renewal text, p_conditions text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid:=public.zimba_my_manager_org();id uuid;
 BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_premium IS NULL OR p_premium<0 OR p_rent IS NULL OR p_rent<0 THEN RAISE EXCEPTION 'Invalid term or financial values' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_parcel,''))) NOT BETWEEN 3 AND 150 OR length(btrim(coalesce(p_location,''))) NOT BETWEEN 8 AND 500 OR length(btrim(coalesce(p_renewal,''))) NOT BETWEEN 10 AND 2000 OR length(btrim(coalesce(p_conditions,''))) NOT BETWEEN 30 AND 10000 THEN RAISE EXCEPTION 'Complete all land lease particulars' USING ERRCODE='22023'; END IF;
 INSERT INTO zimba_land_lease_drafts(organization_id,parcel_reference,location_description,start_date,end_date,premium_ugx,periodic_rent_ugx,renewal_terms,conditions,created_by)
 VALUES(org,btrim(p_parcel),btrim(p_location),p_start,p_end,p_premium,p_rent,btrim(p_renewal),btrim(p_conditions),auth.uid()) RETURNING zimba_land_lease_drafts.id INTO id;
 INSERT INTO zimba_security_audit(actor_auth_id,organization_id,action,resource,resource_id,details) VALUES(auth.uid(),org,'land_lease_draft_created','land_lease',id,jsonb_build_object('termStart',p_start,'termEnd',p_end));
 RETURN jsonb_build_object('id',id,'status','draft','legalExecution',false);
 END $function$


CREATE OR REPLACE FUNCTION public.zimba_manager_land_lease_drafts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE org uuid:=public.zimba_my_manager_org();result jsonb;
 BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'parcel',d.parcel_reference,'location',d.location_description,'start',d.start_date,'end',d.end_date,'premium',d.premium_ugx,'rent',d.periodic_rent_ugx,'renewalTerms',d.renewal_terms,'conditions',d.conditions,'status',d.status) ORDER BY d.created_at DESC),'[]'::jsonb) INTO result FROM zimba_land_lease_drafts d WHERE organization_id=org;
 RETURN result;
 END $function$

REVOKE ALL ON FUNCTION public.zimba_manager_create_land_lease_draft(p_parcel text, p_location text, p_start date, p_end date, p_premium bigint, p_rent bigint, p_renewal text, p_conditions text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_create_land_lease_draft(p_parcel text, p_location text, p_start date, p_end date, p_premium bigint, p_rent bigint, p_renewal text, p_conditions text) TO authenticated;
REVOKE ALL ON FUNCTION public.zimba_manager_land_lease_drafts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zimba_manager_land_lease_drafts() TO authenticated;
NOTIFY pgrst,'reload schema';
