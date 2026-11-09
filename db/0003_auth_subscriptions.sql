-- ZIMBA RENT / development migration 0003
-- Requires Neon Auth (Better Auth) and Neon Data API using verified JWTs.
-- This migration models provisional plans without commercial prices.
-- Privileged database owner executes migrations; clients never receive owner credentials.

CREATE TABLE IF NOT EXISTS subscription_plans (
 code text PRIMARY KEY,
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 rank integer NOT NULL UNIQUE,
 price_ugx bigint CHECK(price_ugx IS NULL OR price_ugx >= 0),
 billing_period text NOT NULL DEFAULT 'monthly' CHECK(billing_period IN ('monthly','yearly','custom')),
 is_public boolean NOT NULL DEFAULT true,
 is_active boolean NOT NULL DEFAULT true,
 entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 plan_code text NOT NULL REFERENCES subscription_plans(code),
 status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','cancelled','suspended')),
 assigned_by uuid REFERENCES neon_auth."user"(id),
 current_period_start timestamptz,
 current_period_end timestamptz,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 notes text
);

CREATE TABLE IF NOT EXISTS platform_admins (
 auth_user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id),
 granted_at timestamptz NOT NULL DEFAULT now(),
 granted_by uuid REFERENCES neon_auth."user"(id),
 disabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_assignment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subscription_id uuid NOT NULL REFERENCES organization_subscriptions(id),
 actor_auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 from_plan text REFERENCES subscription_plans(code),
 to_plan text NOT NULL REFERENCES subscription_plans(code),
 reason text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_type text NOT NULL CHECK(policy_type IN ('terms','privacy','acceptable_use','subscription')),
 version text NOT NULL,
 title text NOT NULL,
 body text NOT NULL,
 effective_at timestamptz NOT NULL,
 published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(policy_type,version)
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 policy_id uuid NOT NULL REFERENCES legal_policies(id),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL DEFAULT 'web',
 UNIQUE(auth_user_id,policy_id)
);

CREATE TABLE IF NOT EXISTS user_plan_assignments (
 auth_user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id),
 plan_code text NOT NULL REFERENCES subscription_plans(code),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('trial','active','suspended','cancelled')),
 assigned_by uuid REFERENCES neon_auth."user"(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 notes text
);

CREATE TABLE IF NOT EXISTS user_plan_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 actor_auth_user_id uuid NOT NULL REFERENCES neon_auth."user"(id),
 previous_plan text REFERENCES subscription_plans(code),
 new_plan text NOT NULL REFERENCES subscription_plans(code),
 reason text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans(code,name,description,rank,price_ugx,billing_period,entitlements)
VALUES
 ('starter','Starter','Entry-level property management',1,NULL,'monthly','{"properties":5,"team_members":1,"access_cards":false,"analytics":"basic"}'),
 ('growth','Growth','For growing property portfolios',2,NULL,'monthly','{"properties":50,"team_members":10,"access_cards":false,"analytics":"advanced"}'),
 ('business','Business','For professional property managers',3,NULL,'monthly','{"properties":250,"team_members":50,"access_cards":true,"analytics":"advanced"}'),
 ('enterprise','Enterprise','For larger organisations and custom arrangements',4,NULL,'custom','{"properties":null,"team_members":null,"access_cards":true,"analytics":"custom"}')
ON CONFLICT(code) DO NOTHING;

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='read_active_plans')
 THEN CREATE POLICY read_active_plans ON subscription_plans FOR SELECT USING (is_active AND is_public); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='legal_policies' AND policyname='read_published_policies')
 THEN CREATE POLICY read_published_policies ON legal_policies FOR SELECT USING (published AND effective_at <= now()); END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_plan_events_user_date ON user_plan_events(auth_user_id,occurred_at DESC);

-- Only the verified platform Google account can claim administrative rights.
-- Once revoked in platform_admins, claims are refused.
CREATE OR REPLACE FUNCTION public.claim_zimba_admin()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT EXISTS (
  SELECT 1 FROM neon_auth."user" u
  WHERE u.id=v_actor AND lower(u.email)='automindsafrica@gmail.com' AND u."emailVerified" IS TRUE
 ) OR NOT EXISTS (
  SELECT 1 FROM neon_auth.account a WHERE a."userId"=v_actor AND a."providerId"='google'
 ) THEN
  RAISE EXCEPTION 'Verified AutoMinds Google account required' USING ERRCODE='42501';
 END IF;
 INSERT INTO platform_admins(auth_user_id) VALUES(v_actor) ON CONFLICT(auth_user_id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM platform_admins WHERE auth_user_id=v_actor AND disabled_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Administrative access has been revoked' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('admin',true,'email','automindsafrica@gmail.com');
END $$;

CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_out jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('code',sp.code,'name',sp.name,'status',up.status,'entitlements',sp.entitlements,'assignedAt',up.assigned_at)
 INTO v_out FROM user_plan_assignments up JOIN subscription_plans sp ON sp.code=up.plan_code WHERE up.auth_user_id=v_user;
 RETURN COALESCE(v_out,'null'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_user_directory()
RETURNS TABLE(user_id uuid,display_name text,email text,email_verified boolean,plan_code text,plan_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM platform_admins pa JOIN neon_auth."user" u ON u.id=pa.auth_user_id
  WHERE pa.auth_user_id=v_actor AND u."emailVerified" IS TRUE
   AND lower(u.email)='automindsafrica@gmail.com' AND pa.disabled_at IS NULL
 ) THEN RAISE EXCEPTION 'Administrator access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.name,u.email,u."emailVerified",up.plan_code,up.status
 FROM neon_auth."user" u LEFT JOIN user_plan_assignments up ON up.auth_user_id=u.id
 ORDER BY u."createdAt" DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_assign_plan(p_target_user uuid,p_plan_code text,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid(); v_previous text;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM platform_admins pa JOIN neon_auth."user" u ON u.id=pa.auth_user_id
  WHERE pa.auth_user_id=v_actor AND u."emailVerified" IS TRUE
   AND lower(u.email)='automindsafrica@gmail.com' AND pa.disabled_at IS NULL
 ) THEN RAISE EXCEPTION 'Administrator access denied' USING ERRCODE='42501'; END IF;
 IF p_target_user IS NULL OR NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_target_user)
 THEN RAISE EXCEPTION 'User not found' USING ERRCODE='22023'; END IF;
 IF p_plan_code IS NULL OR NOT EXISTS(SELECT 1 FROM subscription_plans WHERE code=p_plan_code AND is_active IS TRUE)
 THEN RAISE EXCEPTION 'Invalid subscription plan' USING ERRCODE='22023'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 300
 THEN RAISE EXCEPTION 'Audit reason required (5–300 characters)' USING ERRCODE='22023'; END IF;
 SELECT plan_code INTO v_previous FROM user_plan_assignments WHERE auth_user_id=p_target_user FOR UPDATE;
 INSERT INTO user_plan_assignments(auth_user_id,plan_code,status,assigned_by,assigned_at,notes)
 VALUES(p_target_user,p_plan_code,'active',v_actor,now(),btrim(p_reason))
 ON CONFLICT(auth_user_id) DO UPDATE
 SET plan_code=EXCLUDED.plan_code,status='active',assigned_by=EXCLUDED.assigned_by,
 assigned_at=now(),notes=EXCLUDED.notes;
 INSERT INTO user_plan_events(auth_user_id,actor_auth_user_id,previous_plan,new_plan,reason)
 VALUES(p_target_user,v_actor,v_previous,p_plan_code,btrim(p_reason));
 RETURN jsonb_build_object('success',true,'userId',p_target_user,'plan',p_plan_code);
END $$;

REVOKE ALL ON FUNCTION public.my_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_zimba_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_plan(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_zimba_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan(uuid,text,text) TO authenticated;

-- Important: no general SELECT/UPDATE/INSERT grant to authenticated
-- on user_plan_assignments, platform_admins, neon_auth.user or audit tables.
-- All privileged actions happen inside guarded functions invoked with a verified JWT.
