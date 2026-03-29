-- AlterEnum
ALTER TYPE "EscalationReason" ADD VALUE 'sms_delivery_failure';

-- AlterTable
ALTER TABLE "leasing_messages" ADD COLUMN "delivery_status" TEXT;
