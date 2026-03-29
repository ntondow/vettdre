-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('sms', 'email', 'voice', 'web_chat');

-- AlterTable: LeasingConfig add emailEnabled
ALTER TABLE "leasing_configs" ADD COLUMN "email_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: LeasingConversation add channel and emailSubject
ALTER TABLE "leasing_conversations" ADD COLUMN "channel" "ConversationChannel" NOT NULL DEFAULT 'sms';
ALTER TABLE "leasing_conversations" ADD COLUMN "email_subject" TEXT;

-- AlterTable: LeasingMessage add channel
ALTER TABLE "leasing_messages" ADD COLUMN "channel" "ConversationChannel" NOT NULL DEFAULT 'sms';

-- CreateIndex: unique on configId + prospectEmail (conditional — only when email is not null)
CREATE UNIQUE INDEX "leasing_conversations_config_email_unique" ON "leasing_conversations"("config_id", "prospect_email") WHERE "prospect_email" IS NOT NULL;

-- CreateIndex: index on prospectEmail
CREATE INDEX "leasing_conversations_prospect_email_idx" ON "leasing_conversations"("prospect_email");
