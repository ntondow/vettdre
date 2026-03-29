-- AlterEnum
ALTER TYPE "FollowUpType" ADD VALUE 'waitlist_notify';

-- AlterTable
ALTER TABLE "leasing_conversations" ADD COLUMN "on_waitlist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leasing_conversations" ADD COLUMN "waitlist_added_at" TIMESTAMP(3);
ALTER TABLE "leasing_conversations" ADD COLUMN "waitlist_units" TEXT[] DEFAULT ARRAY[]::TEXT[];
