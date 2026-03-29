-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "referral_code" TEXT,
ADD COLUMN "referred_by_org_id" TEXT,
ADD COLUMN "pending_referral_credit" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_referral_code_key" ON "organizations"("referral_code");

-- Backfill existing orgs with referral codes
UPDATE "organizations" SET "referral_code" = substr(md5(random()::text), 1, 8) WHERE "referral_code" IS NULL;
