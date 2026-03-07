-- Add variant_id to leasing_follow_ups for A/B testing
ALTER TABLE "leasing_follow_ups" ADD COLUMN "variant_id" TEXT;

-- Index for querying by variant
CREATE INDEX "leasing_follow_ups_variant_id_idx" ON "leasing_follow_ups"("variant_id");
