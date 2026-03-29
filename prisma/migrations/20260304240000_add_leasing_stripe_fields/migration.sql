-- Add Stripe billing fields to leasing_configs
ALTER TABLE "leasing_configs" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "leasing_configs" ADD COLUMN "stripe_subscription_id" TEXT;
