-- Run after creating a least-privilege Neon role called zimba_public_reader
-- in the zimba_rent_dev database. Applied to existing Neon development DB 2026-11-07.
CREATE POLICY public_published_properties ON properties
  FOR SELECT TO zimba_public_reader USING (visibility = 'published');
ALTER TABLE properties FORCE ROW LEVEL SECURITY;

REVOKE ALL ON organizations,app_users,memberships,units,residents,leases,
  rent_charges,payment_records,maintenance_requests,enquiries,resident_cards,
  access_devices,access_permissions,access_events,payment_accounts,ledger_entries,
  audit_logs FROM zimba_public_reader;

GRANT SELECT (id,title,description,address_line,city,country,category,
  listing_intent,asking_price_ugx,bedrooms,bathrooms,area_sqm,created_at)
  ON properties TO zimba_public_reader;

CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS
  SELECT id,title,description,address_line,city,country,category,listing_intent,
         asking_price_ugx,bedrooms,bathrooms,area_sqm,created_at
  FROM properties WHERE visibility = 'published';
GRANT SELECT ON public_listings TO zimba_public_reader;
