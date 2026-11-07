-- Zimba Rent foundation schema (Neon development)
-- Initial schema: 2026-11-07. Apply to a fresh development database using a trusted admin migration runner.
-- Application users MUST NOT connect using the database owner role.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_auth_id text UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  role text NOT NULL CHECK(role IN ('owner','admin','manager','agent','staff','landlord','resident')),
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  description text,
  address_line text,
  city text,
  country text NOT NULL DEFAULT 'Uganda',
  category text NOT NULL CHECK(category IN ('apartment','house','land','commercial','mixed')),
  listing_intent text NOT NULL CHECK(listing_intent IN ('rent','sale','internal')),
  visibility text NOT NULL DEFAULT 'draft' CHECK(visibility IN ('draft','review','published','archived')),
  asking_price_ugx bigint CHECK(asking_price_ugx >= 0),
  bedrooms integer DEFAULT 0 CHECK(bedrooms >= 0),
  bathrooms integer DEFAULT 0 CHECK(bathrooms >= 0),
  area_sqm numeric(12,2) CHECK(area_sqm >= 0),
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL,
  unit_number text NOT NULL,
  floor_label text,
  monthly_rent_ugx bigint CHECK(monthly_rent_ugx >= 0),
  status text NOT NULL DEFAULT 'vacant' CHECK(status IN ('vacant','occupied','maintenance','reserved')),
  UNIQUE(property_id,unit_number),
  UNIQUE(id,organization_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid REFERENCES app_users(id),
  legal_name text NOT NULL,
  contact_email text,
  contact_phone text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE TABLE IF NOT EXISTS leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  unit_id uuid NOT NULL,
  resident_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date,
  monthly_rent_ugx bigint NOT NULL CHECK(monthly_rent_ugx >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','terminated','expired')),
  created_at timestamptz DEFAULT now(),
  CHECK(end_date IS NULL OR end_date >= start_date),
  UNIQUE(id,organization_id),
  FOREIGN KEY(unit_id,organization_id) REFERENCES units(id,organization_id),
  FOREIGN KEY(resident_id,organization_id) REFERENCES residents(id,organization_id)
);
CREATE TABLE IF NOT EXISTS rent_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  lease_id uuid NOT NULL,
  due_date date NOT NULL,
  amount_ugx bigint NOT NULL CHECK(amount_ugx >= 0),
  status text NOT NULL DEFAULT 'due' CHECK(status IN ('due','partial','paid','void')),
  external_reference text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(id,organization_id),
  FOREIGN KEY(lease_id,organization_id) REFERENCES leases(id,organization_id)
);
CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  charge_id uuid,
  provider text NOT NULL,
  provider_reference text,
  amount_ugx bigint NOT NULL CHECK(amount_ugx >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','failed','reversed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE(organization_id,idempotency_key),
  FOREIGN KEY(charge_id,organization_id) REFERENCES rent_charges(id,organization_id)
);
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL,
  unit_id uuid,
  issue text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
  FOREIGN KEY(unit_id,organization_id) REFERENCES units(id,organization_id)
);
CREATE TABLE IF NOT EXISTS enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  contact_name text NOT NULL,
  contact_email text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resident_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  resident_id uuid NOT NULL,
  card_token_hash text NOT NULL UNIQUE,
  card_label text,
  status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('inactive','active','suspended','revoked')),
  issued_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(id,organization_id),
  FOREIGN KEY(resident_id,organization_id) REFERENCES residents(id,organization_id)
);
CREATE TABLE IF NOT EXISTS access_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL,
  device_name text NOT NULL,
  provider text,
  external_device_id text,
  status text NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','disabled')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(id,organization_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
CREATE TABLE IF NOT EXISTS access_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  resident_card_id uuid NOT NULL,
  device_id uuid NOT NULL,
  permitted_from timestamptz NOT NULL DEFAULT now(),
  permitted_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(resident_card_id,device_id),
  FOREIGN KEY(resident_card_id,organization_id) REFERENCES resident_cards(id,organization_id),
  FOREIGN KEY(device_id,organization_id) REFERENCES access_devices(id,organization_id)
);
CREATE TABLE IF NOT EXISTS access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  device_id uuid NOT NULL,
  resident_card_id uuid,
  decision text NOT NULL CHECK(decision IN ('granted','denied','error')),
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_key text NOT NULL,
  UNIQUE(organization_id,event_key),
  FOREIGN KEY(device_id,organization_id) REFERENCES access_devices(id,organization_id),
  FOREIGN KEY(resident_card_id,organization_id) REFERENCES resident_cards(id,organization_id)
);
CREATE TABLE IF NOT EXISTS payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  resident_id uuid NOT NULL,
  provider text NOT NULL,
  provider_token_reference text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY(resident_id,organization_id) REFERENCES residents(id,organization_id)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  entry_group uuid NOT NULL,
  account_reference text NOT NULL,
  direction text NOT NULL CHECK(direction IN ('debit','credit')),
  amount_ugx bigint NOT NULL CHECK(amount_ugx > 0),
  description text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE(organization_id,idempotency_key,account_reference,direction)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_properties_listing ON properties(visibility,listing_intent,city);
CREATE INDEX IF NOT EXISTS idx_units_property ON units(organization_id,property_id);
CREATE INDEX IF NOT EXISTS idx_charges_lease_due ON rent_charges(organization_id,lease_id,due_date);
CREATE INDEX IF NOT EXISTS idx_access_events_time ON access_events(organization_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(organization_id,created_at DESC);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- The following public-reader privileges are deliberately NOT created here.
-- Provision zimba_public_reader as a Neon-scoped read_only role, then apply db/0002_public_reader.sql.
