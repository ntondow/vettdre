-- Wire brokerage processing fee into invoice creation flow.
--
-- Existing state:
--   organizations.processing_fee_pct        already exists (NUMERIC 5,2, default 0)
--   deal_submissions.processing_fee_pct     already exists (NUMERIC 5,2, nullable)
--   deal_submissions.processing_fee_amt     already exists (NUMERIC 12,2, nullable)
--
-- New columns this migration adds:
--   deal_submissions.processing_fee_override  per-deal override flag
--   invoices.processing_fee_pct               historical fee snapshot
--   invoices.processing_fee_amt               historical fee snapshot
--
-- Backfill: the 18 deals bulk-imported from Kristin already have manual fee
-- values; mark them all as overridden so future organizations.processing_fee_pct
-- changes don't sweep over them. The two NULL ones (Christine's exemption,
-- Alejandra's note) get explicit zeros first.

-- AlterTable
ALTER TABLE "public"."deal_submissions"
  ADD COLUMN "processing_fee_override" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."invoices"
  ADD COLUMN "processing_fee_pct" DECIMAL(5,2),
  ADD COLUMN "processing_fee_amt" DECIMAL(12,2);

-- Backfill: lock the 18 bulk-imported deals to their imported fee values.
-- COALESCE turns the two NULL exemptions into explicit zeros before the flip,
-- so a later org-default change can't reach back and reapply a fee.
UPDATE "public"."deal_submissions"
   SET "processing_fee_pct" = COALESCE("processing_fee_pct", 0),
       "processing_fee_amt" = COALESCE("processing_fee_amt", 0),
       "processing_fee_override" = true
 WHERE "notes" LIKE 'Bulk-imported from Kristin%';

-- Backfill: mirror the historical fee onto the matching invoices so the
-- invoice panel renders correct numbers without falling back to the submission.
UPDATE "public"."invoices" i
   SET "processing_fee_pct" = ds."processing_fee_pct",
       "processing_fee_amt" = ds."processing_fee_amt"
  FROM "public"."deal_submissions" ds
 WHERE i."deal_submission_id" = ds."id"
   AND ds."notes" LIKE 'Bulk-imported from Kristin%'
   AND i."processing_fee_pct" IS NULL;
