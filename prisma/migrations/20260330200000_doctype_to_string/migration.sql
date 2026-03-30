-- Change OnboardingDocument.doc_type from enum to TEXT to support custom document types

ALTER TABLE "onboarding_documents" ALTER COLUMN "doc_type" TYPE TEXT USING "doc_type"::TEXT;
ALTER TABLE "onboarding_documents" ALTER COLUMN "doc_type" SET DEFAULT 'custom';
