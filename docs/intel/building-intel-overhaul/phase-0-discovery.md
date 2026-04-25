# Phase 0 Discovery Report — Building Intelligence Overhaul

**Date:** 2026-04-24  
**Branch:** `feat/building-intel-overhaul` (clean tree, no Phase 1+ code yet)  
**Author:** Claude Code (read-only audit)

This report covers the four jobs Phase 0 asked for: dataset verification, codebase audit, ingest-job placement recommendation, and a risk register. Specific corrections to the build prompt are flagged inline; everything that was assumed-correct and verified-correct is also called out so Nathan doesn't have to re-check.

---

## 1. Confirmed dataset IDs (use these throughout the build)

All endpoints hit live on 2026-04-24. Sample queries via Socrata SODA + GeoSearch + FFIEC.

### Primary spine + condo-unit / address resolution

| Purpose | Dataset / endpoint | Status | Notes |
|---|---|---|---|
| **Condo unit BBL spine** | `eguu-7ie3` (Digital Tax Map: Condominium Units) | ✅ live | Returns `condo_base_boro`, `condo_base_block`, `condo_base_lot`, `condo_base_bbl`, `unit_boro`, `unit_block`, `unit_lot`, `unit_bbl`, `unit_designation`, `condo_number`, `condo_key`. Confirms the build-prompt's #1 correction. |
| **Address → BBL** | `geosearch.planninglabs.nyc/v2/search` | ✅ live | Sample `15 Central Park West` returns `properties.addendum.pad.bbl="1011147503"` and `bin="1087839"`. No API key. Use as primary. |
| **Rolling sales** | `usep-8jbt` (Annualized Rolling Sales) | ✅ live, current | Most recent `sale_date` = **2026-03-31**. Already in use in `data-fusion-engine.ts` line 135 (`ROLLING_SALES`). |
| **Old rolling sales** | `uzf5-f8n2` | ❌ **403 Forbidden** | Returns 403 on direct fetch. Stale ID. **`src/lib/nyc-opendata.ts` line 9 still references it** — deprecated file, see §2 below. |
| **DOF Property Valuation (current)** | `8y4t-faws` | ✅ live | Holds tax years 2023-2027 (count of 2027 records: 1.18M; 2026: 2.35M; etc.). Already wired (CLAUDE.md confirms). Primary verification spine for assessed/market value + assessment-roll owner. |
| **Old DOF assessment** | `w7rz-68fs` | ⚠️ stale | Most recent records are FY 2018/19. Do not use. |

### ACRIS family (deeds, mortgages, transfer tax, parties, legals)

| Purpose | Dataset | Status | Notes |
|---|---|---|---|
| ACRIS Master | `bnx9-e6tj` | ✅ live | 22.6M rows. Confirmed `doc_type` field present with these top counts: **MTGE 4.20M, DEED 3.63M, SAT 2.62M, ASST 2.20M, AGMT 0.92M, RPTT&RET 0.39M, RPTT 0.21M, PREL 0.12M, RETT 1.9k, CMTG 1.3k, SMTG 5.6k, MMTG 90, CONDEED 412, DEED COR 11.2k, DEED, TS 95k, DEED, LE 32k, DEEDO 30k, WSAT 7k, PSAT 4.5k**. **No `LP`, `NOP`, `JPDN`, `CEMA` records exist** (direct queries return `[]`). |
| ACRIS Legals | `8h5j-fqxa` | ✅ live | Fields: `document_id`, `borough`, `block`, `lot`, `unit`, `street_number`, `street_name`. **No `doc_type` field** — must join to Master to filter by doc type. |
| ACRIS Parties | `636b-3b5g` | ✅ live | Per-document grantor/grantee rows. Per-codebase comment in `terminal-ingestion.ts` line 358, party_type **1=buyer/grantee, 2=seller/grantor** (recently corrected; the v1 spec had this inverted). |
| ACRIS Document Control Codes | `7isb-wh4c` | ✅ live | Returns `record_type`, `class_code_description`, `party1_type`, `party2_type`. Use as the source for the dynamic deed-type whitelist (build-prompt rule #6). |

### Deep Dive #3 datasets

| Purpose | Endpoint | Status | Notes |
|---|---|---|---|
| HPD Multiple Dwelling Registrations | `tesw-yqqr` | ✅ live | Active records with `registrationenddate` running into Sep 2026. |
| HPD Registration Contacts | `feu5-w2e2` | ✅ live | Includes type=`CorporateOwner`, `Agent`, `HeadOfficer`, `Officer`, `SiteManager`, plus business address fields. |
| Property Exemption Detail | `muvi-b6kx` | ✅ live | Field `exmp_code` with codes (2231, 4600, 2191, 2351, …). The 421-a / J-51 / Article 11 mapping is **not self-evident from the data — needs the DOF data dictionary**. Flagged for Phase 5. |
| **Tax Lien Sale List** | `9rz4-mjek` | ✅ live | **Build prompt is wrong** — there IS a Socrata dataset (`Tax Lien Sale Lists`). FOIL request from Deep Dive #3 §2A is unnecessary. Sample row has `month`, `cycle`, `borough`, `block`, `lot`, `tax_class_code`, `building_class`, `house_number`, `street_name`, `zip_code`, `water_debt_only`. Also a sibling: `etp2-fnbu` (Tax Sales 2010-Current). |
| **Lis Pendens / Notice of Pendency** | ❌ **NOT IN ACRIS Master Socrata mirror** | ⚠️ blocker | Direct queries `?doc_type=LP`, `?doc_type=NOP`, `?doc_type=JPDN` against `bnx9-e6tj` all return `[]`. The Manus Deep Dive #3 §2B claim that lis pendens are filed in ACRIS Legals under those codes is **incorrect** — the Legals dataset has no `doc_type` field, and the doc-type values themselves are absent from the Master record set. **`PREL` exists but it stands for *Partial Release of Mortgage*, not Preliminary Notice of Pendency.** Lis pendens are filed in NYS County Clerk records (UCS / NYSCEF), not Socrata. **Phase 3 needs a different data source** — most likely NYSCEF scraping or NYS Court UCS API. |
| FFIEC Call Reports | `cdr.ffiec.gov/public/PWS/DownloadBulkData.aspx` | ✅ live | Bulk download confirmed. Latest update 4/15/2026. Tab-Delimited or XBRL formats. The marketing page `ffiec.gov/npw/FinancialReport/CallReport` 403s anonymously but the bulk endpoint works. |
| NY DOS Active Corporations | `n8mn-d6c5` | ❌ **dataset.missing** | The dataset ID in the build prompt is wrong. **The codebase already uses `n9v6-gdp6`** (`src/lib/ny-corporations.ts` line 19) and that endpoint is live (sample query returned BUTCHY'S WINE & SPIRITS, INC. and GRACE SEAFOOD CORP.). Use `n9v6-gdp6` everywhere. |

---

## 2. Codebase audit — confirmations and divergences

### Audit claim: `data-fusion-engine.ts` has a 14-source `DATASETS` constant

**Partially confirmed.** The constant has **15 keys**: `PLUTO, HPD_VIOLATIONS, HPD_COMPLAINTS, DOB_PERMITS, DOB_JOBS, HPD_REG, HPD_CONTACTS, HPD_LITIGATION, DOB_ECB, DOB_NOW, RENT_STAB, SPECULATION, RPIE, LL84, ROLLING_SALES` (`data-fusion-engine.ts` lines 120-136). The Phase-1 query barrel runs **14 parallel queries** (HPD_CONTACTS is fetched lazily after HPD_REG). So both numbers are right depending on what you count. Two notes:

- `RENT_STAB: "35ss-ekc5"` is annotated `// DEAD — dataset removed from NYC Open Data; heuristic used instead` (line 131). The query still fires; it just returns nothing.
- `DOB_PERMITS: "83x8-shf7"` differs from the legacy `nyc-opendata.ts` (which uses `ipu4-2vj7` at line 13) and from `terminal-datasets.ts` `DOB_NOW_JOBS` (`w9ak-ipjd`). All three are different intended datasets, but it's worth a Phase 0 note: `nyc-opendata.ts` is **stale** and not on the data-fusion-engine call path — it's only used by older non-modal search code paths (`searchSalesHistory`, `searchPermits`, `searchViolations`). Recommend leaving alone in Phase 1 to avoid scope creep; sweep for unused exports in Phase 9.

### Audit claim: HPD MDR is referenced in schema but not actively queried

**False.** HPD Registrations (`tesw-yqqr`) and HPD Contacts (`feu5-w2e2`) **are queried** in `data-fusion-engine.ts` lines 261, 400 (and in `cache-warming.ts` line 56, and `building-profile-actions.ts`). What is *not* yet built is the **operator-clustering layer** (the Deep Dive #3 §4 work — clustering by `managing_agent_name + address` across buildings). The raw rows are pulled per-BBL; cross-building aggregation is missing.

### Audit claim: There is no `Building` canonical table

**Confirmed.** `prisma/schema.prisma` has 90 models and 60 enums (CLAUDE.md says 72/34 — out of date; a Phase-0 followup is to refresh CLAUDE.md after Phase 1). None of these exist:

- `Building`, `Unit`, `Entity`, `EntityRelationship`, `Mortgage`, `TransferTax`, `TaxLien`, `LisPendens`.

What does exist for ownership-adjacent data:

- `ProspectingItem` (line 1140) — per-building rows from prospecting list (BBL + ownerName + lastSalePrice…), tenant-isolated.
- `Portfolio` (line 1313) and `PortfolioBuilding` (line 1335) — user-defined ownership groupings, tenant-isolated.
- `BuildingCache` (line 2442) — `(bbl, source)` keyed JSON cache, the Tier 3 of `cache-manager.ts`.
- `TerminalEvent` (line 3323) — per-event log with `bbl`, `borough`, `eventType`, `enrichmentPackage`, `aiBrief`, `metadata`. Indexed by BBL.
- `DatasetRegistry` (line 3415), `IngestionState` (line 3428) — per-dataset polling state.

So the audit is right about the absence of canonical tables. It's also right about fragmentation: the same BBL exists as a row in 4-5 different tables, none of them a foreign-key target.

### Audit claim: `entity-resolver.ts` does Levenshtein + Jaro-Winkler + containment

**Confirmed.** `levenshteinSimilarity`, `jaroWinklerSimilarity`, and a containment branch are all present (`entity-resolver.ts` lines 70-116, 281-332). It additionally has: address-from-LLC extraction, last-name/first-initial fallback for individuals, address normalization with NYC abbreviations + borough detection, and an optional Geocodio fallback (`normalizeAddressWithGeocodio` line 524). It does **not** parse beneficial owners from DOS filings — confirmed.

### Audit claim: `terminal-datasets.ts` defines `DatasetConfig` interface with `bblExtractor`, `eventTypeMapper`, `recordIdExtractor`

**Confirmed exactly.** The interface is at `terminal-datasets.ts` lines 14-27:

```ts
export interface DatasetConfig {
  datasetId: string;
  displayName: string;
  pollTier: "A" | "B" | "C";
  pollIntervalMinutes: number;
  timestampField: string | null;
  formatSinceDate?: (d: Date) => string;
  bblExtractor: (record: any) => string | null;
  eventTypeMapper: (record: any) => string | null;
  recordIdExtractor: (record: any) => string;
  eventTier: 1 | 2 | 3;
  category: string;
}
```

Plus an `IngestionState` Prisma row (`schema.prisma` line 3428) tracking `lastCheckedAt`, `lastRowsUpdatedAt`, `lastRecordTimestamp`, `recordCount`, `status`, `lastError`. The two-phase polling pattern (metadata `rowsUpdatedAt` check, then incremental `$where > lastRecordTimestamp`) is in `terminal-ingestion.ts` lines 84-156. ACRIS gets a special path (`pollAcris`, line 260) that joins Master → Legals → Parties.

### Other surprises worth flagging

- The codebase has a **`/screening/*`** namespace (tenant screening, with Plaid + IDV + payments) that is **not in CLAUDE.md** — added since the audit was written. Touches `/api/screen/[token]/*`. Mostly orthogonal to this overhaul, but the `data-fusion-engine` does feed parts of the Quick Screen (`market-intel/quick-screen-actions.ts`).
- A **mobile API surface** (`/api/mobile/*`, ~22 routes) exists and includes `/api/mobile/buildings` and `/api/mobile/scout` — these consume building data shapes. Any rename on `BuildingIntelligence` will hit them. Treat as a backward-compat boundary.
- `BuildingIntelligence` type (`src/lib/data-fusion-types.ts`) is huge (300 lines, 22 substructures: `property`, `ownership`, `corporateIntel`, `financials`, `energy`, `compliance`, `distressSignals`, `investmentSignals`, `comps`, `marketTrends`, `fannieMaeLoan`, `renovationEstimate`, `strProjection`, `liveListings`, `webIntelligence`, `contacts`, `raw`, etc.). The Phase-3 Deep-Dive-3 fields (`mortgages`, `distressSignals` already exists, `operatorCluster`, `sponsorPortfolio`, `lenderStressFlags`, `forcedSaleConfidence`) need to be **added as additional optional substructures** — never modify existing ones, per build-prompt rule #14.

---

## 3. Recommended ingest-job placement

**Recommendation: Extend `terminal-datasets.ts`. Do not create a new `/api/intel/ingest` route.**

Rationale:

1. The `DatasetConfig` pattern is already polymorphic enough — `eventTypeMapper` can return `null` for *non-event* datasets (HPD MDR snapshots, Property Exemption Detail) so they get persisted to `BuildingCache` / a new spine table without spawning a `TerminalEvent`. We just teach `pollStandardDataset` (or a sibling `pollSpineDataset`) to take a `kind: "event" | "spine"` discriminator.
2. We already have:
   - Cron infra (`/api/terminal/ingest`, `/enrich`, `/generate-briefs`, `/backfill`) hardened with `Bearer ${CRON_SECRET}` and Cloud Scheduler wiring (5 jobs).
   - Per-dataset `IngestionState` tracking with retry / error log.
   - Admin health UI at `/settings/admin/terminal/`.
   - A backfill harness in `terminal-backfill.ts`.
3. Splitting into a parallel `/api/intel/ingest` route would mean duplicating all of the above and maintaining two cron schedules. The cost outweighs the benefit.

What we *do* need (Phase 1-2 schema/code work, not Phase 0):

- Generalize `terminal-datasets.ts` so a `DatasetConfig` can declare `kind: "event" | "snapshot" | "join-driven"`. ACRIS already needs a special path; new datasets like RPTT, HPD MDR snapshots, and tax-lien lists will too.
- Add a `/api/intel/backfill` route variant *only* if we need a different cadence or longer timeouts than `/api/terminal/backfill` (likely not until Phase 3).
- Rename the cron job set conceptually — but keep the URLs stable. The Terminal feed will continue to read `TerminalEvent`; new spine writes go to new tables (Building, Mortgage, …) and reference the same orchestrator.

If we hit a case where a new dataset is purely a snapshot replication (e.g., the entire NY DOS dump), we may justify a dedicated `/api/intel/snapshot` endpoint. Decide that on a case-by-case basis, not preemptively.

---

## 4. Breaking-change candidates the build prompt does not fully account for

1. **Lis pendens datasource.** Phase 3 in the original build assumes `8h5j-fqxa` filtered by `doc_type IN ('LP','NOP','PREL','JPDN')`. As shown in §1 above, this returns nothing useful (PREL ≠ Notice of Pendency). **Phase 3 needs a redesign**: either (a) NYSCEF scraping (NY State Courts e-filing system), (b) NYS Court UCS public records API, or (c) defer lis-pendens entirely from v1 and rely on tax-lien + ACRIS satisfaction-of-mortgage gaps as distress proxies. Suggest discussing with Nathan before starting Phase 3.

2. **NY DOS dataset ID.** Build prompt says `n8mn-d6c5`; live ID is `n9v6-gdp6` (already in `ny-corporations.ts`). Use `n9v6-gdp6` throughout.

3. **Tax lien data is already public via Socrata** (`9rz4-mjek`). FOIL fallback in Phase 3 is unnecessary — saves a few weeks of waiting.

4. **`muvi-b6kx` exemption codes are opaque** — joining 421-a / J-51 / Article 11 / STAR by code requires the DOF data dictionary, which is published as a separate PDF. Phase 5 should budget time to ingest the dictionary as a typed constant (similar to the deed-type whitelist in build-prompt rule #6).

5. **`BuildingIntelligence` has 22 substructures and ~300 lines.** Adding `mortgages`, `operatorCluster`, `sponsorPortfolio`, `lenderStressFlags`, `forcedSaleConfidence` as optional substructures is straightforward, but the **`raw` substructure** (already a kitchen-sink) needs a new namespace (`raw.mortgages`, `raw.taxLiens`, `raw.lisPendens`) so we don't blow past Postgres JSON column limits — a single building's raw blob is already in the 100-200 KB range for active properties. Worth quantifying in Phase 1.

6. **Mobile API surface** is *not* mentioned in the build prompt. `/api/mobile/buildings` and `/api/mobile/scout` consume the `BuildingIntelligence` shape today. Add to Tier-A regression set. (Captured in `pre-build-baseline/README.md`.)

7. **Schema drift vs CLAUDE.md.** CLAUDE.md says 72 models / 34 enums; live count is 90 / 60. The `Screening`, `Mobile`, `ClientOnboarding` work added since the doc was last updated. Recommend a CLAUDE.md refresh as a Phase-0 cleanup commit, but **keep it out of this PR** (don't mix doc updates with the build prompt). Track separately.

8. **`nyc-opendata.ts` references `uzf5-f8n2` (line 9)** which now 403s. It's not on the hot path (only used by legacy `searchSalesHistory` etc.). If any code still calls it, the 403 silently returns `[]`. Phase 9 cleanup at the latest; flag for early sweep if grep shows any callers.

---

## 5. Live-site baseline

Captured in `docs/intel/building-intel-overhaul/pre-build-baseline/`:

- `README.md` — usage instructions + Tier A/B/C surfaces in scope for regression testing per phase, plus the API contracts that must stay backward-compatible.
- `route-inventory.txt` — 99 dashboard `page.tsx` routes + 75 `/api/*` routes (182 lines).
- `model-inventory.txt` — 90 models, 60 enums, full line-numbered list.
- `dataset-inventory.txt` — every Socrata dataset ID literal in the 6 core files we care about.

After every phase: regenerate the three `.txt` files, diff against the baseline, surface any *unexpected* delta. Expected (additive) deltas are explicitly listed in the README.

A real screenshot/HAR baseline of `/dashboard`, `/market-intel`, `/terminal`, etc. requires running the dev server (`npm run dev`) plus an authenticated session, which I can't do from this audit. **If Nathan wants visual baselines, capture them manually before greenlighting Phase 1**; otherwise the route-inventory diff is the working substitute and is what the regression checklist references.

---

## 6. Risk register (things that could go wrong; plan now)

| # | Risk | Likelihood | Phase | Mitigation |
|---|---|---|---|---|
| R1 | Phase 1 `Building` spine adoption breaks `Portfolio` / `PortfolioBuilding` / `ProspectingItem` joins | Med | P1 | Schema migration is **additive only** — add a nullable `buildingId` FK on existing tables, backfill in a separate job, never drop the legacy `bbl` text column. Live-site regression on `/portfolios`, `/prospecting`, `/properties` per phase. |
| R2 | `BuildingIntelligence` shape change ripples through 14+ Market Intel server actions, Terminal enrichment, Mobile API, PDF report | High | P2-P5 | Treat existing substructures as immutable in this overhaul. New data goes into new optional substructures. Type-check + smoke-test all 14 server actions per phase. |
| R3 | Lis pendens datasource doesn't exist in Socrata | High (already true) | P3 | Re-plan Phase 3 before implementing. Options: NYSCEF scraping (fragile), defer to v2, or substitute tax liens + outstanding-mortgage signals. Discuss with Nathan. |
| R4 | ACRIS Socrata replication lag (3-5 days documented in Deep Dive #1) means "current owner" is always stale | Cert | All | UI disclosure language per build-prompt rule #12. Add `last_refresh_timestamp` to every ownership read. Don't market as title-search-equivalent. |
| R5 | DOS-entity fuzzy matching (Phase 4 sponsor lineage) produces false positives that cluster unrelated buildings into the same operator network | High | P5 | Gate cluster confidence ≥ 80%; expose confidence in UI; allow user override. Pilot on 100 known operators before going broad. |
| R6 | `BuildingCache.data` JSON column grows unbounded as more sources are added | Med | P2+ | Move bulky raw payloads (mortgages, deed history) to dedicated tables instead of `BuildingCache`. Phase 1 schema decision. |
| R7 | New ingest jobs balloon NYC Open Data 403/throttle rate | Med | P2-P5 | Stagger via existing `BATCH_SIZE=5`/`BATCH_DELAY_MS=200` pattern. Honor the `isValidToken` guard in `terminal-ingestion.ts` (placeholder tokens cause 403). |
| R8 | OCR maturity-date recovery for mortgage riders (Deep Dive #3 §1) hits 40% recovery, not 60-70% | Med | P5 | Have a fallback: assume 30-yr amortization from recording date, flag confidence. Validate on 100-mortgage pilot before scaling. |
| R9 | Cloud Scheduler budget / Cloud Run cold starts | Low | All | Reuse the existing 5 cron jobs; add new datasets to existing `runIngestion(orgId)` orchestrator instead of new endpoints. |
| R10 | CLAUDE.md drift — model count, missing surfaces (`/screening/*`, mobile API) | Low | After P0 | Refresh CLAUDE.md in a separate cleanup PR after Phase 1 lands. |
| R11 | NYC Marriage Index, ICIJ Offshore Leaks, FEC OpenFEC, ProPublica 990s (Deep-Dive-2 Tier 1 plays) need rate-limit + caching strategy | Med | P6+ | Stub schema slots in Phase 1; defer external integrations to Phase 6+ as the build prompt sequences them. |
| R12 | NY Election Law § 3-103(5) voter rolls — accidentally referenced in a future spec doc | Low | All | Build-prompt rule #9 already addresses; reinforce in Phase 1 PR description. |

---

## 7. Verification gates check

- ✅ All key dataset endpoints responded with sample data (or were proven dead/missing).
- ✅ This discovery report is committed at `docs/intel/building-intel-overhaul/phase-0-discovery.md`.
- ✅ Live-site baseline captured at `docs/intel/building-intel-overhaul/pre-build-baseline/`.
- ✅ No code outside `docs/` was modified.

---

## 8. Recommended Phase-1 starting moves (for Nathan to approve)

1. **Confirm the lis-pendens redesign.** Decide before Phase 3 whether to NYSCEF-scrape, defer, or substitute.
2. **Adopt `n9v6-gdp6`** (NY DOS) and the `9rz4-mjek` (Tax Lien Sale Lists) Socrata datasets in the prompts going forward; they're correct and live.
3. **Phase 1 schema migration is additive only.** New tables (`Building`, `Unit`, `Entity`, …) plus nullable FKs on existing tables; never drop or narrow.
4. **Generalize `DatasetConfig`** with a `kind` discriminator before any new datasets land in `terminal-datasets.ts`.
5. **Capture visual baselines manually if desired.** The route inventory is sufficient for regression checks; visual baselines are a nice-to-have, not a blocker.

End of report. Awaiting Nathan's go/no-go before Phase 1.
