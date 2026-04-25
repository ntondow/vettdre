-- Phase 5: Add bank identification fields to entities + mortgage chain fields

-- Bank identification on entities (for lender canonicalization)
ALTER TABLE condo_ownership.entities
    ADD COLUMN IF NOT EXISTS is_bank BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS bank_ffiec_id TEXT;

CREATE INDEX IF NOT EXISTS idx_entities_is_bank ON condo_ownership.entities (is_bank) WHERE is_bank = TRUE;

-- Mortgage chain tracking: link assignments/satisfactions to the original mortgage
ALTER TABLE condo_ownership.mortgages
    ADD COLUMN IF NOT EXISTS original_doc_id TEXT,
    ADD COLUMN IF NOT EXISTS current_assignee_entity UUID REFERENCES condo_ownership.entities(id);

CREATE INDEX IF NOT EXISTS idx_mortgages_original ON condo_ownership.mortgages (original_doc_id) WHERE original_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mortgages_status ON condo_ownership.mortgages (status);
