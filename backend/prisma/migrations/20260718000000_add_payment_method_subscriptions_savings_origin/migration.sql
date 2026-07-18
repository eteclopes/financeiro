-- Migration: Add payment method to fixed expenses, subscriptions, savings origin

-- 1. New ENUMs
DO $$ BEGIN
  CREATE TYPE "PurchaseType" AS ENUM ('eventual', 'installment', 'subscription');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionPeriodicity" AS ENUM ('monthly', 'annual', 'custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SavingsOrigin" AS ENUM ('from_balance', 'external');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Add payment_method and card_id to fixed_expense_templates
ALTER TABLE "fixed_expense_templates"
  ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod" NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS "card_id" BIGINT REFERENCES "cards"("id") ON DELETE SET NULL;

-- 3. Add origin to savings_transactions
ALTER TABLE "savings_transactions"
  ADD COLUMN IF NOT EXISTS "origin" "SavingsOrigin" NOT NULL DEFAULT 'from_balance';

-- 4. Create subscriptions table
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                BIGSERIAL PRIMARY KEY,
  "user_id"           BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "card_id"           BIGINT REFERENCES "cards"("id") ON DELETE SET NULL,
  "category_id"       BIGINT NOT NULL REFERENCES "categories"("id"),
  "description"       VARCHAR(160) NOT NULL,
  "value"             DECIMAL(12, 2) NOT NULL,
  "periodicity"       "SubscriptionPeriodicity" NOT NULL DEFAULT 'monthly',
  "custom_days"       SMALLINT,
  "payment_method"    "PaymentMethod" NOT NULL DEFAULT 'credit',
  "next_charge_date"  DATE NOT NULL,
  "end_date"          DATE,
  "status"            "SubscriptionStatus" NOT NULL DEFAULT 'active',
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");
