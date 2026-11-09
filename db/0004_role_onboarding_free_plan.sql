-- ZIMBA RENT / migration 0004: Free one-property plan and role-oriented onboarding
-- Installed on Neon development branch on 9 November 2026.
-- Follow with 0005 and 0006 for hardened RPCs and resident linking.
-- Run on development branch after credentials are restored and audit existing plan assignments.

INSERT INTO subscription_plans(code,name,description,rank,price_ugx,billing_period,entitlements)
VALUES ('free','Free','One-property landlord workspace',0,0,'monthly',
 '{"properties":1,"team_members":1,"access_cards":false,"analytics":"basic","rental_billing":false}'::jsonb)
ON CONFLICT (code) DO UPDATE
 SET name=EXCLUDED.name,description=EXCLUDED.description,
 price_ugx=0,entitlements=EXCLUDED.entitlements,is_public=true,is_active=true;

-- Plan definitions are feature-preview metadata; billing for non-Free plans
-- requires approved pricing, payment provider configuration, and legal terms.

CREATE TABLE IF NOT EXISTS account_onboarding (
 auth_user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
 account_role text NOT NULL CHECK(account_role IN ('landlord','manager','tenant','renter','buyer')),
 preferred_area text,
 budget_preference text,
 first_property_name text,
 onboarding_version integer NOT NULL DEFAULT 1,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resident_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 unit_id uuid REFERENCES units(id),
 invited_email text,
 invited_auth_user_id uuid REFERENCES neon_auth."user"(id),
 invited_by_auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 invitation_code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resident_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 resident_auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 unit_id uuid REFERENCES units(id),
 linked_from_invitation uuid NOT NULL UNIQUE REFERENCES resident_invites(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 linked_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,resident_auth_user_id,property_id,unit_id)
);

ALTER TABLE account_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_connections ENABLE ROW LEVEL SECURITY;

-- No anonymous access and no blanket grants on invitations or connections.
-- Invitation acceptance must validate OTP-authenticated identity, hashed
-- server-generated token, expiry, revocation, organization and unit ownership
-- within a database transaction. Do not link a resident using a short display ID.

CREATE OR REPLACE FUNCTION public.my_onboarding()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE v_auth uuid:=auth.uid(); v_row account_onboarding%ROWTYPE;
 BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM account_onboarding WHERE auth_user_id=v_auth;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('role',v_row.account_role,'preferred_area',v_row.preferred_area,
    'budget_preference',v_row.budget_preference,'first_property_name',v_row.first_property_name,
    'completed_at',v_row.completed_at,'onboarding_version',v_row.onboarding_version);
 END $$;

CREATE OR REPLACE FUNCTION public.finish_my_onboarding(
 p_role text,p_area text DEFAULT NULL,p_budget text DEFAULT NULL,p_first_property_name text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE v_auth uuid:=auth.uid();
 BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_role NOT IN ('landlord','manager','tenant','renter','buyer') THEN
    RAISE EXCEPTION 'Invalid account role' USING ERRCODE='22023';
  END IF;
  IF LENGTH(COALESCE(p_area,''))>120 OR LENGTH(COALESCE(p_budget,''))>120 OR
     LENGTH(COALESCE(p_first_property_name,''))>100 THEN
    RAISE EXCEPTION 'Onboarding text too long' USING ERRCODE='22023';
  END IF;
  INSERT INTO account_onboarding(auth_user_id,account_role,preferred_area,budget_preference,
    first_property_name,onboarding_version,completed_at)
  VALUES(v_auth,p_role,NULLIF(TRIM(p_area),''),NULLIF(TRIM(p_budget),''),
    NULLIF(TRIM(p_first_property_name),''),1,now())
  ON CONFLICT(auth_user_id) DO UPDATE
  SET account_role=EXCLUDED.account_role,preferred_area=EXCLUDED.preferred_area,
    budget_preference=EXCLUDED.budget_preference,first_property_name=EXCLUDED.first_property_name,
    onboarding_version=EXCLUDED.onboarding_version,completed_at=now(),updated_at=now();
  IF p_role IN ('landlord','manager') THEN
    INSERT INTO user_plan_assignments(auth_user_id,plan_code,status)
      VALUES(v_auth,'free','active')
      ON CONFLICT(auth_user_id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('success',true,'role',p_role);
 END $$;

REVOKE ALL ON FUNCTION public.my_onboarding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_my_onboarding(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_onboarding(text,text,text,text) TO authenticated;

-- Future production release: implement server-side property creation RPC
-- requiring account_role IN ('landlord','manager') and current active plan
-- entitlement count, with row locking to avoid concurrent quota bypass.
