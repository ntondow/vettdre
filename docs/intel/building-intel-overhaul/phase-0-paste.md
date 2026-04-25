# Phase 0 Paste — Building Intelligence Overhaul

This file contains exactly the content you should paste into Claude Code as your initial prompt to kick off the build. It is the orientation + non-negotiable constraints + critical conventions + Phase 0 only — no later phases.

After Claude Code completes Phase 0 and you've reviewed the discovery report, paste the next phase from `building-intel-overhaul-prompt.md` (lines for Phase 1 onward).

---

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

11. **Extend, don't duplicate.** No parallel `CondoOwnership` engine. The condo lens and co-op lens are *narrower views* on the upgraded `data-fusion-engine`. New ownership data goes into `BuildingIntelligence.ownership` substructures.

12. **UI disclosure language matters.** For results, use: *"Current owner per ACRIS as of [last_refresh_timestamp]. ACRIS recording-to-publication lag is typically 3-5 days. Entity-owned units reflect the recorded entity, not beneficial ownership. Not a title search."* For condop / co-op buildings, the UI must explicitly state when individual apartment shareholders are not surfaced (per CLAUDE.md handling of structure detection).

13. **Coverage QA uses the free ACRIS DocumentSearch web UI** at `a836-acris.nyc.gov`, not PropertyShark. Their ToS prohibits scraping.

14. **Live-site integrity is paramount.** This is an upgrade to a production system that real users depend on, not a greenfield build. Every phase ships with: (a) a feature flag around the new behavior so it can be disabled without code revert (use the existing `feature-gate.ts` / `feature-gate-server.ts` infrastructure); (b) a smoke-test pass against the existing production-equivalent surfaces (`/dashboard`, `/market-intel`, `/terminal`, `/contacts`, `/messages`, `/calendar`, `/deals`) confirming no regression and no broken renders; (c) backward-compatible API contracts — any existing field on `BuildingIntelligence` or any existing `/api/*` route stays intact. If a phase introduces a breaking change to an existing API, removes a field from an existing response, modifies an existing table column, or alters an existing UI component's props, **STOP and confirm with Nathan before proceeding**. Schema migrations are additive only; existing tables get new nullable columns and new FK references, never destructive changes.

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
   - Hit `https://data.cityofnewyork.us/resource/8y4t-faws.json?$limit=5` and `https://data.cityofnewyork.us/resource/w7rz-68fs.json?$limit=5` — confirm both are live and document which is the current authoritative DOF Assessment dataset.

2a. **Verify the Deep Dive #3 datasets and access paths:**
   - Hit `https://data.cityofnewyork.us/resource/8h5j-fqxa.json?doc_type=LP&$limit=5` and same for `NOP`, `PREL`, `JPDN`. Confirm lis pendens are filed in ACRIS Legals under these doc types and document the actual codes returning data (the codes vary; confirm the live set).
   - Hit `https://data.cityofnewyork.us/resource/bnx9-e6tj.json?doc_type=MTGE&$limit=5` and same for `SAT`, `ASST`, `CEMA`, `SPM`. Confirm mortgage doc-types currently in use.
   - Visit `https://www.nyc.gov/site/finance/taxes/lien-sale-list.page` and document the current tax-lien-sale CSV publication URL pattern. If no clean CSV is available, flag for FOIL request as Phase 3 fallback.
   - Hit `https://www.ffiec.gov/npw/FinancialReport/CallReport` and confirm the FFIEC Call Reports public download path. Document the most recent quarterly release date.
   - Verify HPD Multiple Dwelling Registration (`tesw-yqqr`) and Contacts (`feu5-w2e2`) are live: `https://data.cityofnewyork.us/resource/tesw-yqqr.json?$limit=5`.
   - Verify NY DOS Active Corporations (`n8mn-d6c5`) returns data: `https://data.ny.gov/resource/n8mn-d6c5.json?$limit=5`.
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

