-- ============================================================
-- Migration: Planos Pro, Billing e Analytics
-- ============================================================

DO $$ BEGIN CREATE TYPE "UserPlan" AS ENUM ('free', 'pro'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SubscriptionBillingStatus" AS ENUM ('active','past_due','cancelled','trialing'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BillingProvider" AS ENUM ('stripe','mercadopago','manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BillingInterval" AS ENUM ('monthly','annual'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "plan"               "UserPlan" NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "plan_expires_at"    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "billing_customer_id" VARCHAR(120);

CREATE TABLE IF NOT EXISTS "plan_subscriptions" (
  "id"                    BIGSERIAL PRIMARY KEY,
  "user_id"               BIGINT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "provider"              "BillingProvider" NOT NULL,
  "external_id"           VARCHAR(255),
  "status"                "SubscriptionBillingStatus" NOT NULL DEFAULT 'active',
  "interval"              "BillingInterval" NOT NULL DEFAULT 'monthly',
  "current_period_start"  TIMESTAMP NOT NULL,
  "current_period_end"    TIMESTAMP NOT NULL,
  "cancel_at_period_end"  BOOLEAN NOT NULL DEFAULT FALSE,
  "trial_ends_at"         TIMESTAMP,
  "price_amount"          DECIMAL(10,2) NOT NULL,
  "currency"              VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "created_at"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "page_views" (
  "id"          BIGSERIAL PRIMARY KEY,
  "path"        VARCHAR(255) NOT NULL,
  "user_id"     BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "session_id"  VARCHAR(100),
  "referrer"    VARCHAR(500),
  "user_agent"  VARCHAR(500),
  "country"     VARCHAR(2),
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "page_views_path_created_idx" ON "page_views"("path", "created_at");
CREATE INDEX IF NOT EXISTS "page_views_user_id_idx"      ON "page_views"("user_id");
