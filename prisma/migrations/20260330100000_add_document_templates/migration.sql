-- Add Document Templates table and update OnboardingDocument
-- Supports custom document vault with fillable field definitions

-- ============================================================
-- 1. Create document_templates table
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

-- Indexes
CREATE INDEX "document_templates_org_id_idx" ON "document_templates"("org_id");
CREATE INDEX "document_templates_org_id_category_idx" ON "document_templates"("org_id", "category");

-- Foreign key
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 2. Update onboarding_documents: add template_id column
-- ============================================================
ALTER TABLE "onboarding_documents" ADD COLUMN "template_id" TEXT;

-- Foreign key to document_templates
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 3. Update onboarding_documents: change doc_type from enum to text
-- ============================================================
ALTER TABLE "onboarding_documents" ALTER COLUMN "doc_type" TYPE TEXT USING "doc_type"::TEXT;
ALTER TABLE "onboarding_documents" ALTER COLUMN "doc_type" SET DEFAULT 'custom';
