-- CreateEnum
CREATE TYPE "LeasingTier" AS ENUM ('free', 'pro', 'team');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'qualified', 'showing_scheduled', 'applied', 'escalated', 'closed_won', 'closed_lost', 'stale');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('hot', 'warm', 'cool', 'cold');

-- CreateEnum
CREATE TYPE "EscalationReason" AS ENUM ('budget_mismatch', 'pet_policy', 'complex_question', 'showing_request', 'application_ready', 'complaint', 'manual');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('prospect', 'ai', 'agent');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('no_response', 'showing_reminder', 'application_nudge', 'check_in', 'custom');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('pending', 'sent', 'canceled');

-- CreateTable
CREATE TABLE "leasing_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "tier" "LeasingTier" NOT NULL DEFAULT 'free',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "twilio_number_id" TEXT,
    "ai_name" TEXT NOT NULL DEFAULT 'Leasing Assistant',
    "ai_tone" TEXT NOT NULL DEFAULT 'professional_friendly',
    "greeting" TEXT NOT NULL DEFAULT 'Hi! I''m the leasing assistant for this property. How can I help you today?',
    "personality" TEXT NOT NULL DEFAULT 'friendly',
    "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "custom_instructions" TEXT,
    "building_knowledge" JSONB,
    "auto_enrichment_data" JSONB,
    "qual_criteria" JSONB NOT NULL DEFAULT '{}',
    "office_hours_start" TEXT,
    "office_hours_end" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leasing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leasing_conversations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "prospect_phone" TEXT NOT NULL,
    "prospect_name" TEXT,
    "prospect_email" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "temperature" "LeadTemperature" NOT NULL DEFAULT 'warm',
    "qual_data" JSONB NOT NULL DEFAULT '{}',
    "ai_summary" TEXT,
    "listing_id" TEXT,
    "escalated_at" TIMESTAMP(3),
    "escalation_reason" "EscalationReason",
    "showing_agent_id" TEXT,
    "showing_at" TIMESTAMP(3),
    "contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leasing_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leasing_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "twilio_sid" TEXT,
    "intent_detected" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leasing_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leasing_follow_ups" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "message_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leasing_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leasing_daily_usage" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "messages_ai" INTEGER NOT NULL DEFAULT 0,
    "messages_inbound" INTEGER NOT NULL DEFAULT 0,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leasing_daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leasing_configs_org_id_idx" ON "leasing_configs"("org_id");

-- CreateIndex
CREATE INDEX "leasing_configs_org_id_is_active_idx" ON "leasing_configs"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "leasing_configs_property_id_key" ON "leasing_configs"("property_id");

-- CreateIndex
CREATE INDEX "leasing_conversations_org_id_status_idx" ON "leasing_conversations"("org_id", "status");

-- CreateIndex
CREATE INDEX "leasing_conversations_config_id_idx" ON "leasing_conversations"("config_id");

-- CreateIndex
CREATE INDEX "leasing_conversations_prospect_phone_idx" ON "leasing_conversations"("prospect_phone");

-- CreateIndex
CREATE UNIQUE INDEX "leasing_conversations_config_id_prospect_phone_key" ON "leasing_conversations"("config_id", "prospect_phone");

-- CreateIndex
CREATE INDEX "leasing_messages_conversation_id_created_at_idx" ON "leasing_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "leasing_follow_ups_status_scheduled_for_idx" ON "leasing_follow_ups"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "leasing_follow_ups_conversation_id_idx" ON "leasing_follow_ups"("conversation_id");

-- CreateIndex
CREATE INDEX "leasing_daily_usage_config_id_date_idx" ON "leasing_daily_usage"("config_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leasing_daily_usage_config_id_date_key" ON "leasing_daily_usage"("config_id", "date");

-- AddForeignKey
ALTER TABLE "leasing_configs" ADD CONSTRAINT "leasing_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_configs" ADD CONSTRAINT "leasing_configs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "bms_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_configs" ADD CONSTRAINT "leasing_configs_twilio_number_id_fkey" FOREIGN KEY ("twilio_number_id") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_conversations" ADD CONSTRAINT "leasing_conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_conversations" ADD CONSTRAINT "leasing_conversations_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "leasing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_conversations" ADD CONSTRAINT "leasing_conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "bms_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_conversations" ADD CONSTRAINT "leasing_conversations_showing_agent_id_fkey" FOREIGN KEY ("showing_agent_id") REFERENCES "broker_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_conversations" ADD CONSTRAINT "leasing_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_messages" ADD CONSTRAINT "leasing_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "leasing_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_follow_ups" ADD CONSTRAINT "leasing_follow_ups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "leasing_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leasing_daily_usage" ADD CONSTRAINT "leasing_daily_usage_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "leasing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
