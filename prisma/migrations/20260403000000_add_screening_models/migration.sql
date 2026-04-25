-- Screening module: 7 enums, 11 tables, 1 utility table (ProcessedWebhook)

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE "ScreeningTier" AS ENUM ('base', 'enhanced');

CREATE TYPE "ScreeningStatus" AS ENUM ('draft', 'invited', 'in_progress', 'pending_payment', 'processing', 'complete', 'approved', 'conditional', 'denied', 'withdrawn');

CREATE TYPE "ScreeningApplicantRole" AS ENUM ('main', 'co_applicant', 'guarantor', 'occupant');

CREATE TYPE "ScreeningApplicantStatus" AS ENUM ('invited', 'in_progress', 'completed', 'skipped');

CREATE TYPE "FraudAssessment" AS ENUM ('clean', 'low_risk', 'medium_risk', 'high_risk', 'fraudulent');

CREATE TYPE "ScreeningDocType" AS ENUM ('pay_stub', 'w2', 'tax_return', 'ten99', 'bank_statement', 'employment_letter', 'landlord_reference', 'government_id', 'other');

CREATE TYPE "CreditBureau" AS ENUM ('equifax', 'experian', 'transunion');

-- ── ProcessedWebhook (idempotency) ───────────────────────────

CREATE TABLE "processed_webhooks" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_webhooks_provider_event_id_key" ON "processed_webhooks"("provider", "event_id");
CREATE INDEX "processed_webhooks_provider_event_id_idx" ON "processed_webhooks"("provider", "event_id");
CREATE INDEX "processed_webhooks_processed_at_idx" ON "processed_webhooks"("processed_at");

-- ── ScreeningApplication ─────────────────────────────────────

CREATE TABLE "screening_applications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_user_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "property_address" TEXT NOT NULL,
    "unit_number" TEXT,
    "monthly_rent" DECIMAL(10,2),
    "screening_tier" "ScreeningTier" NOT NULL DEFAULT 'base',
    "status" "ScreeningStatus" NOT NULL DEFAULT 'draft',
    "field_config" JSONB NOT NULL DEFAULT '{}',
    "access_token" TEXT NOT NULL,
    "invite_sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "decision_at" TIMESTAMP(3),
    "decision_notes" TEXT,
    "report_pdf_path" TEXT,
    "report_generated_at" TIMESTAMP(3),
    "vettdre_risk_score" DECIMAL(5,2),
    "risk_recommendation" TEXT,
    "risk_factors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "screening_applications_access_token_key" ON "screening_applications"("access_token");
CREATE INDEX "screening_applications_org_id_idx" ON "screening_applications"("org_id");
CREATE INDEX "screening_applications_org_id_status_idx" ON "screening_applications"("org_id", "status");
CREATE INDEX "screening_applications_agent_user_id_idx" ON "screening_applications"("agent_user_id");
CREATE INDEX "screening_applications_contact_id_idx" ON "screening_applications"("contact_id");
CREATE INDEX "screening_applications_access_token_idx" ON "screening_applications"("access_token");

-- ── ScreeningApplicant ───────────────────────────────────────

CREATE TABLE "screening_applicants" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "role" "ScreeningApplicantRole" NOT NULL DEFAULT 'main',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "personal_info" JSONB NOT NULL DEFAULT '{}',
    "ssn_encrypted" TEXT,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "wizard_completed" BOOLEAN NOT NULL DEFAULT false,
    "plaid_skipped" BOOLEAN NOT NULL DEFAULT false,
    "invite_sent_at" TIMESTAMP(3),
    "invite_method" TEXT,
    "otp_code" TEXT,
    "otp_expires_at" TIMESTAMP(3),
    "otp_target" TEXT,
    "status" "ScreeningApplicantStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_applicants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_applicants_application_id_idx" ON "screening_applicants"("application_id");
CREATE INDEX "screening_applicants_email_idx" ON "screening_applicants"("email");

-- ── ScreeningSignature ───────────────────────────────────────

CREATE TABLE "screening_signatures" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_version" TEXT NOT NULL,
    "document_text" TEXT NOT NULL,
    "signature_image_path" TEXT,
    "signature_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_signatures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_signatures_applicant_id_idx" ON "screening_signatures"("applicant_id");

-- ── PlaidConnection ──────────────────────────────────────────

CREATE TABLE "plaid_connections" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "plaid_item_id" TEXT NOT NULL,
    "institution_name" TEXT,
    "institution_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "error_code" TEXT,
    "transactions_synced" BOOLEAN NOT NULL DEFAULT false,
    "income_verified" BOOLEAN NOT NULL DEFAULT false,
    "identity_verified" BOOLEAN NOT NULL DEFAULT false,
    "accounts" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plaid_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plaid_connections_applicant_id_idx" ON "plaid_connections"("applicant_id");

-- ── FinancialTransaction ─────────────────────────────────────

CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "plaid_connection_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "plaid_transaction_id" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "name" TEXT,
    "merchant_name" TEXT,
    "category" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_category" TEXT,
    "vettdre_category" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_red_flag" BOOLEAN NOT NULL DEFAULT false,
    "red_flag_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_transactions_plaid_transaction_id_key" ON "financial_transactions"("plaid_transaction_id");
CREATE INDEX "financial_transactions_applicant_id_idx" ON "financial_transactions"("applicant_id");
CREATE INDEX "financial_transactions_date_idx" ON "financial_transactions"("date");
CREATE INDEX "financial_transactions_vettdre_category_idx" ON "financial_transactions"("vettdre_category");

-- ── CreditReport ─────────────────────────────────────────────

CREATE TABLE "credit_reports" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "bureau" "CreditBureau" NOT NULL,
    "pull_type" TEXT NOT NULL,
    "credit_score" INTEGER,
    "score_model" TEXT,
    "total_accounts" INTEGER,
    "open_accounts" INTEGER,
    "total_balance" DECIMAL(12,2),
    "total_monthly_payments" DECIMAL(12,2),
    "delinquent_accounts" INTEGER,
    "collections_count" INTEGER,
    "collections_total" DECIMAL(12,2),
    "public_records_count" INTEGER,
    "inquiries_count_12m" INTEGER,
    "oldest_account_months" INTEGER,
    "eviction_records" JSONB NOT NULL DEFAULT '[]',
    "eviction_count" INTEGER NOT NULL DEFAULT 0,
    "criminal_records" JSONB NOT NULL DEFAULT '[]',
    "criminal_count" INTEGER NOT NULL DEFAULT 0,
    "bankruptcy_records" JSONB NOT NULL DEFAULT '[]',
    "has_active_bankruptcy" BOOLEAN NOT NULL DEFAULT false,
    "raw_report_encrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "pulled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_reports_applicant_id_idx" ON "credit_reports"("applicant_id");

-- ── ScreeningDocument ────────────────────────────────────────

CREATE TABLE "screening_documents" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "document_type" "ScreeningDocType",
    "analysis_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_documents_applicant_id_idx" ON "screening_documents"("applicant_id");

-- ── DocumentAnalysis ─────────────────────────────────────────

CREATE TABLE "document_analyses" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "metadata_flags" JSONB NOT NULL DEFAULT '{}',
    "metadata_risk_level" TEXT,
    "extracted_data" JSONB NOT NULL DEFAULT '{}',
    "extraction_confidence" DECIMAL(5,2),
    "cross_verification" JSONB NOT NULL DEFAULT '{}',
    "income_matches_plaid" BOOLEAN,
    "employer_matches_plaid" BOOLEAN,
    "balance_matches_plaid" BOOLEAN,
    "discrepancies" JSONB NOT NULL DEFAULT '[]',
    "fraud_score" DECIMAL(5,2),
    "fraud_flags" JSONB NOT NULL DEFAULT '[]',
    "fraud_assessment" "FraudAssessment",
    "ai_analysis_summary" TEXT,
    "ai_model_used" TEXT,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_analyses_document_id_key" ON "document_analyses"("document_id");
CREATE INDEX "document_analyses_applicant_id_idx" ON "document_analyses"("applicant_id");
CREATE INDEX "document_analyses_fraud_assessment_idx" ON "document_analyses"("fraud_assessment");

-- ── FinancialWellnessProfile ─────────────────────────────────

CREATE TABLE "financial_wellness_profiles" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "avg_monthly_income" DECIMAL(12,2),
    "income_sources" JSONB NOT NULL DEFAULT '[]',
    "income_stability_score" DECIMAL(5,2),
    "income_trend" TEXT,
    "avg_monthly_expenses" DECIMAL(12,2),
    "recurring_obligations" JSONB NOT NULL DEFAULT '[]',
    "estimated_monthly_debt" DECIMAL(12,2),
    "income_to_rent_ratio" DECIMAL(5,2),
    "debt_to_income_ratio" DECIMAL(5,2),
    "disposable_income" DECIMAL(12,2),
    "avg_balance_30d" DECIMAL(12,2),
    "avg_balance_60d" DECIMAL(12,2),
    "avg_balance_90d" DECIMAL(12,2),
    "lowest_balance_90d" DECIMAL(12,2),
    "rent_payments_found" INTEGER NOT NULL DEFAULT 0,
    "rent_payments_on_time" INTEGER NOT NULL DEFAULT 0,
    "rent_payment_consistency" TEXT,
    "nsf_count_90d" INTEGER NOT NULL DEFAULT 0,
    "overdraft_count_90d" INTEGER NOT NULL DEFAULT 0,
    "late_fee_count_90d" INTEGER NOT NULL DEFAULT 0,
    "gambling_transaction_count" INTEGER NOT NULL DEFAULT 0,
    "suspicious_activity_flags" JSONB NOT NULL DEFAULT '[]',
    "financial_health_score" DECIMAL(5,2),
    "health_tier" TEXT,
    "analysis_period_start" DATE,
    "analysis_period_end" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_wellness_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_wellness_profiles_application_id_key" ON "financial_wellness_profiles"("application_id");
CREATE INDEX "financial_wellness_profiles_applicant_id_idx" ON "financial_wellness_profiles"("applicant_id");

-- ── ScreeningPayment ─────────────────────────────────────────

CREATE TABLE "screening_payments" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "applicant_id" TEXT,
    "organization_id" TEXT,
    "payer_type" TEXT NOT NULL,
    "payment_type" TEXT NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "stripe_checkout_session_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "screening_payments_stripe_payment_intent_id_key" ON "screening_payments"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "screening_payments_stripe_checkout_session_id_key" ON "screening_payments"("stripe_checkout_session_id");
CREATE INDEX "screening_payments_application_id_idx" ON "screening_payments"("application_id");
CREATE INDEX "screening_payments_stripe_payment_intent_id_idx" ON "screening_payments"("stripe_payment_intent_id");

-- ── ScreeningEvent ───────────────────────────────────────────

CREATE TABLE "screening_events" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "applicant_id" TEXT,
    "agent_user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_events_application_id_idx" ON "screening_events"("application_id");
CREATE INDEX "screening_events_applicant_id_idx" ON "screening_events"("applicant_id");
CREATE INDEX "screening_events_event_type_idx" ON "screening_events"("event_type");
CREATE INDEX "screening_events_created_at_idx" ON "screening_events"("created_at");

-- ── Foreign Keys ─────────────────────────────────────────────

-- ScreeningApplication
ALTER TABLE "screening_applications" ADD CONSTRAINT "screening_applications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_applications" ADD CONSTRAINT "screening_applications_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screening_applications" ADD CONSTRAINT "screening_applications_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ScreeningApplicant
ALTER TABLE "screening_applicants" ADD CONSTRAINT "screening_applicants_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "screening_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ScreeningSignature
ALTER TABLE "screening_signatures" ADD CONSTRAINT "screening_signatures_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlaidConnection
ALTER TABLE "plaid_connections" ADD CONSTRAINT "plaid_connections_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FinancialTransaction
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_plaid_connection_id_fkey" FOREIGN KEY ("plaid_connection_id") REFERENCES "plaid_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreditReport
ALTER TABLE "credit_reports" ADD CONSTRAINT "credit_reports_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ScreeningDocument
ALTER TABLE "screening_documents" ADD CONSTRAINT "screening_documents_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DocumentAnalysis
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "screening_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FinancialWellnessProfile
ALTER TABLE "financial_wellness_profiles" ADD CONSTRAINT "financial_wellness_profiles_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "screening_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ScreeningPayment
ALTER TABLE "screening_payments" ADD CONSTRAINT "screening_payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "screening_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_payments" ADD CONSTRAINT "screening_payments_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "screening_payments" ADD CONSTRAINT "screening_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ScreeningEvent
ALTER TABLE "screening_events" ADD CONSTRAINT "screening_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "screening_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_events" ADD CONSTRAINT "screening_events_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "screening_events" ADD CONSTRAINT "screening_events_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
