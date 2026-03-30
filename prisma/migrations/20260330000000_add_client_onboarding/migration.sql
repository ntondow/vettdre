-- Add Client Onboarding Tables
-- Creates ClientOnboarding, OnboardingDocument, and SigningAuditLog tables with supporting enums

-- ============================================================
-- Create Enums
-- ============================================================

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('draft', 'pending', 'partially_signed', 'completed', 'expired', 'voided');

-- CreateEnum
CREATE TYPE "OnboardingDocType" AS ENUM ('tenant_rep_agreement', 'nys_disclosure', 'fair_housing_notice');

-- CreateEnum
CREATE TYPE "SigningStatus" AS ENUM ('pending', 'viewed', 'signed');

-- ============================================================
-- Create Tables
-- ============================================================

-- CreateTable client_onboardings
CREATE TABLE "client_onboardings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "client_first_name" TEXT NOT NULL,
    "client_last_name" TEXT NOT NULL,
    "client_email" TEXT NOT NULL,
    "client_phone" TEXT,
    "deal_type" TEXT,
    "property_address" TEXT,
    "exclusive_type" TEXT,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'draft',
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "sent_via" TEXT,
    "completed_at" TIMESTAMP(3),
    "all_docs_signed" BOOLEAN NOT NULL DEFAULT false,
    "commission_pct" DECIMAL(5,2),
    "monthly_rent" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable onboarding_documents
CREATE TABLE "onboarding_documents" (
    "id" TEXT NOT NULL,
    "onboarding_id" TEXT NOT NULL,
    "doc_type" "OnboardingDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "template_html" TEXT,
    "pdf_url" TEXT,
    "status" "SigningStatus" NOT NULL DEFAULT 'pending',
    "signed_at" TIMESTAMP(3),
    "signed_ip" TEXT,
    "signature_data" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable signing_audit_logs
CREATE TABLE "signing_audit_logs" (
    "id" TEXT NOT NULL,
    "onboarding_id" TEXT NOT NULL,
    "document_id" TEXT,
    "action" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signing_audit_logs_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Create Indexes
-- ============================================================

-- client_onboardings indexes
CREATE INDEX "client_onboardings_org_id_idx" ON "client_onboardings"("org_id");
CREATE INDEX "client_onboardings_agent_id_idx" ON "client_onboardings"("agent_id");
CREATE INDEX "client_onboardings_org_id_status_idx" ON "client_onboardings"("org_id", "status");
CREATE INDEX "client_onboardings_token_idx" ON "client_onboardings"("token");

-- onboarding_documents indexes
CREATE INDEX "onboarding_documents_onboarding_id_idx" ON "onboarding_documents"("onboarding_id");
CREATE INDEX "onboarding_documents_onboarding_id_doc_type_idx" ON "onboarding_documents"("onboarding_id", "doc_type");

-- signing_audit_logs indexes
CREATE INDEX "signing_audit_logs_onboarding_id_idx" ON "signing_audit_logs"("onboarding_id");
CREATE INDEX "signing_audit_logs_document_id_idx" ON "signing_audit_logs"("document_id");
CREATE INDEX "signing_audit_logs_onboarding_id_action_idx" ON "signing_audit_logs"("onboarding_id", "action");

-- ============================================================
-- Create Foreign Keys
-- ============================================================

-- client_onboardings foreign keys
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "broker_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- onboarding_documents foreign key
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_onboarding_id_fkey"
  FOREIGN KEY ("onboarding_id") REFERENCES "client_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- signing_audit_logs foreign keys
ALTER TABLE "signing_audit_logs" ADD CONSTRAINT "signing_audit_logs_onboarding_id_fkey"
  FOREIGN KEY ("onboarding_id") REFERENCES "client_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signing_audit_logs" ADD CONSTRAINT "signing_audit_logs_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "onboarding_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Create Unique Constraints
-- ============================================================

ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_contact_id_key" UNIQUE ("contact_id");
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_token_key" UNIQUE ("token");
