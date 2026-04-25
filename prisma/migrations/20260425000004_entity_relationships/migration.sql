-- Phase 1, Migration 04: entity aliases + resolution edges
-- The graph that resolves LLC → principal, related-LLCs, spousal links, sponsor lineage.

CREATE TABLE condo_ownership.entity_aliases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id         UUID NOT NULL REFERENCES condo_ownership.entities(id) ON DELETE CASCADE,
    alias             TEXT NOT NULL,
    alias_normalized  TEXT NOT NULL,
    source            TEXT NOT NULL,             -- 'acris_grantee', 'ny_dos', 'hpd_mdr', 'icij', etc.
    UNIQUE (entity_id, alias_normalized)
);

CREATE INDEX idx_entity_aliases_normalized ON condo_ownership.entity_aliases (alias_normalized);

CREATE TABLE condo_ownership.entity_resolution_edges (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity     UUID NOT NULL REFERENCES condo_ownership.entities(id),
    target_entity     UUID NOT NULL REFERENCES condo_ownership.entities(id),
    edge_type         TEXT NOT NULL,             -- 'principal_of', 'spouse_of', 'agent_of', 'sponsor_of',
                                                 -- 'beneficiary_of', 'shared_address', 'related_llc'
    confidence        NUMERIC NOT NULL,          -- 0.0 to 1.0
    signal_source     TEXT NOT NULL,             -- which Play / data source produced this edge
    evidence          JSONB,                     -- supporting data (matched fields, doc IDs, etc.)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_entity, target_entity, edge_type, signal_source)
);

CREATE INDEX idx_edges_source ON condo_ownership.entity_resolution_edges (source_entity, edge_type);
CREATE INDEX idx_edges_target ON condo_ownership.entity_resolution_edges (target_entity, edge_type);
