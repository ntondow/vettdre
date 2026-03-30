-- Add Document Templates table + link OnboardingDocument to templates

-- ============================================================
-- Create Table
-- ============================================================

CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "template_pdf_url" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX "document_templates_org_id_idx" ON "document_templates"("org_id");
CREATE INDEX "document_templates_org_id_category_idx" ON "document_templates"("org_id", "category");

-- ============================================================
-- Foreign Keys
-- ============================================================

ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Add template_id to onboarding_documents
-- ============================================================

ALTER TABLE "onboarding_documents" ADD COLUMN "template_id" TEXT;
CREATE INDEX "onboarding_documents_template_id_idx" ON "onboarding_documents"("template_id");
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
