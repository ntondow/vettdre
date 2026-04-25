-- Identity Verification model for IDV (Didit + Stripe Identity)

CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_session_id" TEXT NOT NULL,
    "provider_workflow_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "document_type" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "nationality" TEXT,
    "issuing_country" TEXT,
    "liveness_score" DOUBLE PRECISION,
    "face_match_score" DOUBLE PRECISION,
    "document_quality" DOUBLE PRECISION,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "raw_response_encrypted" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_verifications_provider_session_id_key" ON "identity_verifications"("provider_session_id");
CREATE INDEX "identity_verifications_applicant_id_idx" ON "identity_verifications"("applicant_id");
CREATE INDEX "identity_verifications_application_id_idx" ON "identity_verifications"("application_id");
CREATE INDEX "identity_verifications_provider_session_id_idx" ON "identity_verifications"("provider_session_id");
CREATE INDEX "identity_verifications_status_idx" ON "identity_verifications"("status");

-- Foreign keys
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "screening_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "screening_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
