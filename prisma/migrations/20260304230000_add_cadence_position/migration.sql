-- AlterEnum: add new FollowUpType values for cadence engine
ALTER TYPE "FollowUpType" ADD VALUE 'touch_1';
ALTER TYPE "FollowUpType" ADD VALUE 'touch_2';
ALTER TYPE "FollowUpType" ADD VALUE 'touch_3';
ALTER TYPE "FollowUpType" ADD VALUE 'post_showing';
ALTER TYPE "FollowUpType" ADD VALUE 'app_nudge';
ALTER TYPE "FollowUpType" ADD VALUE 're_engage';

-- AlterTable: LeasingFollowUp add cadencePosition
ALTER TABLE "leasing_follow_ups" ADD COLUMN "cadence_position" INTEGER NOT NULL DEFAULT 1;
