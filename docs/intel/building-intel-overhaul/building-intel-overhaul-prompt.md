# VettdRE Building Intelligence Overhaul — Comprehensive Build Prompt Suite

**For Claude Code, running in the VettdRE monorepo at `/Users/nathantondow/Documents/vettdre/`.**

This is not a single prompt. It is a 10-phase build delivered as 10 self-contained chunks. Run them sequentially. Each phase ends with a hard checkpoint where you stop, summarize, and wait for Nathan's go/no-go before moving on. Do not chain phases without approval.

---

## How to use this document

1. **Read the orientation, constraints, and conventions sections below** before you start any phase. They apply across every phase.
2. **For each phase, paste only that phase's prompt** into a fresh Claude Code session — or run it as the next command in a continuing session, with its full text in view. Each phase is self-contained.
3. **Stop at every "Checkpoint" gate.** Don't continue without explicit approval.
4. **Commit per phase**, not per task. Use conventional-commit format (`feat(building-intel): phase N — <name>`). Include the phase number in every commit message in this build.
5. **If a phase produces > 1,200 lines of diff**, split into smaller commits within that phase but keep the phase boundary at the checkpoint.

---

## Reference materials Claude Code must read first

Before Phase 0, read these files in this order. They are the source of truth.

1. `CLAUDE.md` (at repo root) — VettdRE codebase architecture, stack, and conventions.
2. `docs/intel/building-intel-overhaul/condo-ownership-v1-spec.md` — original v1 spec (now superseded by this document; read for historical context, not as authority).
3. `docs/intel/building-intel-overhaul/condo-ownership-deep-dive.md` — architecture deep dive.
4. `docs/intel/building-intel-overhaul/condo-ownership-data-sources-deep-dive-2.md` — exhaustive free-data sources + 10 cross-reference plays with confidence-scoring logic.
5. `docs/intel/building-intel-overhaul/building-intel-deep-dive-3.md` — building-level intelligence: ACRIS mortgage parsing logic, tax liens, lis pendens via ACRIS doc-types, FFIEC Call Reports for lender stress, operator network clustering via HPD MDR, sponsor lineage, plus 3 building-level cross-reference plays (Plays 11-13).

Also read in the codebase before Phase 1:

- `prisma/schema.prisma` — the existing 72-model schema.
- `src/lib/data-fusion-engine.ts` and `src/lib/data-fusion-types.ts` — the existing building intelligence orchestrator.
- `src/lib/entity-resolver.ts` — the existing entity resolution engine (Levenshtein + Jaro-Winkler + containment).
- `src/lib/ny-corporations.ts` — the existing NY DOS integration.
- `src/lib/terminal-datasets.ts`, `src/lib/terminal-ingestion.ts`, `src/lib/terminal-enrichment.ts` — the Terminal pipeline pattern that all new ingest jobs will follow.
- `src/lib/cache-manager.ts` and `src/lib/cache-warming.ts` — caching patterns.
- `src/lib/nyc-opendata.ts` — Socrata client pattern.
- `src/app/(dashboard)/market-intel/building-profile-actions.ts` and `building-profile.tsx` — what the existing BuildingProfile shows today.

---

## Non-negotiable constraints (apply across all phases)

These are corrections from prior research. Apply them throughout the build. Do not ignore or revert any of these.

1. **Use `eguu-7ie3` (Digital Tax Map: Condominium Units) as the primary unit-BBL spine.** Not the DOF Property Assessment Roll. Query by `condo_base_boro` + `condo_base_block` to enumerate every unit BBL in a building, with `unit_designation` as apartment number. The Assessment Roll (`8y4t-faws` / `w7rz-68fs`) is a verification cross-reference, not the primary source.

2. **Use NYC Planning Labs GeoSearch (`https://geosearch.planninglabs.nyc/v2/search`) as the primary address → BBL resolver.** No API key required. Returns BBL deterministically. Existing Geocodio integration becomes a fallback for non-NYC addresses only.

3. **Verify the rolling sales dataset ID.** The codebase currently uses `uzf5-f8n2`. Manus AI's analysis points to `usep-8jbt` as the current/preferred dataset. In Phase 0, query both and confirm which is live and current. Update `data-fusion-engine.ts` if `uzf5-f8n2` is stale.

4. **Do not use `fitnr/acris-download`.** That repo's last push was January 2022. Backfill via direct Socrata chunked calls, chunked by `recorded_borough × document_date` monthly windows.

5. **Fix the `acris_parties` PK.** The original spec's PK `(document_id, party_type, name)` collides when the same name appears twice on a document. Use a synthetic `party_sequence` column from Socrata row order. PK as `(document_id, party_type, party_sequence)`. Index `name` separately for search.

6. **Build the deed-type whitelist dynamically from `7isb-wh4c` (ACRIS Document Control Codes).** Filter to deed-category codes. Commit as a typed TS constant with a source-version-date comment. Re-audit quarterly.

7. **Include RPTT/RETT in the doc-type whitelist.** Co-op share transfers must file an NYC RPTT return, and those filings are publicly accessible through ACRIS as separate doc types (RPTT, RPT, RETT, "Cooperative Transfer Summary"). These are the unlock for co-op ownership data — public, free, capturing cash buyers (which UCC-1 alone misses).

8. **No paid data sources.** No PropertyShark, ATTOM, BatchData, RocketReach, Regrid, CoreLogic, First American, LexisNexis, voter rolls (NY Election Law § 3-103(5)), DMV records (DPPA), or FinCEN BOI. Skip-tracing is a future integration point — design schema slots for it but do not implement.

9. **Voter rolls are off-limits.** NY Election Law § 3-103(5) prohibits commercial use; misdemeanor. Do not ingest, do not match against, do not consider.

10. **Building-level data goes through the Terminal `DatasetConfig` pattern.** Do not invent a new ingest pattern. Each new Socrata source registers a `DatasetConfig` with `bblExtractor`, `eventTypeMapper` (or null for non-event datasets), `recordIdExtractor`, and an `IngestionState` row tracking the polling cursor.

   **Phase 0 amendment:** Generalize the `DatasetConfig` interface in `src/lib/terminal-datasets.ts` with a `kind: "event" | "snapshot" | "join-driven"` discriminator. ACRIS already needs a special path (`pollAcris`); HPD MDR snapshots, RPTT, tax liens, and other non-event datasets need a `pollSpineDataset` sibling that writes to `BuildingCache` or new spine tables instead of `TerminalEvent`. Keep the cron URLs (`/api/terminal/ingest`, `/enrich`, `/generate-briefs`, `/backfill`) stable — do NOT spawn a parallel `/api/intel/ingest`. Reuses existing cron infra, IngestionState tracking, admin health UI, and backfill harness.

11. **Extend, don't duplicate.** No parallel `CondoOwnership` engine. The condo lens and co-op lens are *narrower views* on the upgraded `data-fusion-engine`. New ownership data goes into `BuildingIntelligence.ownership` substructures.

12. **UI disclosure language matters.** For results, use: *"Current owner per ACRIS as of [last_refresh_timestamp]. ACRIS recording-to-publication lag is typically 3-5 days. Entity-owned units reflect the recorded entity, not beneficial ownership. Not a title search."* For condop / co-op buildings, the UI must explicitly state when individual apartment shareholders are not surfaced (per CLAUDE.md handling of structure detection).

13. **Coverage QA uses the free ACRIS DocumentSearch web UI** at `a836-acris.nyc.gov`, not PropertyShark. Their ToS prohibits scraping.

14. **Live-site integrity is paramount.** This is an upgrade to a production system that real users depend on, not a greenfield build. Every phase ships with: (a) a feature flag around the new behavior so it can be disabled without code revert (use the existing `feature-gate.ts` / `feature-gate-server.ts` infrastructure); (b) a smoke-test pass against the existing production-equivalent surfaces (`/dashboard`, `/market-intel`, `/terminal`, `/contacts`, `/messages`, `/calendar`, `/deals`, `/screening`, `/portfolios`, `/prospecting`, `/properties`, **plus mobile API routes `/api/mobile/buildings` and `/api/mobile/scout`**) confirming no regression and no broken renders; (c) backward-compatible API contracts — any existing field on `BuildingIntelligence` or any existing `/api/*` route stays intact. If a phase introduces a breaking change to an existing API, removes a field from an existing response, modifies an existing table column, or alters an existing UI component's props, **STOP and confirm with Nathan before proceeding**. Schema migrations are additive only; existing tables get new nullable columns and new FK references, never destructive changes.

   **Note (Phase 0 finding):** `BuildingIntelligence` (in `src/lib/data-fusion-types.ts`) is a 22-substructure type, ~300 lines. New ownership/debt/operator/distress data must be added as **new optional substructures**, never appended to existing ones. Bulky raw payloads (mortgages, deed history, lis pendens substitute) go to dedicated tables, not into the existing `raw` JSON blob — the blob is already 100-200 KB per active building and headed for Postgres column limits if extended further.

15. **Every new database write is gated through the canonical Building spine.** Even when the original source is per-table (HPD MDR, ACRIS mortgages, tax liens), the row resolves to a `building_id` (or `unit_id`) on insert. Orphaned rows that can't resolve to a Building get logged to `condo_ownership.unresolved_records` for manual review, never silently dropped.

---

## Critical conventions (already in the VettdRE codebase — match them exactly)

- All server action files use `"use server"`. All exports must be `async`.
- Multi-tenant scoping: every relevant table has `orgId`. Every query filters by `orgId`. No exceptions for shared lookups — everything is tenant-isolated.
- Serialize Server → Client component data with `JSON.parse(JSON.stringify(obj))`.
- Use `Array.isArray()` checks before spreading API response arrays (per CLAUDE.md).
- BBL is a 10-character string: `{boro}{block:5}{lot:4}`. Borough codes: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island.
- BIN is a 7-digit building identifier (different from BBL — BBL is a tax lot, BIN is a physical structure).
- Cron endpoints use `Bearer ${CRON_SECRET}` auth header.
- Feature gating via `hasPermission(feature, plan)` in `feature-gate.ts` / `feature-gate-server.ts`.
- Building intelligence dark theme is *scoped* to Terminal only. Do not let it leak into Market Intel or new modules unless explicitly directed.
- Use `circleMarker` (not `Marker`) for Leaflet performance.
- Modal pattern: `bg-black/30` backdrop + `modal-in` animation + `entered` state for fade.

---

# PHASE 0 — Discovery + Architecture Confirmation

**Goal:** Confirm the codebase is in the state the build prompt assumes. Surface any gaps or inaccuracies. Produce an amended plan for Nathan to approve before any code is written.

**Coming in:** A clean working tree on the VettdRE main branch. Nothing built yet.

## Tasks

1. **Read all reference materials listed above.** All four `.md` files plus the listed codebase files. Take notes; you'll reference them in every subsequent phase.

2. **Verify the dataset corrections.** For each:
   - Hit `https://data.cityofnewyork.us/resource/eguu-7ie3.json?$limit=5` — confirm `eguu-7ie3` is live, returns condo unit rows with `condo_base_boro`, `condo_base_block`, `unit_designation`, and unit BBL fields.
   - Hit `https://data.cityofnewyork.us/resource/usep-8jbt.json?$limit=5` and `https://data.cityofnewyork.us/resource/uzf5-f8n2.json?$limit=5`. Compare: which is current? Which has more recent `sale_date`? Which has more rows? Document the call.
   - Hit `https://geosearch.planninglabs.nyc/v2/search?text=15+Central+Park+West&size=1` — confirm response shape includes `properties.addendum.pad.bbl`.
   - Use `8y4t-faws` (current — covers tax years 2023-2027). **Phase 0 verified `w7rz-68fs` is stale (last data 2018/19). Do not use it.**

2a. **Verify the Deep Dive #3 datasets and access paths:**
   - Hit `https://data.cityofnewyork.us/resource/8h5j-fqxa.json?doc_type=LP&$limit=5` and same for `NOP`, `PREL`, `JPDN`. Confirm lis pendens are filed in ACRIS Legals under these doc types and document the actual codes returning data (the codes vary; confirm the live set).
   - Hit `https://data.cityofnewyork.us/resource/bnx9-e6tj.json?doc_type=MTGE&$limit=5` and same for `SAT`, `ASST`, `CEMA`, `SPM`. Confirm mortgage doc-types currently in use.
   - Visit `https://www.nyc.gov/site/finance/taxes/lien-sale-list.page` and document the current tax-lien-sale CSV publication URL pattern. If no clean CSV is available, flag for FOIL request as Phase 3 fallback.
   - Hit `https://www.ffiec.gov/npw/FinancialReport/CallReport` and confirm the FFIEC Call Reports public download path. Document the most recent quarterly release date.
   - Verify HPD Multiple Dwelling Registration (`tesw-yqqr`) and Contacts (`feu5-w2e2`) are live: `https://data.cityofnewyork.us/resource/tesw-yqqr.json?$limit=5`.
   - Verify NY DOS Active Corporations (`n9v6-gdp6` (Phase 0 corrected — original `n8mn-d6c5` is dead; `n9v6-gdp6` is the live ID already used in `src/lib/ny-corporations.ts`)) returns data: `https://data.ny.gov/resource/n8mn-d6c5.json?$limit=5`.
   - Verify Property Exemption Detail (`muvi-b6kx`) for Co-op/Condo Tax Abatement and 421-a/J-51 recipient mapping.

3. **Confirm or amend the codebase audit.** The audit claims:
   - `data-fusion-engine.ts` has a 14-source `DATASETS` constant — confirm or list actual sources.
   - HPD Multiple Dwelling Registration is referenced in schema but not actively queried — confirm.
   - There is no `Building` canonical table; ownership data is fragmented across `Portfolio`, `PortfolioBuilding`, `ProspectingItem`, `BuildingCache.raw`, `TerminalEvent.enrichment` — confirm by listing the models and their relationships.
   - `entity-resolver.ts` does Levenshtein + Jaro-Winkler + containment matching but does not parse beneficial owners from DOS filings — confirm.
   - `terminal-datasets.ts` defines `DatasetConfig` interface with `bblExtractor`, `eventTypeMapper`, `recordIdExtractor` — confirm and quote the exact interface.

4. **Document any divergences or surprises.** If you find code that contradicts the audit (e.g., a `Building` table that does exist; an HPD MDR ingest job that is wired up), flag it loudly. Also flag any feature that's been added since the audit was written (this build prompt was drafted in late April 2026).

5. **Identify the cleanest place for new ingest jobs.** Today, ingest jobs live as `/api/terminal/ingest`, `/api/terminal/enrich`, `/api/terminal/generate-briefs` Cloud Run-hit endpoints. Determine: should new ingests (RPTT, HPD MDR, Marriage Index, Dog Licensing, tax liens, lis pendens, ACRIS mortgages, FFIEC, etc.) extend `terminal-datasets.ts` and reuse those endpoints, or get their own `/api/intel/ingest` routes? Recommend one approach.

6. **Live-site smoke test baseline.** Before ANY code is written in subsequent phases, take a screenshot or written record of every existing surface that could be affected by this build: `/dashboard`, `/market-intel` (search, map view, building profile modal), `/terminal` (feed, event detail, building right-panel), `/contacts`, `/properties`, `/portfolios`, `/prospecting`. Save to `docs/intel/building-intel-overhaul/pre-build-baseline/` (annotated screenshots or HAR files). After every subsequent phase, regenerate and compare. Any unexpected diff = stop signal.

7. **Output a written discovery report** (~800-1,200 words) covering:
   - Confirmed dataset IDs (with the exact ones to use throughout) — including the Deep Dive #3 datasets
   - Confirmed audit findings + any divergences
   - Recommended ingest job placement
   - Any breaking changes you identified that the build prompt doesn't account for
   - The live-site baseline location and the surfaces that will need regression testing per phase
   - A risk register: things that could go wrong in later phases that we should plan for now, including specifically which existing site features could be impacted by the Building spine consolidation in Phase 1

## Verification gates

- All five dataset endpoints respond with sample data.
- The discovery report is committed to `docs/intel/building-intel-overhaul/phase-0-discovery.md`.
- No code outside `docs/` has changed.

## Checkpoint

Stop. Print the discovery report. Wait for Nathan's go/no-go before Phase 1.

## Coming next

Phase 1 is the schema spine. We introduce `Building`, `Unit`, `Entity`, `EntityRelationship`, `Mortgage`, `TransferTax` as canonical tables and migrate the existing fragmented models to reference them. No new ingest yet.

---

# PHASE 1 — Schema Spine

**Goal:** Introduce canonical `Building`, `Unit`, `Entity`, `EntityRelationship`, `Mortgage`, `TransferTax`, `IngestionState` (extended), and `SyncMetrics` tables. Migrate fragmented existing data to reference the new spine without breaking existing features.

**Coming in:** Phase 0 discovery report approved.

## Tasks

1. **Design the `condo_ownership` Postgres schema** as a separate Postgres schema (not Supabase project) for namespace isolation. All new tables live under `condo_ownership.*` to keep them clearly grouped while remaining queryable from the rest of the app.

2. **Create migration: `01_building_spine.sql`.**

   ```sql
   create schema if not exists condo_ownership;
   
   -- Canonical Building spine
   create table condo_ownership.buildings (
     id              uuid primary key default gen_random_uuid(),
     org_id          text not null,                 -- multi-tenant scoping
     bbl             text not null,                 -- billing BBL (parent for condos, building BBL for non-condos)
     bin             text,                          -- DOB BIN
     borough         smallint not null,
     block           int not null,
     lot             int not null,
     address         text not null,
     normalized_address text not null,              -- via Geosupport / GeoSearch
     building_class  text,
     property_type   text,                          -- 'condo' | 'coop' | 'condop' | 'rental' | 'commercial' | 'mixed' | 'unknown'
     year_built      int,
     total_units     int,
     residential_units int,
     commercial_units int,
     gross_sqft      int,
     last_synced_at  timestamptz,
     created_at      timestamptz default now(),
     updated_at      timestamptz default now(),
     unique (org_id, bbl)
   );
   create index on condo_ownership.buildings (org_id, normalized_address);
   create index on condo_ownership.buildings (bin);
   create index on condo_ownership.buildings (org_id, property_type);
   ```

3. **Create migration: `02_units.sql`.** The unit model handles BOTH condo (BBL-keyed) and co-op (share-block-keyed) lenses. Use `ownership_subject` as the abstraction. Condo units populate `unit_bbl`; co-op share-blocks populate `share_block_id`.

   ```sql
   create table condo_ownership.units (
     id                uuid primary key default gen_random_uuid(),
     org_id            text not null,
     building_id       uuid not null references condo_ownership.buildings(id) on delete cascade,
     subject_type      text not null check (subject_type in ('condo_bbl', 'coop_share_block')),
     unit_bbl          text,                       -- populated for condo units
     share_block_id    text,                       -- populated for co-op share blocks (synthetic id)
     unit_number       text,                       -- apartment number from eguu-7ie3 unit_designation or RPTT filing
     bedrooms          int,                        -- v2 — populated by AG offering plans + DOB ALT-1 OCR
     bathrooms         numeric,
     sqft              int,
     last_refreshed    timestamptz,
     created_at        timestamptz default now(),
     unique (org_id, unit_bbl) where unit_bbl is not null,
     unique (org_id, building_id, share_block_id) where share_block_id is not null
   );
   create index on condo_ownership.units (building_id);
   create index on condo_ownership.units (org_id, unit_bbl);
   ```

4. **Create migration: `03_entities.sql`.** This is the canonical table for every owner ever seen — humans, LLCs, corps, trusts, nonprofits.

   ```sql
   create table condo_ownership.entities (
     id              uuid primary key default gen_random_uuid(),
     org_id          text not null,
     canonical_name  text not null,
     name_normalized text not null,                  -- via entity-resolver normalizeName()
     entity_type     text not null check (entity_type in ('individual', 'llc', 'corp', 'trust', 'nonprofit', 'partnership', 'estate', 'unknown')),
     dos_id          text,                           -- NY DOS ID if matched
     fl_doc_number   text,                           -- Florida Sunbiz if matched
     ein             text,                           -- IRS EIN for nonprofits
     icij_node_id    text,                           -- ICIJ Offshore Leaks ID if matched
     ofac_sdn_id     text,                           -- OFAC sanctions match ID
     primary_address text,
     mailing_addresses text[],                       -- all known mailing addresses across documents
     phone           text,
     email           text,
     metadata        jsonb,                          -- extensible: officers, members, dates, raw source data
     confidence      numeric not null default 0.5,
     sources         text[] not null default '{}',
     created_at      timestamptz default now(),
     updated_at      timestamptz default now()
   );
   create index on condo_ownership.entities (org_id, name_normalized);
   create index on condo_ownership.entities (org_id, entity_type);
   create index on condo_ownership.entities (dos_id);
   create index on condo_ownership.entities using gin (mailing_addresses);
   create index on condo_ownership.entities using gin (to_tsvector('simple', canonical_name));
   ```

5. **Create migration: `04_entity_relationships.sql`.** The graph that resolves LLC → principal, related-LLCs, spousal links, sponsor lineage.

   ```sql
   create table condo_ownership.entity_aliases (
     id              uuid primary key default gen_random_uuid(),
     entity_id       uuid not null references condo_ownership.entities(id) on delete cascade,
     alias           text not null,
     alias_normalized text not null,
     source          text not null,                  -- 'acris_grantee', 'ny_dos', 'hpd_mdr', 'icij', etc.
     unique (entity_id, alias_normalized)
   );
   create index on condo_ownership.entity_aliases (alias_normalized);
   
   create table condo_ownership.entity_resolution_edges (
     id              uuid primary key default gen_random_uuid(),
     source_entity   uuid not null references condo_ownership.entities(id),
     target_entity   uuid not null references condo_ownership.entities(id),
     edge_type       text not null,                  -- 'principal_of', 'spouse_of', 'agent_of', 'sponsor_of', 'beneficiary_of', 'shared_address', 'related_llc'
     confidence      numeric not null,               -- 0.0 to 1.0
     signal_source   text not null,                  -- which Play / data source produced this edge
     evidence        jsonb,                          -- supporting data (matched fields, doc IDs, etc.)
     created_at      timestamptz default now(),
     unique (source_entity, target_entity, edge_type, signal_source)
   );
   create index on condo_ownership.entity_resolution_edges (source_entity, edge_type);
   create index on condo_ownership.entity_resolution_edges (target_entity, edge_type);
   ```

6. **Create migration: `05_acris_mirror.sql`.** Mirrored ACRIS tables, with the corrections applied.

   ```sql
   create table condo_ownership.acris_master (
     document_id        text primary key,
     record_type        text,
     crfn               text,
     recorded_borough   smallint,
     doc_type           text,
     document_date      date,
     document_amount    numeric,
     recorded_datetime  timestamptz,
     modified_date      timestamptz,
     good_through_date  date,
     raw                jsonb
   );
   create index on condo_ownership.acris_master (doc_type, document_date desc);
   create index on condo_ownership.acris_master (modified_date);
   
   create table condo_ownership.acris_legals (
     id                 uuid primary key default gen_random_uuid(),
     document_id        text not null,
     record_type        text,
     borough            smallint,
     block              int,
     lot                int,
     bbl                text generated always as (
       lpad(borough::text,1,'0') || lpad(block::text,5,'0') || lpad(lot::text,4,'0')
     ) stored,
     easement           text,
     partial_lot        text,
     air_rights         text,
     subterranean_rights text,
     property_type      text,
     street_number      text,
     street_name        text,
     unit               text,
     unique (document_id, borough, block, lot, coalesce(unit, ''))
   );
   create index on condo_ownership.acris_legals (bbl);
   create index on condo_ownership.acris_legals (document_id);
   
   create table condo_ownership.acris_parties (
     id                 uuid primary key default gen_random_uuid(),
     document_id        text not null,
     party_sequence     int not null,                -- synthetic from Socrata row order; corrects the original spec's PK collision
     party_type         smallint,                    -- 1 = grantor, 2 = grantee
     name               text,
     address_1          text,
     address_2          text,
     country            text,
     city               text,
     state              text,
     zip                text,
     entity_id          uuid references condo_ownership.entities(id),
     unique (document_id, party_type, party_sequence)
   );
   create index on condo_ownership.acris_parties (document_id);
   create index on condo_ownership.acris_parties (entity_id);
   create index on condo_ownership.acris_parties using gin (to_tsvector('simple', name));
   ```

7. **Create migration: `06_unit_ownership.sql`.** The denormalized lookup table — what the read endpoint hits.

   ```sql
   create table condo_ownership.unit_ownership_current (
     id                    uuid primary key default gen_random_uuid(),
     org_id                text not null,
     unit_id               uuid not null references condo_ownership.units(id) on delete cascade,
     building_id           uuid not null references condo_ownership.buildings(id),
     current_owner_entity  uuid references condo_ownership.entities(id),
     current_owner_name    text,                     -- denormalized for fast search
     current_owner_type    text,                     -- 'individual' | 'llc' | 'trust' | 'corp' | 'nonprofit' | 'unknown'
     last_deed_doc_id      text,
     last_sale_date        date,
     last_sale_price       numeric,
     grantor_entity        uuid references condo_ownership.entities(id),
     grantor_name          text,
     owner_mailing_address text,
     mailing_differs_from_unit boolean,              -- "out-of-building investor" badge signal
     deed_count            int default 0,
     primary_residence_flag boolean,                 -- from co-op/condo tax abatement
     star_enrolled         boolean,                  -- from STAR enrollment
     last_refreshed        timestamptz default now(),
     unique (org_id, unit_id)
   );
   create index on condo_ownership.unit_ownership_current (org_id, building_id);
   create index on condo_ownership.unit_ownership_current using gin (to_tsvector('simple', current_owner_name));
   create index on condo_ownership.unit_ownership_current (current_owner_entity);
   create index on condo_ownership.unit_ownership_current (last_sale_date desc);
   ```

8. **Create migration: `07_debt_structure.sql`.** Debt + lien data.

   ```sql
   create table condo_ownership.mortgages (
     id                 uuid primary key default gen_random_uuid(),
     org_id             text not null,
     building_id        uuid references condo_ownership.buildings(id),
     unit_id            uuid references condo_ownership.units(id),
     document_id        text,
     borrower_entity    uuid references condo_ownership.entities(id),
     lender_entity      uuid references condo_ownership.entities(id),
     amount             numeric,
     recorded_date      date,
     maturity_date      date,                          -- parsed from doc when available; null otherwise
     status             text,                          -- 'active', 'satisfied', 'assigned', 'unknown'
     mortgage_type      text,                          -- 'first', 'second', 'cema', 'consolidated', etc.
     raw                jsonb,
     created_at         timestamptz default now()
   );
   create index on condo_ownership.mortgages (building_id);
   create index on condo_ownership.mortgages (lender_entity);
   create index on condo_ownership.mortgages (maturity_date) where maturity_date is not null and status = 'active';
   
   create table condo_ownership.tax_liens (
     id                 uuid primary key default gen_random_uuid(),
     org_id             text not null,
     building_id        uuid not null references condo_ownership.buildings(id),
     lien_type          text,                          -- 'tax', 'water', 'emergency_repair', etc.
     amount             numeric,
     filed_date         date,
     status             text,                          -- 'active', 'satisfied', 'sold'
     sale_year          int,
     raw                jsonb
   );
   create index on condo_ownership.tax_liens (building_id, status);
   ```

9. **Create migration: `08_ingestion_metadata.sql`.** Extends Terminal's `IngestionState` pattern with sync metrics for lag instrumentation.

   ```sql
   create table condo_ownership.sync_metrics (
     id                  uuid primary key default gen_random_uuid(),
     dataset_id          text not null,
     run_started_at      timestamptz not null,
     run_completed_at    timestamptz,
     rows_fetched        int,
     rows_upserted       int,
     rows_failed         int,
     lag_p50_days        numeric,                       -- recording-date to fetch-date P50
     lag_p95_days        numeric,
     errors              jsonb,
     created_at          timestamptz default now()
   );
   create index on condo_ownership.sync_metrics (dataset_id, run_started_at desc);
   ```

9a. **Create migration: `09_distress_and_signals.sql`** (per Deep Dive #3).

   ```sql
   -- Lis pendens (notice of pendency) parsed from ACRIS Legals
   create table condo_ownership.lis_pendens (
     id                 uuid primary key default gen_random_uuid(),
     org_id             text not null,
     building_id        uuid not null references condo_ownership.buildings(id),
     unit_id            uuid references condo_ownership.units(id),
     document_id        text not null,
     doc_type           text not null,                  -- 'LP', 'NOP', 'PREL', 'JPDN' per Phase 0 verification
     filed_date         date not null,
     claimed_amount     numeric,
     plaintiff_name     text,
     defendant_name     text,
     status             text not null default 'active', -- 'active' | 'discharged'
     discharge_date     date,
     freshness          text,                           -- 'fresh' (<3mo) | 'aged' (3-12mo) | 'discharged' — denormalized at write
     raw                jsonb,
     created_at         timestamptz default now()
   );
   create index on condo_ownership.lis_pendens (building_id, status);
   create index on condo_ownership.lis_pendens (filed_date desc);
   create index on condo_ownership.lis_pendens (org_id, freshness) where status = 'active';
   
   -- FFIEC Call Report bank stress metrics (per Deep Dive #3 Phase 3 ingest)
   create table condo_ownership.lender_stress_metrics (
     id                       uuid primary key default gen_random_uuid(),
     ffiec_id                 text not null,
     fdic_cert_number         text,
     bank_name_canonical      text not null,
     quarter_end_date         date not null,
     total_assets             numeric,
     real_estate_loans_pct    numeric,                  -- % of assets in real estate loans
     loan_loss_reserves_pct   numeric,                  -- % of loans in reserves
     tier_1_capital_ratio     numeric,
     camels_score             text,
     stress_flag              boolean not null default false,
     stress_reason            text[],                   -- list of triggered conditions
     raw                      jsonb,
     created_at               timestamptz default now(),
     unique (ffiec_id, quarter_end_date)
   );
   create index on condo_ownership.lender_stress_metrics (bank_name_canonical, quarter_end_date desc);
   create index on condo_ownership.lender_stress_metrics (stress_flag) where stress_flag = true;
   
   -- Per-building computed signals (Plays 11, 13 outputs; extensible)
   create table condo_ownership.building_signals (
     id                 uuid primary key default gen_random_uuid(),
     org_id             text not null,
     building_id        uuid not null references condo_ownership.buildings(id) on delete cascade,
     signal_type        text not null,                  -- 'forced_sale_candidate' | 'lender_stress_exposure' | 'operator_cluster_distress' | etc.
     score              numeric not null,               -- 0-100
     confidence         text not null,                  -- 'high' | 'medium' | 'low'
     evidence           jsonb,                          -- contributing factors
     computed_at        timestamptz not null default now(),
     unique (org_id, building_id, signal_type, computed_at)
   );
   create index on condo_ownership.building_signals (org_id, signal_type, score desc);
   create index on condo_ownership.building_signals (building_id, signal_type, computed_at desc);
   
   -- Unresolved-records dump for orphaned ingest rows (per non-negotiable #15)
   create table condo_ownership.unresolved_records (
     id              uuid primary key default gen_random_uuid(),
     source_table    text not null,
     source_record_id text not null,
     reason          text not null,                     -- 'no_bbl_match' | 'no_address_match' | 'invalid_payload' | etc.
     raw             jsonb not null,
     created_at      timestamptz default now()
   );
   create index on condo_ownership.unresolved_records (source_table, created_at desc);
   ```

10. **Add a `unit_transaction_history` view** matching the original spec, but join to canonical `units` and `entities` rather than raw legals/parties.

11. **Migrate fragmented existing data.** Write a one-shot script that:
    - For every distinct BBL referenced in `Portfolio`, `PortfolioBuilding`, `ProspectingItem`, `BuildingCache`, `TerminalEvent` — upserts a row into `condo_ownership.buildings` (creating one if missing).
    - Updates those existing tables to add a nullable `building_id` foreign key referencing the new spine.
    - Does NOT delete data from the old tables. Coexistence period — old code keeps working, new code writes through the spine.

12. **Document the schema** in `docs/intel/building-intel-overhaul/schema.md` with an ER diagram (mermaid) and a per-table description.

## Verification gates

- All migrations apply cleanly to a fresh Supabase. Run them locally first.
- All migrations are idempotent (safe to re-run).
- No existing tests fail. Run `npm test` and `npx prisma generate`.
- `prisma db pull` against the migrated schema produces an updated `schema.prisma` with the new models, and the generated Prisma client compiles.
- The data migration script runs and reports row counts touched per existing table.

## What to leave alone

- Do not modify `Portfolio`, `PortfolioBuilding`, `ProspectingItem`, `BuildingCache`, `TerminalEvent` table structures beyond adding the nullable `building_id` FK. Keep them functional.
- Do not delete columns from existing tables. Migration is additive.
- Do not touch the Terminal pipeline code yet. Only add tables.

## Commit / output

- One commit per migration file (9 migrations: 01-08 + 09_distress_and_signals + 1 commit for the data migration script + 1 for docs = ~11 commits, all in one PR).
- Commit message format: `feat(building-intel): phase 1 — <table or step>`

## Coming next

Phase 2 wires up the core ACRIS ingest using the Terminal `DatasetConfig` pattern — Master, Legals, Parties, Codes, RPTT/RETT — plus the Building spine population from `eguu-7ie3` and GeoSearch. After Phase 2, `condo_ownership.buildings` and `condo_ownership.units` are populated for every NYC condo.

---

# PHASE 2 — Ingest Infrastructure + Core ACRIS Sources

**Goal:** Populate `buildings` and `units` for every NYC condo. Mirror ACRIS Master/Legals/Parties/Codes (with RPTT/RETT in the doc-type whitelist) into the `acris_*` tables. Backfill 2000-present deeds. Establish the ingest pattern that Phase 3 will repeat for auxiliary sources.

**Coming in:** Phase 1 schema migrated and verified.

## Tasks

1. **Extend `src/lib/terminal-datasets.ts` (or create a sibling module) with new `DatasetConfig` entries.** Follow the exact existing pattern. Each new source registers:

   ```typescript
   {
     id: 'acris_master',
     datasetId: 'bnx9-e6tj',
     timestampField: 'modified_date',
     formatSinceDate: (d) => d.toISOString(),
     bblExtractor: null,        // ACRIS Master has no BBL directly; joined via Legals
     eventTypeMapper: null,     // not an event source
     recordIdExtractor: (r) => r.document_id,
   }
   ```

   Add configs for: `acris_master`, `acris_legals`, `acris_parties`, `acris_codes`, `condo_units` (the `eguu-7ie3` spine), `dof_assessment` (`w7rz-68fs` or `8y4t-faws` per Phase 0 verification).

2. **Build `src/lib/condo-ingest/units.ts`** to populate `condo_ownership.buildings` + `condo_ownership.units` from `eguu-7ie3`:
   - Query Socrata in chunks by `condo_base_boro`. For each row, derive billing BBL (`condo_base_boro` + `condo_base_block` + lot=7501 typically — verify), derive unit BBL.
   - For each unique billing BBL, upsert a `buildings` row. Use NYC Planning Labs GeoSearch to resolve normalized address.
   - For each unit row, upsert a `units` row with `subject_type='condo_bbl'`, `unit_bbl`, `unit_number=unit_designation`.
   - Cross-reference `dof_assessment` (`w7rz-68fs`) to populate `building_class`, `total_units`, `gross_sqft`, etc.
   - Run weekly (Sunday 03:00 ET — matches the original spec's Job A schedule).

3. **Build `src/lib/condo-ingest/acris.ts`** for daily incremental ACRIS sync:
   - Phase 1: query `acris_master` where `modified_date > (last_run - 2 days)`. Buffer of 2 days for safety overlap.
   - Phase 2: for every changed `document_id`, refetch corresponding rows from Legals and Parties.
   - Phase 3: upsert into `acris_master`, `acris_legals`, `acris_parties` tables. Use `party_sequence` from Socrata row order.
   - Phase 4: for each BBL touched by the sync, recompute the corresponding `unit_ownership_current` row.
   - Log into `sync_metrics` with lag computation: `EXTRACT(DAY FROM (now() - max(recorded_datetime)))` for the last batch, P50 and P95 over rolling 7 days.
   - Run daily 04:00 ET (matches original spec's Job B).

4. **Build the deed-type whitelist dynamically.** In `src/lib/condo-ingest/deed-types.ts`:
   - One-time fetch of `7isb-wh4c` (ACRIS Document Control Codes).
   - Filter to deed-category codes. Confirmed inclusions: `DEED`, `DEED, LE`, `DEEDO`, `WDEED` (warranty deed if present), `BARGAIN AND SALE`, `QUITCLAIM`, `CONFIRMATORY`, `CORRECTION`, `EXECUTOR`, `REFEREE`, `RPTT`, `RETT`, `CTSUM` (Cooperative Transfer Summary). Validate against the live dataset.
   - Commit as `export const DEED_DOC_TYPES: readonly string[] = [...]` with a `// source-version-date: 2026-04-XX` comment.
   - Audit script: query 100 recent deed-category docs from ACRIS Master with `document_amount > $100k`. Log any doc_type appearances NOT in the whitelist. Commit the audit log to `docs/intel/building-intel-overhaul/deed-type-audit.md`.

4a. **Also build the mortgage doc-type whitelist and lis-pendens doc-type whitelist** in the same module:
   - `MORTGAGE_DOC_TYPES`: `MTGE` (mortgage), `MTG`, `MORT`, `SAT` (satisfaction), `ASST` / `ASSIGN` (assignment), `CEMA` (consolidation/extension/modification agreement), `SPM` (subordinated/purchase money), `MOD` (modification). Validate against live data per Phase 0 confirmation.
   - `LIS_PENDENS_DOC_TYPES`: `LP` (lis pendens), `NOP` (notice of pendency), `PREL` (preliminary), `JPDN` (judgment notice of pendency). Validate against live data per Phase 0 confirmation — the actual codes vary; commit only what you confirmed.
   - These whitelists feed Phase 3's tax-lien/lis-pendens ingest and Phase 5's ACRIS mortgage parsing. Commit each as a typed TS constant with the source-version-date.

5. **Build the ownership recomputation function** in `src/lib/condo-ingest/recompute.ts`:
   - For a given BBL, find all `acris_legals` rows with that BBL.
   - Join to `acris_master` filtered to the deed-type whitelist.
   - Order by `document_date DESC`. Take the most recent.
   - Find the grantee (`party_type=2`) in `acris_parties` for that doc — there may be multiple (couples); concatenate names.
   - Resolve grantee names to `entities` (insert new entities if not seen). Resolve grantor too.
   - Upsert `unit_ownership_current` for the corresponding `unit_id`.

6. **Build the historical backfill** in `src/scripts/condo-ingest/backfill.ts` (run-once, not on schedule):
   - Parameterize: `--since=YYYY-MM-DD --boroughs=1,2,3,4,5`.
   - Default: 2000-01-01 through today, all 5 boroughs.
   - Chunk by `recorded_borough × document_date month-window`. ~25 years × 12 months × 5 boroughs = 1,500 chunks. Sleep 250ms between requests to respect Socrata rate limits with app token.
   - Resumable via a `backfill_progress` table tracking chunks completed.
   - Estimated runtime: 6-10 hours on 4GB RAM Cloud Run Job. Verify on a sample (Manhattan 2020-2024) before running full.

7. **Wire to Cloud Run.** Three jobs:
   - `condo-units-refresh` — weekly Sunday 03:00 ET → calls `src/lib/condo-ingest/units.ts`.
   - `acris-incremental-sync` — daily 04:00 ET → calls `src/lib/condo-ingest/acris.ts`.
   - `acris-backfill` — manual trigger only → calls the backfill script.
   
   Match VettdRE's existing `/api/terminal/ingest` pattern. Use `Bearer ${CRON_SECRET}` auth. Document the `gcloud run jobs deploy` commands in `deploy/condo-ownership/README.md`. Document Cloud Scheduler cron expressions (in UTC; explicitly note ET → UTC conversion).

8. **GeoSearch integration.** Create `src/lib/condo-ingest/geosearch.ts`:
   - Wraps `https://geosearch.planninglabs.nyc/v2/search?text={address}&size=1`.
   - Returns `{ bbl, lat, lng, normalized_address, borough, neighborhood }`.
   - Implements LRU caching (in-memory) — addresses don't change.
   - Falls back to Geocodio for non-NYC addresses (preserves existing geocodio integration).

9. **Smoke test:**
   - Run `condo-units-refresh` against Manhattan only. Verify 15 Central Park West (BBL `1011577501`) returns ~201 unit rows in `condo_ownership.units`.
   - Run `acris-incremental-sync` for one day (yesterday). Verify rows land in `acris_master`, `acris_legals`, `acris_parties`.
   - Run `recompute.ts` for one BBL. Verify `unit_ownership_current` populates correctly.
   - Run a small backfill: Manhattan 2020-2024. Verify completion.

## Verification gates

- 15 Central Park West appears in `buildings` with the correct billing BBL, BIN, address.
- 201 (or expected count) rows for 15 CPW exist in `units`.
- A known recent condo sale (pick one from public press) appears correctly in `unit_ownership_current` after running incremental sync.
- `sync_metrics` has rows with non-null `lag_p50_days` and `lag_p95_days`.
- Backfill smoke test (Manhattan 2020-2024) completes without errors.
- All cron endpoints respond with 200 to `Bearer ${CRON_SECRET}` and 401 without.

## What to leave alone

- Do not modify `terminal-ingestion.ts` or any existing Terminal pipeline code beyond extending `terminal-datasets.ts` (and only if the cleanest place for the new configs).
- Do not run the full backfill yet. Smoke-test only. Full backfill happens after Phase 9.
- Do not touch `data-fusion-engine.ts`. That's Phase 5.

## Commit / output

- Commits per file, all in one PR.
- Final state: `condo_ownership.buildings`, `units`, `acris_master`, `acris_legals`, `acris_parties` populated for at least Manhattan condos. Backfill machinery proven on Manhattan 2020-2024.

## Checkpoint

Stop. Show row counts per table. Show a sample ownership lookup for 15 CPW unit 12B. Wait for Nathan's approval before Phase 3.

## Coming next

Phase 3 layers in the auxiliary free-data sources from Deep Dive #2: HPD MDR, Co-op/Condo Tax Abatement, Dog Licensing, Marriage Index, NYS Active Corporations bulk, ProPublica 990s, ICIJ Offshore Leaks, LL97/LL84/LL87 compliance.

---

# PHASE 3 — Auxiliary Free-Data Sources

**Goal:** Ingest the seven Tier 1 sources from Deep Dive #2 plus LL97/LL84/LL87 compliance. Each follows the same `DatasetConfig` pattern as Phase 2. After this phase, the entity graph has rich raw material; Phase 4 extracts beneficial-owner relationships from it.

**Coming in:** Phase 2 ACRIS ingest working; Manhattan condos populated.

## Tasks

1. **HPD Multiple Dwelling Registration** (Socrata `tesw-yqqr` registrations + `feu5-w2e2` contacts):
   - `DatasetConfig` registered for both. Daily incremental sync.
   - Upsert into a new `condo_ownership.hpd_registrations` table with: `registration_id`, `building_id` (FK), `registered_owner_name`, `registered_owner_type`, `managing_agent_name`, `managing_agent_address`, `head_officer_name`, `head_officer_address`, `last_registration_date`.
   - For each unique owner/agent/officer name, upsert into `entities` with `source='hpd_mdr'`.
   - Index on `building_id` and on `head_officer_name` (the strongest LLC-unmasking signal in NYC public data).

2. **Co-op / Condo Tax Abatement** (Socrata; verify dataset ID — `4tas-cf6q` is one candidate, confirm in Phase 0):
   - Daily incremental sync.
   - Upsert into `condo_ownership.tax_abatements` table with `building_id`, `unit_id` (when unit-level), `abatement_type`, `primary_residence_flag`, `effective_date`, `expiration_date`.
   - When `primary_residence_flag = true`, propagate to `unit_ownership_current.primary_residence_flag`.

3. **NYC Dog Licensing** (`nu7n-tubp`):
   - Bulk static download + monthly refresh.
   - Upsert into `condo_ownership.dog_licenses` with `owner_name`, `owner_zip`, `borough`, `breed`, `license_year`.
   - This is a confidence-signal source, not a join target. Phase 6's Play 11 (new addition) will cross-reference: if a dog-licensed name appears in the same zip as an ACRIS owner of an individual-type unit, record an `entity_resolution_edges` row with `edge_type='residency_signal_dog'`, `confidence=0.55`.

4. **NYC Marriage License Index** (1950-2017):
   - One-time bulk download from `https://www.nycmarriageindex.com/` (4.7M+ records). License is open data; verify and document.
   - Upsert into `condo_ownership.marriage_index` with `spouse1_name`, `spouse2_name`, `marriage_date`, `borough`.
   - Static dataset; no incremental refresh after the initial load.
   - Phase 6 Play 2 (Spousal Linkage) consumes this.

5. **NYS Active Corporations Bulk** (Socrata `n9v6-gdp6` (Phase 0 corrected — original `n8mn-d6c5` is dead; `n9v6-gdp6` is the live ID already used in `src/lib/ny-corporations.ts`) — confirm in Phase 0):
   - Daily incremental sync (last_modified-based).
   - Upsert into `condo_ownership.nys_entities` with `dos_id`, `entity_name`, `entity_type`, `formation_date`, `status`, `process_address`, `principal_office_address`, `chairman_name` (corps only).
   - For every NYS entity, upsert into `entities` with `dos_id` populated. Use the existing `ny-corporations.ts` lookup logic for fuzzy matching at write time — link `acris_parties.entity_id` to NYS entities via `dos_id` where exact-match on canonical name.

6. **ProPublica Nonprofit Explorer (Form 990s)**:
   - Free API: `https://projects.propublica.org/nonprofits/api/v2/`.
   - For every nonprofit referenced in NYC ownership data (cross-ref against `entities` where `entity_type='nonprofit'`), fetch the latest 990 by EIN.
   - Upsert into `condo_ownership.nonprofit_filings` with `ein`, `entity_id` (FK to `entities`), `filing_year`, `revenue`, `assets`, `officers` (jsonb array), `address`.
   - Daily incremental for nonprofits whose `last_990_fetched_at` is older than 30 days.

7. **ICIJ Offshore Leaks Database**:
   - One-time bulk download of the open-data CSV bundle from `https://offshoreleaks.icij.org/pages/database`.
   - Datasets: Panama Papers, Pandora Papers, Paradise Papers, Bahamas Leaks, Offshore Leaks.
   - Upsert into `condo_ownership.icij_entities` with `node_id`, `entity_name`, `name_normalized`, `entity_type`, `jurisdiction`, `source_leak`, `address`, `officers` (related node IDs), `intermediaries`.
   - For every ICIJ entity, attempt fuzzy match against existing `entities`. If high-confidence (Jaro-Winkler > 0.92, jurisdictions/addresses align), populate `entities.icij_node_id` and create an `entity_resolution_edges` row with `edge_type='offshore_match'`, `confidence` per Play 5's logic.

8. **LL97 / LL84 / LL87 Building Compliance**:
   - LL84 Energy Audit Results (`zbcd-uypa` or current ID — confirm).
   - LL97 Greenhouse Gas Emissions (DOB BEAM portal — likely Socrata-mirrored; confirm dataset ID).
   - LL87 Energy Audits + Retro-Commissioning (Socrata `28fi-3us3` candidate — confirm).
   - All three: annual refresh.
   - Upsert into `condo_ownership.building_compliance` with `building_id`, `compliance_type`, `filing_year`, `owner_name_filed`, `bin`, `compliance_status`, `emissions_data` (jsonb), `penalty_estimate`.
   - For each filing, the disclosed `owner_name_filed` is a verification signal — cross-reference with current owner from ACRIS. If divergent, log an `entity_resolution_edges` row with `edge_type='ownership_disagreement'` and let Phase 4 surface it as a confidence-flag.

9. **OFAC SDN List** (lightweight ingest):
   - Free download from `https://sanctionslist.ofac.treas.gov/`. Bulk XML or CSV.
   - Weekly refresh.
   - Upsert into `condo_ownership.ofac_sdn` with `sdn_id`, `name`, `aliases` (jsonb), `addresses`, `country`, `program` (e.g., 'RUSSIA-EO14024'), `designation_date`.
   - Phase 6 Play 5 escalates ICIJ matches that also hit OFAC SDN.

9a. **NYC Tax Lien Sales (per Deep Dive #3, Phase 0 corrected).**
   - Source: **Socrata dataset `9rz4-mjek` (Tax Lien Sale Lists)** — confirmed live by Phase 0. Direct query returns rows with `month`, `cycle`, `borough`, `block`, `lot`, `tax_class_code`, `building_class`, `house_number`, `street_name`, `zip_code`, `water_debt_only`. Sibling dataset `etp2-fnbu` (Tax Sales 2010-Current) also live.
   - **The earlier FOIL fallback path is unnecessary** — Phase 0 verified the Socrata mirror is current and queryable. Use the standard Terminal `DatasetConfig` ingest pattern, not a custom CSV scraper.
   - Schema: upsert into `condo_ownership.tax_liens` (already created in Phase 1) with `building_id` (FK resolved via BBL — borough+block+lot fields are present), `lien_type='tax'`, `amount`, `filed_date`, `status='active' | 'satisfied' | 'sold'`, `sale_year`, `cycle` (90 Day Notice / Lien Sale / etc.).
   - Backfill: pull all lien-sale records from 2017 onward.
   - Run monthly via the existing `IngestionState` cadence.
   - Phase 6 Play 11 (forced-sale composite) consumes this.

9b. **Lis Pendens — STOP, DO NOT IMPLEMENT AS WRITTEN. (Phase 0 finding, redesign required.)**

   ⚠️ **The original Deep Dive #3 strategy is wrong.** Phase 0 verified that ACRIS Master `bnx9-e6tj` does NOT contain doc_types `LP`, `NOP`, or `JPDN` — direct queries return empty. `PREL` exists but stands for "Partial Release of Mortgage," not "Preliminary Notice of Pendency." ACRIS Legals `8h5j-fqxa` has no `doc_type` field at all. Lis pendens are filed with NYS County Clerks (NYSCEF / Unified Court System), not in any NYC Open Data Socrata dataset.

   **Before implementing this task, Claude Code MUST stop and ask Nathan which substitute approach to use.** Three options on the table (Nathan to choose):
   - **(a) NYSCEF integration** — public NY State Court e-filing system; has unofficial API, lis pendens are searchable. Most fragile of the three; requires its own ingest pipeline and ToS review.
   - **(b) Substitute distress proxy (recommended for v1)** — combine signals already in scope: tax liens (task 9a), mortgage-without-satisfaction past maturity (Phase 5 ACRIS mortgage parsing), HPD Class C violation density, ECB judgment debt > $10K. Captures ~70% of pre-foreclosure signal without court-system integration. Implement as a `distress_signals.preForeclosureRisk` composite in Phase 5 instead of a dedicated `lis_pendens` table.
   - **(c) Defer to v2** — drop lis pendens from this build entirely, mark as a known gap, revisit after a NYSCEF integration plan exists.

   If Nathan chooses (b), this task becomes part of Phase 5 mortgage parsing, not Phase 3. The `lis_pendens` table from migration 09 should be left empty (or removed) and the Phase 6 Play 11 forced-sale composite should source distress signal from tax liens + mortgage-maturity-without-satisfaction + HPD/ECB density instead.

   If Nathan chooses (a), this task expands into a separate sub-phase covering NYSCEF integration, ToS, and rate-limit handling — out of scope for this build prompt without further design work.

   **Do not attempt to scrape ACRIS document images for lis pendens. The data is not there.**

9c. **FFIEC Call Reports for lender stress (per Deep Dive #3).**
   - Source: `https://www.ffiec.gov/npw/FinancialReport/CallReport`. Quarterly bulk download of bank balance sheets.
   - Pipeline: pull every quarter's release, parse to extract per-bank metrics: total assets, real-estate-loan concentration, loan-loss reserves, Tier 1 capital ratio, regulatory CAMELS score where public.
   - Schema: new `condo_ownership.lender_stress_metrics` table — add to Phase 1 follow-up migration. Fields: `bank_id` (FFIEC ID + cert number), `bank_name_canonical`, `quarter_end_date`, `total_assets`, `real_estate_loans_pct`, `loan_loss_reserves_pct`, `tier_1_capital_ratio`, `camels_score`, `stress_flag` (boolean derived: reserves >3% OR tier1 <10% OR re_concentration >60%).
   - For each bank, populate/match a row in `entities` with `entity_type='corp'` and a new field `ffiec_id`. Cross-reference: when ACRIS mortgage parsing identifies a lender entity, attempt fuzzy match against FFIEC bank names. Where matched, store `lender_entity → ffiec_id` link in `entity_resolution_edges` with `edge_type='ffiec_bank_match'`, `confidence=0.95` for exact normalized-name match.
   - Refresh quarterly (around the 30th day after each quarter end).
   - Phase 6 Play 13 (lender concentration risk) consumes this.

10. **Wire each new source to its own Cloud Run Job + Cloud Scheduler entry.** Document all in `deploy/condo-ownership/README.md`. Stagger schedules to avoid concurrent peak load.

11. **Smoke-test each:** Pull a known building or entity and verify rows land in the new tables. Examples:
    - HPD MDR: Look up "15 Central Park West" → confirm registration row with managing agent.
    - Tax abatement: Look up a known co-op building → confirm primary-residence flags.
    - NYS entities: Look up "VORNADO REALTY TRUST" → confirm DOS ID resolves.
    - ICIJ: Look up a known Pandora Papers entity → confirm match.
    - OFAC SDN: Pull current sanctions list → confirm count > 10,000 entries.

## Verification gates

- All 8 new ingest jobs deploy and run a successful first cycle.
- Each new table has > 100 rows (or the appropriate scale for static datasets).
- `entities` table grows substantially — new rows from HPD MDR head officers, NYS DOS active entities, ICIJ nodes, OFAC SDN.
- Every smoke-test query returns expected data.
- `sync_metrics` records P50/P95 lag for each source.

## What to leave alone

- Don't write Phase 4 code yet — entity-resolver extensions are next phase.
- Don't surface this data in any UI yet. That's Phase 8.
- Don't run AG offering plan OCR — that's a separate v2 effort outside this prompt suite's scope.

## Commit / output

- One PR with one commit per source ingest = ~9 commits. All under the `feat(building-intel): phase 3` umbrella.

## Checkpoint

Stop. Run a verification dashboard query: count rows per source, last successful sync timestamp, P95 lag. Wait for Nathan.

## Coming next

Phase 4 extends `entity-resolver.ts` to actually USE the data we've collected — beneficial-owner unmasking via NY DOS officer parsing, ICIJ matching, mailing-address clustering, head-officer cross-reference. We populate `entity_resolution_edges` with confidence-scored relationships.

---

# PHASE 4 — Entity Resolution + Beneficial-Owner Unmasking

**Goal:** Extend `src/lib/entity-resolver.ts` to do beneficial-owner unmasking. Populate `entity_resolution_edges` with confidence-scored relationships from all the data sources Phase 3 ingested. Build the canonical "who's behind this LLC" function.

**Coming in:** Phase 3 sources ingested; entity-resolver still does only Levenshtein + Jaro-Winkler + containment matching at function level.

## Tasks

1. **Audit and extend `entity-resolver.ts`.** Keep the existing `normalizeName`, `normalizeAddress`, `isSameEntity`, `ResolvedEntity` interface — they work. Add:
   - `resolveBeneficialOwners(entityId: string): Promise<BeneficialOwner[]>` — returns ranked beneficial owners with confidence + sources.
   - `resolveRelatedEntities(entityId: string): Promise<RelatedEntity[]>` — returns related LLCs / sister entities via shared address, name patterns, etc.
   - `clusterEntitiesByMailingAddress(orgId: string, address: string): Promise<Entity[]>` — given a mailing address, return all entities that share it.

2. **Implement the eight beneficial-owner inference signals** (each adds rows to `entity_resolution_edges`):

   - **Signal A — NY DOS officer disclosure.** For every entity with a `dos_id`, parse `nys_entities.chairman_name` (corps) and `process_name` (LLCs). Where matched, create edge `(target_entity, person_entity, 'principal_of', 0.85, 'ny_dos_chairman')`. Run nightly.

   - **Signal B — HPD head-officer disclosure.** For every building with HPD MDR registration, the disclosed `head_officer_name` is a strong principal signal. Match the head officer name (fuzzy) against `entities`. Create edge `(building_owner_entity, head_officer_entity, 'principal_of', 0.80, 'hpd_mdr')`.

   - **Signal C — Mailing-address clustering.** For every mailing address that appears on 2+ ACRIS deeds with different LLC grantees, cluster those LLCs. Create edges `(llc_a, llc_b, 'shared_address', 0.65, 'acris_mailing_cluster')`. Lower confidence if address is a known commercial mail service (P.O. boxes, NY DOS process service addresses); higher confidence if address is unique.

   - **Signal D — ICIJ Offshore Leaks match.** Already wired in Phase 3 ingest. This signal extracts beneficial owners from ICIJ's `officer` and `intermediary` graph. For every entity with `icij_node_id`, walk the ICIJ graph one hop to find related officers/beneficiaries. Create edges with `edge_type='offshore_beneficiary'`, confidence per Play 5.

   - **Signal E — Form 990 officer disclosure.** For every nonprofit entity, parse the 990 `officers` jsonb. Create edges `(nonprofit_entity, officer_entity, 'principal_of', 0.90, 'irs_990')`.

   - **Signal F — Spousal linkage from Marriage Index.** Phase 6 Play 2 logic. Match owner name → marriage record → spouse name. Create edges `(owner_entity, spouse_entity, 'spouse_of', confidence_per_play_2)`.

   - **Signal G — Sequential LLC formation.** When 5+ LLCs share an NYS DOS process address AND are formed within 30 days of each other, that's a sponsor's deal-vehicle pattern. Create edges `(llc_a, llc_b, 'related_llc', 0.75, 'sequential_formation')`.

   - **Signal H — Attorney-of-record / process-server clustering.** For LLCs sharing the same `process_name` (NYS DOS) or matching attorney signatures across ACRIS deeds, create edges `(llc_a, llc_b, 'related_llc', 0.60, 'shared_attorney')`.

3. **Confidence aggregation.** A pair of entities can have multiple edges from different signals. Build `aggregateConfidence(sourceEntity, targetEntity, edgeType): number`:
   - Combine via Bayesian aggregation, not naive averaging.
   - `1 - (1 - p1)(1 - p2)(1 - p3)...` where each p_i is the confidence of an independent signal.
   - Ensure independence — multiple HPD MDR signals across years are NOT independent; treat as one.
   - Cap at 0.99 (no source is perfect).

4. **JustFix Who Owns What integration.** They've solved a meaningful subset of LLC clustering. Pull their open-source Postgres dump from `github.com/JustFixNYC/wow-django`, map their entity graph into our `entity_resolution_edges` with `signal_source='justfix_wow'`. Treat as Signal I with confidence 0.70 baseline.

5. **Backfill `entity_resolution_edges`** by running all 9 signals over the existing data once. Estimated 1-3 hours depending on data volume.

6. **Build a verification harness.** Pick 20 well-known NYC LLCs (e.g., `220 CPS LLC`, `15 CPW MEMBER LLC`) and ask: who do we resolve as principals? Compare against public press / Wikipedia / The Real Deal articles. Document hit rate in `docs/intel/building-intel-overhaul/entity-resolution-validation.md`. Target: ≥60% recall on principals named in press for these well-known entities.

## Verification gates

- `entity_resolution_edges` populated with > 100k rows after backfill.
- Verification harness produces ≥60% recall on the 20 known LLCs.
- New `resolveBeneficialOwners` function returns sane results for a sample of LLCs (manually inspected).
- Existing `entity-resolver.ts` tests still pass.

## What to leave alone

- Don't extend `data-fusion-engine.ts` yet (that's Phase 5).
- Don't wire UI yet.

## Commit / output

- One PR. Commit per signal (8-9 commits).

## Checkpoint

Stop. Show the verification harness results. Wait for Nathan.

## Coming next

Phase 5 extends `BuildingIntelligence` (the return type of `data-fusion-engine.ts`) to surface the new ownership data — `unitLevel[]`, `beneficialOwners[]`, `entityGraph`, `debt[]`, `compliance.ll97PenaltyCalculation`. The engine reads from our new tables; it doesn't refetch from Socrata.

---

# PHASE 5 — data-fusion-engine Extensions

**Goal:** Extend `BuildingIntelligence` (the return type and `BuildingIntelligence` interface in `data-fusion-types.ts`) to expose unit-level ownership, beneficial-owner data, entity graph, debt structure, and LL97 penalty calculations. Existing fields stay backward-compatible.

**Coming in:** Phase 4 entity resolution working; new tables populated.

## Tasks

1. **Extend `data-fusion-types.ts`:**

   ```typescript
   export interface BuildingIntelligence {
     // ... existing fields ...
     ownership: ResolvedOwnership & {
       unitLevel?: UnitOwnership[];           // condos: per-unit owners
       coopShareholderTransfers?: CoopTransfer[];  // RPTT-derived for co-ops
       beneficialOwners?: BeneficialOwner[];   // resolved via entity_resolution_edges
       entityGraph?: EntityGraphNode[];        // sister entities, principal chains
       primaryResidenceFlags?: number;         // count of units owner-occupied
       outOfBuildingInvestorFlags?: number;    // count where mailing ≠ unit
       buildingStructureType: 'condo' | 'coop' | 'condop' | 'rental' | 'mixed' | 'unknown';
     };
     debt?: {
       activeMortgages: Mortgage[];                  // parsed via ACRIS mortgage logic per Deep Dive #3
       maturityWindow?: { months: number; loanAmount: number };  // refinancing window signal
       capitalStack?: CapitalStackTier[];             // reconstructed by chaining MTGE → ASST → SAT
       totalDebtRecorded?: number;                    // sum of active senior mortgages
       lenders?: LenderSummary[];                     // distinct lenders + FFIEC stress signal per lender
       taxLiens: TaxLien[];
       lisPendens: LisPendens[];                      // freshness-classified per Deep Dive #3 logic
       refinancingProfile?: {
         nextMaturityDate?: string;                   // ISO; null if no maturity dates parsed
         nextMaturityConfidence: 'parsed_from_doc' | '30yr_amort_assumption' | 'unknown';
         loanVintage?: string;                        // 'recent' | 'mid_cycle' | 'mature'
         windowFlag?: 'imminent' | 'near_term' | 'distant' | 'none';
       };
     };
     compliance: {
       // ... existing fields ...
       ll97PenaltyCalculation?: {
         currentEmissions: number;
         capForPeriod: number;
         estimatedAnnualPenalty: number;
         complianceTrajectory: 'compliant' | 'penalty_imminent' | 'severe_penalty';
       };
     };
     confidenceFactors: ConfidenceFactor[];  // every signal that contributed to ownership confidence
   }
   ```

2. **Add reader functions in `data-fusion-engine.ts`** that pull from the new tables:
   - `fetchUnitLevelOwnership(buildingId)` → `UnitOwnership[]` from `unit_ownership_current`.
   - `fetchBeneficialOwners(entityId)` → `BeneficialOwner[]` from `entity_resolution_edges`.
   - `fetchEntityGraph(entityId)` → `EntityGraphNode[]` traversing edges 2 hops.
   - `fetchDebtStructure(buildingId)` → `Mortgage[]`, `TaxLien[]`, `LisPendens[]` from new tables.
   - `computeLL97Penalty(buildingId)` → uses `building_compliance` + LL97 thresholds for the building's class. Reuse `ll97-penalties.ts` if logic is already implemented; otherwise extend it.
   - `detectBuildingStructureType(buildingId)` → reads `buildings.property_type`, but also confirms via secondary signals (condo unit count from `eguu-7ie3`, presence of co-op corporation in `entities`, RPTT filings). Returns the structure with confidence.

2a. **Implement ACRIS mortgage parsing** (per Deep Dive #3) in a new module `src/lib/condo-ingest/derived/mortgage-parser.ts`:
   - `parseMortgagesForBuilding(bbl)`: query `acris_master` filtered to `MORTGAGE_DOC_TYPES` for the BBL, joined to `acris_legals` and `acris_parties` (party_type=2 = lender). Order by `document_date DESC`.
   - `reconstructCapitalStack(mortgages)`: chain `MTGE` → `ASST` → `SAT` records chronologically. Identify: 1st mortgage (earliest unassigned/unsatisfied), 2nd/mezzanine (subordinate MTGE with same borrower), refinance cycles (SAT + new MTGE within 6-month window). Return tiered structure.
   - `inferMaturityDate(mortgage)`: structured-data-first — if a `maturity_date` field is populated in the Socrata record, use it. Otherwise apply 30-year amortization from `recorded_date` as fallback. Tag the result with `nextMaturityConfidence: 'parsed_from_doc' | '30yr_amort_assumption'`. Do **NOT** ship OCR-derived maturity in v1 — flag as v2 enhancement with a separate confidence label.
   - `normalizeLenderName(name)`: standardize lender variants ("JPMorgan Chase" / "JP Morgan" / "CHASE BANK") via fuzzy matching (Levenshtein 80%+) against a curated lookup table seeded from FFIEC bank names. Reuse `entity-resolver.ts.normalizeName()` extensions where applicable.
   - `linkLenderToFFIEC(lenderEntity)`: cross-reference normalized lender against `condo_ownership.lender_stress_metrics` to populate `LenderSummary.stressSignal`.
   - Output type: `Mortgage[]` populated with `lender`, `amount`, `recorded_date`, `maturity_date`, `maturity_confidence`, `mortgage_type` (first/second/cema/etc.), `status` (active/satisfied/assigned), `assignments` (chain of assignees), `lender_stress_flag`.

2b. **Implement lis-pendens freshness classification** in `src/lib/condo-ingest/derived/lis-pendens.ts`:
   - `classifyLisPendens(filedDate, status)`: returns `'fresh' | 'aged' | 'discharged'` per Deep Dive #3 logic (fresh < 3mo & active = 85% confidence; aged 3-12mo = 60%; discharged < 6mo = 20%).
   - Used by Phase 6 Play 11 and exposed in `BuildingIntelligence.debt.lisPendens[].freshness`.

3. **Modify the existing `getBuildingIntelligence(bbl)` orchestrator** to add the new reads in Phase 1 (parallel `Promise.allSettled`). Keep all 14 existing source queries as-is. Add reads from the new tables alongside.

4. **Refresh logic.** When `data-fusion-engine` is hit for a BBL it hasn't seen recently:
   - The 14 existing Socrata queries still go out at request time (unchanged).
   - The new ownership/debt/compliance reads come from our internal tables, which are populated by the daily ingest jobs.
   - This means: real-time freshness for the 14 existing sources; 24h freshness for the new sources.
   - This is the right tradeoff — the high-value data comes from the new tables, doesn't need to be sub-day fresh.

5. **Add denormalization for fast reads.** When recompute fires on a unit:
   - Compute `mailing_differs_from_unit` boolean.
   - Compute `current_owner_type` from entity classification.
   - Compute `out_of_building_investor` flag.
   - Populate `confidenceFactors[]` summarizing what signals contributed.

6. **Tests.** Update or extend `terminal-enrichment.test.ts` style tests to cover:
   - `getBuildingIntelligence` for a known condo (15 CPW) returns `ownership.unitLevel` populated.
   - For a known co-op (e.g., The Dakota — `1011411501` or appropriate BBL) returns `ownership.coopShareholderTransfers` from RPTT data.
   - For a building with maturing mortgage, returns `debt.maturityWindow`.
   - For a building over LL97 threshold, returns `compliance.ll97PenaltyCalculation`.

## Verification gates

- `getBuildingIntelligence('1011577501')` (15 CPW) returns ownership.unitLevel with 200+ rows.
- A known co-op building returns shareholder transfer history from RPTT.
- A known leveraged building returns active mortgages with maturity dates where available.
- Existing `BuildingIntelligence` consumers (Market Intel UI, Terminal enrichment) continue to work without modification — backward compatibility is preserved.

## What to leave alone

- Don't change the 14 existing Socrata queries. Don't reorder phases.
- Don't add UI reads of the new fields yet. That's Phases 7 and 8.

## Commit / output

- One PR. Commit per added field/function.

## Checkpoint

Stop. Show a sample `getBuildingIntelligence` response for a condo, a co-op, and a leveraged building. Wait.

## Coming next

Phase 6 implements the 10 cross-reference plays from Deep Dive #2 as composable signal functions. These produce `confidenceFactors[]` rows that feed into `ownership.beneficialOwners` confidence aggregation.

---

# PHASE 6 — Cross-Reference Plays as Composable Signals

**Goal:** Implement the 10 cross-reference plays from `condo-ownership-data-sources-deep-dive-2.md` as a library of composable signal functions in `src/lib/condo-ingest/plays/`. Each play takes a building or entity, returns `{signal: string, confidence: number, evidence: any}`. Plays are run during entity-resolution refresh and during `getBuildingIntelligence` requests.

**Coming in:** Phase 5 done.

## Tasks

For each play below, implement as `src/lib/condo-ingest/plays/play-N-{name}.ts`. Each module exports a `runPlay(args)` function with a strict input/output contract.

1. **Play 1 — LLC Mailing Address + FEC Donor Cross-Ref.**
   - Input: entity ID.
   - Pull entity's mailing addresses. Query OpenFEC API (`https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_zip=&contributor_name=&...`) for matching donors.
   - Confidence per Deep Dive #2 Play 1 logic.
   - Output: rows for `entity_resolution_edges` with `edge_type='principal_of'`, `signal_source='fec_donor_match'`.

2. **Play 2 — Spousal Linkage via Marriage Index.**
   - Input: entity ID where `entity_type='individual'`.
   - Match canonical_name against `marriage_index`. Score per Play 2.
   - Output: edges `(person, spouse, 'spouse_of', confidence)`.

3. **Play 3 — LL97 Compliance + Tax Bill Owner Cross-Ref.**
   - Input: building ID.
   - Read `building_compliance` LL97 owner_name_filed; read DOF tax bill owner. Cross-match. Confidence per Play 3.
   - Output: confidence factor for `ownership.beneficialOwners` aggregation.

4. **Play 4 — Aircraft / Vessel Cross-Ref.**
   - Input: entity ID.
   - Query FAA N-number registry (free CSV download, refresh weekly) and USCG vessel documentation (free name search) for matches.
   - Confidence per Play 4. Output: signal flag for `ownership.beneficialOwners` (UHNW profile).

5. **Play 5 — Offshore Entity Unmasking via ICIJ + OFAC.**
   - Input: entity ID.
   - Read `entities.icij_node_id`. If present, walk ICIJ graph to officers. Cross-check against OFAC SDN.
   - Confidence per Play 5. Output: edges with high confidence on OFAC match.

6. **Play 6 — NY DOS Entity Lifecycle.**
   - Input: entity ID for an LLC.
   - Pull formation_date, status_history. Compare to ACRIS deed dates.
   - Output: signal flag for "investor vs. owner-occupant" classification (Play 6 logic).

7. **Play 7 — Lobbying Affiliation.**
   - Input: building or entity ID.
   - Query NYC Clerk's e-Lobbyist + JCOPE data (Phase 3 may not have these wired; if not, defer Play 7 to v2 and skip the implementation in this phase — flag in the PR description).
   - Output: edges where lobbyist employer matches LLC.

8. **Play 8 — Form 990 Officer Cross-Ref.**
   - Input: entity ID where `entity_type='nonprofit'`.
   - Read `nonprofit_filings.officers`. Cross-match against `entities`.
   - Output: high-confidence `principal_of` edges.

9. **Play 9 — FEC Donor Aggregation Profile.**
   - Input: entity ID.
   - Aggregate FEC contributions for owner name across cycles. Compute total $, party alignment, occupational background.
   - Output: confidence factor for owner profile (UHNW / active investor / passive).

10. **Play 10 — Marriage + DHCR Rent-Stabilized Registry.**
    - Input: building ID where building has rent-stabilized units.
    - For each individual owner, check Marriage Index → spouse name. Check DHCR registration for spouse occupant.
    - Output: occupancy confidence flag.

10a. **Play 11 — Forced-Sale Composite (per Deep Dive #3).**
    - Input: building ID.
    - Inputs from prior phases: `BuildingIntelligence.debt.refinancingProfile.windowFlag`, `compliance.ll97PenaltyCalculation.estimatedAnnualPenalty`, `debt.lisPendens` (any fresh), `debt.taxLiens` (any active), `compliance.hpdViolations.classC` count, `compliance.dobViolations.ecbPenalty` total.
    - Logic: composite scoring with weighted criteria — mortgage_maturity_<_12mo (30%), LL97_penalty_>_$100k_annual (40%), active_distress_signal (any of: fresh lis pendens, active tax lien, Class C HPD violations > 5) (30%). Sum to 0-100 forced-sale-likelihood score.
    - Confidence thresholds: `>= 70` = "forced-sale candidate (high)", `40-69` = "watch list (medium)", `< 40` = "no signal".
    - Output: a row in `entity_resolution_edges` is the wrong shape here — instead, this play produces a per-building signal stored in a new `condo_ownership.building_signals` table (add to Phase 1 follow-up migration if not present): `building_id`, `signal_type='forced_sale_candidate'`, `score`, `confidence`, `evidence` (jsonb of contributing factors), `computed_at`. Surfaced in Phase 8's distress search.
    - Tier: Tier 1 (add to v1 build).

10b. **Play 12 — Operator Network Cluster (per Deep Dive #3).**
    - Input: building ID OR managing-agent name.
    - Logic: cluster buildings sharing the same `managing_agent_name` from HPD MDR (exact match + Levenshtein 80%+). Cross-reference managing-agent address against NY DOS process address — entities with the same process address and the same managing agent are likely under common operational control. Cross-reference shared mortgage lender as a tertiary signal.
    - Output: edges in `entity_resolution_edges` with `edge_type='operator_cluster'`, `confidence` per signal strength (exact name + same DOS address = 0.85; fuzzy name + same DOS address = 0.70; exact name only = 0.55).
    - Surfaces a new `BuildingIntelligence.ownership.operatorCluster` field listing: cluster ID, member buildings, principal entities resolved across the cluster.
    - Tier: Tier 1.

10c. **Play 13 — Lender Concentration Risk (per Deep Dive #3).**
    - Input: building ID.
    - Logic: walk `BuildingIntelligence.debt.lenders[]`. For each lender, look up FFIEC stress metrics via `linkLenderToFFIEC`. If lender has `stress_flag=true` (loan-loss-reserves >3% OR Tier 1 capital ratio <10% OR real-estate concentration >60%), flag the building as "exposed to lender stress."
    - Output: a row in `condo_ownership.building_signals` with `signal_type='lender_stress_exposure'`, `score` (0-100 weighted by exposure proportion of capital stack), `evidence` (lender names + FFIEC metrics).
    - Tier: Tier 1 (add to v1 build).

11. **Add a play orchestrator** in `src/lib/condo-ingest/plays/index.ts`:
    - `runAllPlays(buildingId)` — runs all 13 plays for a building (Plays 1-10 from Deep Dive #2 + Plays 11-13 from Deep Dive #3). Designed to be invoked nightly per building or on-demand during a fresh `getBuildingIntelligence` call.
    - Caches results in a `play_runs` table to avoid redundant API hits.

12. **Wire plays into the ingest pipeline.** When `acris-incremental-sync` recomputes `unit_ownership_current` for a BBL, also invoke `runAllPlays` for the affected building. Throttle aggressively — these plays hit external APIs (OpenFEC, FAA) that have rate limits.

13. **Update `getBuildingIntelligence`** to return `ownership.beneficialOwners[]` populated from the play outputs + entity-resolver edges, sorted by aggregate confidence descending.

## Verification gates

- Each play returns sane output for a manually-tested example.
- Play 5 (ICIJ) produces a real match for a known offshore-owned NYC condo (research a known case from Pandora Papers + NYC condo).
- Play 2 (Spousal) produces matches for at least 25% of individual owners in a test sample.
- Play 8 (990 officers) produces matches for known nonprofit-owned buildings.
- The aggregate `confidenceFactors[]` array on `BuildingIntelligence` is populated and informative.

## What to leave alone

- Skip Play 7 if NYC Clerk lobbying data isn't wired in Phase 3 — flag it as v2.
- Don't ship Plays 4 and 9 to UI yet without Nathan's review (FAA/vessel + FEC have a "creep" feel; he should approve UI exposure).

## Commit / output

- One PR. One commit per play (10 commits) + 1 commit for orchestrator + wiring.

## Checkpoint

Stop. Show sample play output for the 4-5 highest-leverage plays (1, 2, 5, 8). Wait.

## Coming next

Phase 7 builds the apartment-level UI lenses — condo at `/intel/condo-ownership`, co-op at `/intel/coop-ownership`. These are *narrow views* on the engine; most logic is already in place.

---

# PHASE 7 — Apartment-Level UI Lenses

**Goal:** Ship two new UI surfaces — `/intel/condo-ownership` and `/intel/coop-ownership` — implementing the search/table/drawer pattern from the original v1 spec, with the corrected disclosure language and structure-type detection.

**Coming in:** Phase 6 done. Engine returns rich data. Now we just need a UI to query and display it.

## Tasks

1. **Create `/intel/condo-ownership/page.tsx`** following the v1 spec layout:
   - Single prominent search bar at the top, full-width, with autocomplete using shadcn `Command`. Debounce 150ms. 8 suggestions max, grouped by type (Address / Owner / BBL).
   - Result view: shadcn `Table` with columns Address · Unit · Current Owner · Last Sale Date · Last Sale Price. Sort and filter columns supported.
   - Click row → shadcn `Sheet` from the right with full unit detail: transaction history timeline, ACRIS doc links (`https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=<document_id>`), out-of-building-investor badge, beneficial-owner data (collapsible section).
   - CSV export of current result set.
   - Footer disclosure with the exact language from the non-negotiable constraints section.

2. **Implement four API routes under `src/app/api/v1/condo-ownership/`:**
   - `GET /search?q=&limit=` — smart input-type detection (BBL regex → address trigram → owner full-text). Cap `limit=100`.
   - `GET /unit/:bbl` — `{unit, current, history, beneficialOwners, confidenceFactors}`.
   - `GET /building/:billing_bbl/units` — natural-sorted unit list.
   - `GET /owner/:name_query` — fuzzy name match across `entities` + `unit_ownership_current`.
   - All four set `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`.

3. **Structure-type detection in the search response.** When a user searches a building, before returning unit-level results, the API checks `buildings.property_type` and returns:
   - `condo` → full unit list with owners.
   - `coop` → list of share-block transfers from RPTT data (Phase 8 surface).
   - `condop` → "This building is a hybrid condo-co-op structure. Unit-level shareholder data is not in public records. Showing building-level information instead." Plus building-level info (managing agent, head officer, last building-level transactions).
   - `rental` → "This building is a single-owner rental. Showing building owner: <X>." Plus that one row.
   - `unknown` → degraded UI with structural caveat.

4. **Create `/intel/coop-ownership/page.tsx`** as a sibling. Same shape, different filter:
   - Returns `units` where `subject_type='coop_share_block'`.
   - "Last Sale" column reads from RPTT-derived transfers, not deeds.
   - Disclosure: "Co-op share transfers since [earliest_RPTT_year]. Pre-RPTT-era shareholders (typically pre-2003) and intra-family transfers may not appear."

5. **Match the existing VettdRE Terminal dark UI exactly.** Don't design new components. Use existing shadcn elements. Reference `terminal-feed.tsx`, `terminal-event-card.tsx`, `event-detail-expanded.tsx` as style precedent. The `Sheet` slide-over should match the Terminal's right-panel chrome.

6. **Integration tests** in `src/__tests__/intel/condo-ownership.test.ts`:
   - Search by address → returns expected building.
   - Search by BBL → lands on unit detail.
   - Search by owner → returns portfolio.
   - Building detail sheet renders without error for: condo, co-op, condop, rental.
   - CSV export produces well-formed file.

## Verification gates

- Search "15 Central Park West" → 201-unit table renders with current owners.
- Search a known LLC family → portfolio renders.
- Search BBL → unit detail loads.
- Search a known condop building (e.g., "180 West End Avenue" — Lincoln Towers) → degraded UI with clear structural caveat.
- Mobile viewport responsive.
- p95 latency < 150ms on warm cache.

## What to leave alone

- Don't modify existing Market Intel UI yet (that's Phase 8).
- Don't add deep-link integrations to BMS / Pipeline / etc. yet.

## Commit / output

- One PR. Commits split between API routes, UI components, and integration tests.

## Checkpoint

Stop. Demo: search a condo, search a co-op, search a condop. Wait.

## Coming next

Phase 8 surfaces the new building intelligence in the EXISTING Market Intel `BuildingProfile` modal — debt structure tab, beneficial-owners view, refinancing-window indicator, distress-score upgrades, condop awareness.

---

# PHASE 8 — Market Intel UI Upgrades

**Goal:** Surface the new `BuildingIntelligence` fields (debt, beneficial owners, entity graph, LL97 penalty, structure type) in the existing Market Intel `BuildingProfile` modal at `/market-intel`. No new pages — extend what's there.

**Coming in:** Phase 7 done; engine returns rich data; new UI lenses live.

## Tasks

1. **Audit `building-profile-modal.tsx` and the tabs in `components/building-profile/`** to understand the existing structure:
   - Existing tabs (`tab-overview`, `tab-condition`, `tab-financials`, `tab-market`, `tab-ownership`).
   - Existing skeleton and loading states.
   - The `building-profile-actions.ts` server action contract.

2. **Add a new "Debt & Capital" tab** (`tab-debt.tsx`):
   - Active mortgages list: lender, amount, recorded date, maturity date (if known + confidence label: "from doc" or "30-year amortization assumption"), status, mortgage_type (1st/2nd/CEMA/etc.).
   - Capital stack visualization (1st / 2nd / mezz / preferred equity tiers per Deep Dive #3 reconstruction logic).
   - Refinancing window indicator: "Loan maturing in 14 months — high refinancing risk." with the explicit confidence label so users know when it's an amort assumption vs. parsed.
   - Lender stress exposure card (Play 13): for each lender with FFIEC stress flag, show "Exposed to <Lender> — stress signal: [reserves >3% / capital <10% / RE concentration >60%]."
   - Tax liens list with status, filed_date, amount.
   - Lis pendens list with freshness classification ("Fresh — filed 28 days ago" / "Aged — filed 7 months ago" / "Discharged"), claimed amount, plaintiff/defendant.
   - LL97 penalty calculation card: emissions vs. cap, estimated annual penalty, compliance trajectory.
   - Forced-sale-candidate badge (Play 11) when score >=70.

3. **Extend the existing "Ownership" tab** (`tab-ownership.tsx`):
   - Existing: registered owner, managing agent, deed history.
   - Add: beneficial-owner panel with confidence-scored chains. Show top 3 beneficial owners by aggregate confidence, expandable to full list. Each entry shows the signals that contributed to the confidence score (tooltip: "FEC donor match (0.65), HPD head officer (0.80) — combined 0.93").
   - Add: related entities (sister LLCs, principals, spouses) as a small force-directed graph or simple list.
   - Add: structure type badge ("Pure condo" / "Co-op" / "Condop" / "Rental — single owner") with a popover explaining the data implications for that structure.
   - Add: operator-cluster card (Play 12) — "This building is operated by <cluster name>. Cluster includes N other buildings." with "View operator network →" deep-link to the new operator network surface (task 3a).

3a. **Add a new operator network surface at `/intel/operator-network`** (per Deep Dive #3):
   - List view: every operator cluster the org has access to, sorted by cluster size descending.
   - Cluster detail: managing agent name, member buildings (with addresses + counts), shared lender(s), shared NY DOS process address, resolved principals (top 5 by confidence).
   - Filter: cluster size, neighborhood, distress signal exposure (any cluster with ≥1 member building flagged as forced-sale candidate).
   - Match Terminal dark UI; this surface lives next to the apartment-level lenses from Phase 7.

4. **Extend the existing "Financials" tab** (`tab-financials.tsx`):
   - Add: rolling sales trend chart for the building.
   - Add: average sale price per square foot per quarter.
   - Add: transaction velocity indicator.

5. **Extend the existing "Condition" tab** (`tab-condition.tsx`):
   - Add: distress score with the new signals layered in (mortgage maturity, LL97 exposure, tax liens, HPD harassment finding). Show the score breakdown.

6. **Update the `building-profile-actions.ts` server action** to read the new fields from `BuildingIntelligence`. Existing consumers continue to receive the existing fields; new tabs read the additions.

7. **Mobile responsiveness pass.** Each new tab must be usable on a phone. Use `pb-safe`, `pt-safe` utilities from `globals.css`.

8. **Distress search upgrade** (`distressed-search.tsx`):
   - Add filter: "Mortgage maturing within X months" (with confidence-label awareness — let users opt to include 30-yr-amort-assumption maturities or only doc-parsed maturities).
   - Add filter: "LL97 penalty exposure > $X annual."
   - Add filter: "Has active tax lien."
   - Add filter: "Has fresh lis pendens (filed within last X months)" with freshness classification options.
   - Add filter: "Forced-sale candidate score ≥ X" (Play 11 composite).
   - Add filter: "Exposed to lender stress" (Play 13).
   - Add filter: "Operator cluster has ≥ X buildings under distress" (Play 12 + Play 11 composition — bulk-distress operator targeting).

9. **Tests.** Update existing Market Intel snapshot tests and add new ones for the new tabs.

## Verification gates

- BuildingProfile loads cleanly for: pure condo, condop, co-op, rental, mixed-use.
- New tabs render without error for buildings with sparse data (e.g., no active mortgages, no LL97 filing).
- Distress search returns expected results for the new filters.
- Mobile viewport responsive across all tabs.
- No regression in existing tabs.

## What to leave alone

- Don't restructure the existing tab order or remove tabs.
- Don't change the modal's chrome — only add tabs and extend existing tabs.

## Commit / output

- One PR. Commits per tab.

## Checkpoint

Stop. Demo the upgraded BuildingProfile for 4-5 different building types. Wait.

## Coming next

Phase 9 is the deploy artifacts and verification suite. Cron jobs, monitoring, success criteria, the 14-day unattended plan.

---

# PHASE 9 — Deploy Artifacts + Verification + Monitoring

**Goal:** Produce clean deploy artifacts (Cloud Run job definitions, Cloud Scheduler config, monitoring queries, runbooks) so Nathan can promote to production. Run the verification suite. Document the rollback plan.

**Coming in:** Phases 0-8 done. Module is functionally complete in staging.

## Tasks

1. **Cloud Run Job Dockerfiles.** One per ingest job:
   - `condo-units-refresh` (weekly)
   - `acris-incremental-sync` (daily)
   - `acris-backfill` (manual trigger)
   - Each new auxiliary source (HPD MDR, tax abatement, dog licensing, NYS entities, ProPublica 990s, ICIJ, OFAC SDN, LL97/LL84/LL87 — group as appropriate).

2. **Deploy README** at `deploy/condo-ownership/README.md`:
   - Exact `gcloud run jobs deploy` commands for each job.
   - Cloud Scheduler cron expressions in UTC (with explicit ET → UTC notes).
   - All required environment variables (Socrata app token, `CRON_SECRET`, Supabase service-role key, ICIJ data path).
   - IAM permissions needed (Secret Manager access, Cloud Run Job invoker).
   - Estimated monthly cost (per-job + total).

3. **Cloudflare cache rules** (as documentation; Nathan applies):
   - 1h TTL on `/api/v1/condo-ownership/*` and `/api/v1/coop-ownership/*`.
   - Bypass for authenticated requests where appropriate.

4. **Monitoring queries.** Document SQL queries Nathan can put on a dashboard:
   - Ingest health: rows synced per source, P95 lag, last successful sync per source.
   - Recompute queue: number of BBLs touched but not yet recomputed in `unit_ownership_current`.
   - Entity-graph growth: edges per signal-source per day.
   - Search latency: p50/p95/p99 of `/api/v1/condo-ownership/search`.

5. **Alert wiring.** Document what to alert on:
   - Sync failure (any job 2 cycles in a row).
   - Lag P95 > 7 days for any source.
   - Row-count drift > 10% week-over-week (data anomaly).
   - Search error rate > 1%.

6. **Run the verification suite.** Execute the four success criteria from the original v1 spec:
   - Search "15 Central Park West" → all 201 units with owners. Document with screenshot.
   - Search a known entity name → portfolio across NYC. Document.
   - Search a 10-digit BBL → unit detail. Document.
   - 50-unit coverage QA against ACRIS DocumentSearch web UI (NOT PropertyShark). Document the sampling method, match rate, diffs. Target ≥95%.

7. **14-day unattended monitoring plan.** Cannot complete in-session. Produce:
   - Daily checklist (what to look at each morning).
   - Failure modes and responses.
   - Escalation paths.
   - Rollback procedure (per-migration revert order, scheduler-disable steps, Cloudflare cache purge).

8. **Final docs:**
   - `docs/intel/building-intel-overhaul/README.md` — overview of the whole build with links to phase docs.
   - `docs/intel/building-intel-overhaul/data-sources.md` — every Socrata dataset ID, field-mapping, refresh schedule.
   - `docs/intel/building-intel-overhaul/cross-reference-plays.md` — every play, its inputs, its confidence formula.
   - `docs/intel/building-intel-overhaul/rollback.md` — rollback runbook.

9. **Run the full backfill.** ACRIS 2000-present, all 5 boroughs. Estimate 6-10 hours. Run on a Cloud Run Job with 4GB RAM, monitor progress. Resume on failure via the chunk progress table. After ACRIS completes, also run: tax-lien sale backfill (2017-present per Phase 3 task 9a), FFIEC Call Report historical pull (last 8 quarters minimum), and the play orchestrator (`runAllPlays` for every building) to populate `building_signals`. Each backfill logs lag P50/P95 to `sync_metrics`.

9a. **Live-site regression sweep before promotion.** Re-run the live-site smoke test from Phase 0 (regenerate screenshots / HAR files for `/dashboard`, `/market-intel`, `/terminal`, `/contacts`, `/properties`, `/portfolios`, `/prospecting`) and compare against the pre-build baseline. Document any expected diffs (e.g., new tab appears in BuildingProfile, new filter in distress search) and confirm no unexpected regressions. Save comparison report to `docs/intel/building-intel-overhaul/post-build-regression.md`.

## Verification gates

- All 4 success criteria documented.
- 50-unit coverage QA documented with match rate.
- Full backfill complete with no missing chunks.
- Monitoring dashboard queries return expected results.
- Deploy README reviewed; Nathan can run the deploy commands without modification.

## What to leave alone

- Don't promote to production. That's Nathan's call after this phase ships.

## Commit / output

- One PR. Commits split by artifact type.

## Final checkpoint

Stop. Hand off to Nathan with:
- Full verification suite results.
- Deploy commands ready to run.
- 14-day monitoring plan.
- Rollback runbook.

This is the end of the build. Production rollout, full backfill on prod, and 14-day unattended validation are Nathan's responsibility.

---

# Closing notes for Claude Code

This is a big build — 10 phases, multiple weeks of focused work. Take it seriously. The non-negotiables matter; don't revert them. The codebase conventions matter; match them. The checkpoint gates matter; don't bulldoze.

If at any phase you discover the prompt is wrong about something in the codebase, **flag it loudly and stop**. Better to confirm with Nathan than to silently work around. He's been thoughtful about this design; he'll have an opinion on any meaningful deviation.

If a phase takes longer than expected, that's fine — split the PR within the phase, ship incrementally. Don't compromise quality for speed.

Use subagents liberally for independent work within a phase: deed-type audits, smoke tests, verification harnesses, documentation. They run in parallel; don't serialize what doesn't need to.

When in doubt, ask. There is no benefit to silently choosing wrong over visibly asking right.

Good luck.
