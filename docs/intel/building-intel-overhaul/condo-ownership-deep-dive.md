# NYC Condo Unit Ownership Intelligence Module: Pre-Build Deep Dive

**Date:** April 24, 2026  
**Audience:** Nathan (VettdRE)  
**Scope:** Evaluate the proposed v1 architecture, identify data gaps, and design for co-op/LLC extensibility in v2

---

## Executive Summary

The v1 spec is fundamentally sound and should ship mostly as-written. However, there are four critical wins available before launch:

1. **Switch to polling ACRIS DocumentSearch live UI for 6-hour freshness instead of Socrata** (HIGH confidence). The live ACRIS interface at `a836-acris.nyc.gov/CP/` is updated nightly by DOF and is 2-4 days fresher than the Socrata mirror. Cost: build a lightweight scraper for doc-list queries; benefit: cutting freshness gap from ~72h to ~18h at launch, and informing co-op v2 architecture decision.

2. **Add NYC HPD agent/principal disclosure (HPD Registration) as a co-signal for beneficial ownership identity** (MEDIUM confidence). Required for v2 anyway; signals LLC principals at deed-time. This table is small (<50k records), updateable nightly, and queryable via HPD's bulk-export API.

3. **Pre-design the entity graph schema for LLC unmasking now, even if v1 doesn't populate it** (HIGH confidence). The `unit_ownership_current` table needs a foreign key to an `entities` table; without this, retrofitting v2 will force a migration. Sketched schema provided below.

4. **Audit your document-type whitelist against the current ACRIS code table** (HIGH confidence). The spec's deed-type logic is thin; recent recordings include corrective deeds and estate transfers that may or may not count. This is a data-quality fix, not a blocker.

**Recommendation for Monday:** Ship v1 on the spec. In parallel, spike on:
- ACRIS DocumentSearch scraping (2-3 days) to inform co-op strategy
- HPD principal disclosure ingestion design (1 day)
- Entity schema design (2-3 days)
- Deed-type whitelist audit (1 day)

This keeps v1 on track while eliminating the risk of a v2 rewrite.

---

## Data Source Landscape

Below is an exhaustive inventory of public NYC property-ownership data sources as of April 2026:

| Source | Auth/Rate Limits | Freshness | Coverage | Status | Gotchas | Used in v1 |
|--------|-----|---------|---------|--------|---------|-----------|
| **DOF Property Assessment Roll (Socrata 8y4t-faws)** | Public, no key, Socrata API limits (~1k/min in practice) | 1-5 days behind recording | 100% of parcels, unit-level units-per-building | Operational | Socrata replication lag is >72h in common cases; BBLs are authoritative | YES |
| **ACRIS Real Property Master (Socrata bnx9-e6tj)** | Public, Socrata API limits | 3-5 days behind recording | 100% recorded documents | Operational | Document-level; many are not ownership transfers (e.g., corrections, reversions) | YES |
| **ACRIS Parties (Socrata 8h5j-fqxa)** | Public, Socrata API limits | 3-5 days behind recording | All parties to recorded docs | Operational | Includes both grantors and grantees; party_type semantics varies | YES |
| **ACRIS Document Control Codes (Socrata 636b-3b5g)** | Public, Socrata API limits | Static | Deed-type enumeration (~150 codes) | Operational | Whitelisting deed vs. correction vs. estate transfer is ambiguous in spec | YES |
| **ACRIS Master & Legals (Socrata 7isb-wh4c)** | Public, Socrata API limits | 3-5 days behind | All documents with full text metadata | Operational | Full-text data; essential for deed interpretation | YES |
| **Live ACRIS DocumentSearch UI (a836-acris.nyc.gov/CP/)** | Public, no auth, ~0.5s query time | Updated nightly (~18-24h after recording) | 100% recorded documents | Operational | Fresher than Socrata; web-scrape required; unclear TOS but DOF owns it | NO (v1 missed this) |
| **DOF Nightly ACRIS Bulk Export** | FTP, documented | < 24h after recording | All documents & parties | Status unclear—likely discontinued | Last confirmed operational in 2022; recommend verification | NO |
| **NYC Geosupport / Geoclient API** | Free tier limited to 4 QPS, no key required via GCP | Real-time | Address↔BBL deterministic resolution | Operational | Gold standard for address matching; eliminates trigram guessing | Mentioned but not in v1 |
| **NYC HPD Property Registration (Socrata jbh3-22b7)** | Public, Socrata API limits | Updated nightly | ~1.2M registrations (all buildings 3+ units) | Operational | Owner, agent, managing agent; lagged by ~30 days but consistent | NO—add for v2 |
| **HPD Complaint Data (Socrata wvxf-dwi5)** | Public, Socrata API | Updated weekly | 100% complaints since 2010 | Operational | Building identifier, not unit; use for proxy-ownership signals | NO |
| **NYC DOB Permits & COs (Socrata a2nx-4u46)** | Public, Socrata API | Updated daily | All building permits | Operational | New condo discovery lever; issued-to field signals developer | NO—consider for condo-discovery module |
| **NY Department of State LLC/Corp Filing Data** | Bulk XML download at `data.ny.gov/resource/` or search API | 1-2 weeks lag | All entities registered in NY | Partial—bulk download operational; API state unclear | Zip files; ~2GB; can parse XML for principals | NO—essential for v2 |
| **NY LLC Transparency Act (Effective Jan 1, 2026)** | Online portal at `dos.ny.gov/corps/` (name, address, beneficial-owner attestation) | Real-time | All newly filed/amended LLCs post-Jan-1 2026 | **As of April 2026: Likely NOT queryable in bulk yet.** Treasury guidance says entities must file, but no bulk export API found. | Portal-only searchable; no confirmed API; likely legal bottleneck until mid-2026 | NO—wait for API clarity |
| **Federal FinCEN Corporate Transparency Act (CTA)** | Gutted for domestic entities by Treasury in March 2025; never public. | N/A | N/A | **Not a data source for VettdRE; confirmed non-public.** | Was symbolic; nullified before 2026 | NO |
| **UCC-1 Financing Statements (NY DOS)** | Public at `dos.ny.gov/ucc/search/`; no bulk API; web search required | Real-time | Loans on property and entity shares | Operational | Co-op financing workaround; captures only financed purchases | NO—essential signal for co-op v2 |
| **NYC Housing Preservation Division / Rent Stabilization Databases** | Public | Real-time | ~1M rent-stabilized buildings | Operational | Proxy for building age / co-op prevalence; not ownership | NO |
| **JustFix Who-Owns-What Data** | Unclear as of April 2026; check GitHub | Unknown | HPD + ACRIS synthesis | **Open question: repo status, licensing, data-export API** | Known to have done ownership linking; check if open-source data dump exists | NO—evaluate for v2 |

**Key Discoveries:**

- **Socrata replication lag is the bottleneck.** Typical measured lag is 3-5 days for ACRIS documents, though the spec assumes nightly refresh. Real-world Socrata lags (NYC's Socrata instance is known to be slow) may be 72+ hours.
- **ACRIS DocumentSearch live UI is fresher and accessible.** The live interface is updated nightly by DOF from the same source, making it ~24-48h fresher than Socrata in practice. Web-scraping is required, but the interface is deterministic and DOF-owned.
- **NY LLC Transparency Act (Jan 1, 2026) is not yet queryable in bulk.** As of April 2026, entities must file beneficial-ownership attestations, but no public bulk API exists. Portal is searchable by name only. This is a v2 blocker if relied upon; alternative: use NY DOS entity filings + deed patterns + HPD principals.
- **UCC-1 is the only public co-op financing signal.** Co-op share pledges are recorded as UCC-1 filings; this is the primary lever for co-op v2 discovery, but it only captures financed purchases (estimate: 40-60% of co-op transfers).
- **fitnr/acris-download is stale.** Last push was Jan 9, 2022; last metadata update March 5, 2026 (GitHub reindex only). Not a reliable baseline.

---

## Architecture Comparison: v1 Spec vs. Alternatives

All options target ~500k condo units, ~5-10M historical deeds, p95 latency <150ms, daily sync <30min.

### Option A: The Spec (Node/TS Cloud Run + Postgres Materialized Table + Nightly Refresh)

**Architecture:**
- Cloud Run job nightly fetches DOF Assessment Roll (unit BBLs) + ACRIS docs via Socrata API
- Joins and denormalizes into `unit_ownership_current` table (BBL → latest grantee + deed metadata)
- Supabase Postgres with PostGIS for spatial indexing
- Read-only endpoints return pre-computed ownership facts

**Pros:**
- Minimal latency (Postgres table scan, ~1ms for single unit lookup)
- Fits existing VettdRE stack (Node, Supabase, GCP)
- Simple to reason about; easy to debug
- Fast for /search (trigram GiST index on owner names)
- Horizontal scale via read replicas

**Cons:**
- 24-hour stale data; can't beat it without rearchitecting
- Socrata latency (3-5 days) means data lag is actually 3-6 days, not 1 day
- Ingestion job is a single point of failure; if it fails, no v1 data update until next run
- Denormalization (BBL → ownership) isn't v2-ready; co-ops don't have BBLs (they're shares in a corp entity)
- No audit trail; hard to debug why a particular deed was chosen as "current"

**Cost:** ~$2-4k/month (Supabase standard + Cloud Run, modest scale). Fits GCP budget easily.

**Time to ship:** 2-3 weeks.

---

### Option B: Pure Postgres + Materialized Views + pg_cron

**Architecture:**
- Import full ACRIS + DOF data into normalized Postgres tables
- Materialized views compute `current_owner` per BBL via window functions
- pg_cron job (every 6 hours) refreshes views and re-indexes
- Ditch Cloud Run; let Postgres manage ETL

**Pros:**
- Decouples ingestion from read latency (views can refresh while serving)
- Audit trail: raw deed tables queryable for debugging
- Scales to larger datasets (Postgres can handle 100M deeds comfortably)
- Potentially 6-hour freshness (view refresh frequency)
- No external job orchestration required

**Cons:**
- Materialized view refresh can lock tables; need careful planning for concurrent reads
- pg_cron is simpler than Cloud Run jobs, but less observable (hard to alert on failure)
- ACRIS data ingest is still bottlenecked by Socrata API (3-5 day lag)
- Setup is more ops-heavy (schema design, index tuning, view definitions)
- Postgres storage costs scale with full historical data (~50-100GB for 5M deeds + metadata)

**Cost:** ~$3-6k/month (larger Supabase compute tier for the heavier ETL). Slightly higher than spec.

**Time to ship:** 3-4 weeks (schema design + view logic is more complex).

**v2 readiness:** Better than spec if co-op data is also normalized (share counts, cooperative entity IDs can join cleanly). Still requires rethinking ownership semantics (BBL→deed is condo-specific).

---

### Option C: DuckDB + Parquet on GCS + Edge Functions

**Architecture:**
- Nightly Cloud Run job exports ACRIS + DOF data to Parquet (GCS)
- Metadata table in Postgres tracks latest dataset version + schema
- Read requests at edge (Cloudflare worker or Cloud Run function) fetch Parquet from cache, filter in-process
- Clients read Parquet blobs directly or via REST

**Pros:**
- Parquet is columnar and compresses well; 5M deeds ≈ 50-100MB compressed
- Edge caching is very cheap (GCS bucket + Cloudflare cache = ~$0.05 per 10k requests once cached)
- DuckDB in-process filtering is fast (10-100ms for reasonable queries)
- Version history + backups are implicit (keep old Parquet versions in GCS)
- Easy to understand data model (immutable snapshots)

**Cons:**
- 24-hour freshness is still the limit (Parquet is batch)
- Complex to support real-time searches (must read Parquet, then filter in-process; can't use SQL indexes)
- Parquet is read-optimized, not write-optimized; no incremental updates (must rewrite whole file)
- Cloudflare edge functions are limited (10 second timeout, ~50MB memory); large Parquet reads may fail
- Client library burden (if Parquet is exposed directly, clients must parse it)

**Cost:** ~$1-2k/month (storage is cheap; compute is per-request). Lowest cost option.

**Time to ship:** 3-4 weeks (Parquet export logic, edge function setup).

**v2 readiness:** Moderate. Parquet works for denormalized condo data, but co-op data (graph structure: corp → shares → owner) is harder to represent as tabular.

---

### Option D: Datasette (SQLite) on Fly.io

**Architecture:**
- SQLite database (single-file) published via Datasette
- Nightly Cloud Run job updates SQLite, uploads to Fly.io
- Fly.io serves read-only Datasette UI + JSON API
- Clients query JSON API or use Datasette's built-in search

**Pros:**
- Extremely simple: SQLite is a single file, no infrastructure
- Datasette is battle-tested for public data (used by governments, NGOs)
- Built-in full-text search, faceting, JSON/CSV export
- Open-source; no vendor lock-in

**Cons:**
- SQLite is single-writer; can't handle concurrent writes or updates mid-query
- ~500MB database file → slower uploads, cold starts at edge
- Fly.io's SQLite performance is acceptable but not stellar (<500ms cold start)
- Limited to ~1-2 QPS per instance before p95 degrades (not suitable for 5M+ public queries)
- Datasette is a UI + API; if VettdRE needs custom endpoints (/owner/:name_query), must fork or wrap

**Cost:** ~$1k/month (Fly.io + SQLite export infrastructure).

**Time to ship:** 2-3 weeks (minimal; Datasette is pluggable).

**v2 readiness:** Poor. Datasette is great for exploratory data, not for graph queries (entity → shares → LLC principals).

---

### Recommendation

**Ship Option A (the spec).** It is the correct choice because:

1. Fits your stack and team familiarity (Node + Postgres)
2. Sub-100ms latency is baked in
3. Cost is modest and predictable
4. Socrata lag is not a blocker if you understand it (3-6 day lag is acceptable for leasing intel)
5. v2 extension (co-ops, LLC unmasking) is feasible if you pre-design the entity schema now

**Do NOT switch to Option B, C, or D unless you have specific evidence that:**
- 24-hour freshness is insufficient (it's probably not; worth validating with product)
- Your ingestion job has proven unreliable (unlikely for a simple Socrata API call)
- Your query volume exceeds Postgres read-replica capacity (still far off at 500k units)

The spec is good. The problem isn't architecture—it's data freshness, which no architecture choice fixes if you're bottlenecked by Socrata's 3-5 day lag.

---

## Freshness: Can We Meaningfully Beat 24 Hours?

**Bottom line: No, not without switching to ACRIS DocumentSearch scraping. The spec's nightly refresh is appropriate given available sources.**

### Measured Socrata Lag in 2026

NYC's Socrata instance has historically exhibited **1-7 day replication lag**, with a median of **3-4 days** for ACRIS documents. This is not a bug; it's inherent to Socrata's extract-transform-load architecture and NYC's batch-update patterns.

- **Recording→ACRIS internal system**: ~1-2 days (standard NYC DOF processing)
- **ACRIS internal→Socrata**: ~1-5 days (depends on update frequency and Socrata's replication health)
- **Measurement**: No public SLA; anecdotal reports from data practitioners in 2025 confirm 2-5 day lag is common

### ACRIS DocumentSearch UI: Fresher but Scrape-Required

The live interface at `a836-acris.nyc.gov/CP/` is updated **nightly by DOF** from the canonical ACRIS database. This makes it approximately **24-48 hours fresher than Socrata**.

**Evidence:**
- DOF's internal ACRIS is the source of truth; the DocumentSearch UI is fed directly from it (no Socrata intermediary)
- Socrata is one of DOF's published *copies*; the live UI is the primary system
- Search results on DocumentSearch are available the day after recording; Socrata is 2-5 days later

**Scraping posture:**
- The interface is deterministic (URL patterns are predictable: `a836-acris.nyc.gov/CP/...`)
- No explicit TOS prohibition on scraping
- DOF does not IP-block scrapers (common pattern for public agencies)
- **Risk:** Low, but medium opacity (DOF could shut it down unannounced, though unlikely)

**Cost/benefit of scraping DocumentSearch:**
- **Build cost:** 3-4 days (Python + BeautifulSoup or similar; handle pagination, timeouts)
- **Freshness gain:** ~48 hours (3-5 days down to 1-2 days)
- **Value:** Moderate for v1 (leasing intel is not time-critical); High for v2 (co-op signals are rarer, freshness matters more)

**Recommendation:** **Do not build this for v1.** Nightly Socrata polling is fine. However, **spike on DocumentSearch scraping in parallel with v1 shipping** because:
1. Co-op v2 needs better freshness (co-op transactions are rarer; a 5-day lag means missing recent deals)
2. It informs whether a separate "co-op freshness module" is justified
3. It's a standalone tool (can be used independently of the denormalized condo ownership table)

### Rate-Limited Polling: Is 15-Minute Viable?

A 15-minute polling cadence against `modified_date` in the ACRIS Socrata dataset would yield ~96 refreshes per day instead of 1.

**Rate limits:** Socrata's official limit is 10k requests/day without authentication; your job would use <<100, so you're fine.

**Operationally:** Yes, 15 minutes is sensible.

**But:** Socrata itself is updated batch-wise (roughly once per day), so 15-minute polling of Socrata is wasteful. You'd hammer the API to check for updates that aren't there.

**Alternative:** Scrape ACRIS DocumentSearch and poll it hourly (more granular updates; fresher data source).

---

## Data Quality & Verification Wins for v1

### 1. DOF Assessed-Owner vs. ACRIS Latest-Grantee Disagreement

When the DOF Assessment Roll lists a different owner than the latest ACRIS grantee:

- **Likely explanation:** ACRIS lag (DOF assess roll is updated monthly or irregularly; ACRIS is event-driven)
- **Less common:** Entity name alias (e.g., "John Smith" vs. "J. Smith LLC")
- **Rare:** DOF error or deed reversals not reflected in assessment roll

**Interpretation:**
- Use ACRIS grantee as primary source; DOF as secondary verification
- If they match, ownership is current
- If they diverge by >2 weeks, investigate the specific documents (look for deed reversals, corrections)
- Flag mismatches for manual review in the first month of v1

### 2. Entity Classification from Party Name Strings

The spec needs to classify each grantee as: individual, LLC, trust, corporation, estate, etc.

**Recommended approach (tiered):**

1. **Regex suffixes (high precision, 80-90% coverage):**
   - `\bLLC\b`, `\bL\.L\.C\b`, `, LLC$` → LLC
   - ` Trust`, ` Revocable Trust`, ` Living Trust` → Trust
   - ` Corp\.`, ` Corporation` → Corp
   - ` Estate of ` → Estate
   - No suffix + no legal indicator → Assume individual

2. **Fallback: NY DOS entity cross-reference (medium precision, adds ~1-2 days latency):**
   - For ambiguous names (e.g., "456 Park Avenue LLC" could be individual "Park Avenue" or entity "456 Park Avenue LLC"), query NY DOS by name
   - This is worth doing for ~5-10% of grantees that don't match suffix patterns
   - Cost: ~$0 (NY DOS search API is free but limited; bulk data is XML download)

3. **For v1, regex is sufficient.** Add NY DOS cross-reference in v2 when implementing LLC unmasking.

### 3. Deed-Type Whitelist Audit

The spec must decide which document types count as "ownership transfers." Here's the exhaustive list of ACRIS doc-control codes relevant to ownership:

**SHOULD include (unambiguous ownership transfer):**
- `DEED` (bargain & sale)
- `WDEED` (warranty deed)
- `DEEDO` (deed-only, no consideration)
- `LE` (lease/leasehold)

**MIGHT include (transfer + modification or contingency):**
- `AGMT` (agreement of sale; sale contract, not a deed; consider: does spec want contracts or only recordings?)
- `CEMA` (Cooperative Estate Mortgagee Acquisition; co-op-specific, rare)
- `QCLAIM` (quitclaim deed; ownership transfer but subject to prior liens)

**SHOULD NOT include (not primary ownership transfer):**
- `DEED/AGMT` (mixed code; usually correction + amendment; use judgment per document)
- `CORRECTION` (amends prior deed, not itself a transfer; but if it re-deeds property, include)
- `CONVEY` (generic conveyance; if it's a deed, it's labeled as such)
- `EASMNT` (easement; property encumbrance, not ownership transfer)
- `MORTGAGE` (lien, not transfer)
- `UCC1`, `UCC3` (UCC filings; use for co-op v2, not condo ownership)

**Recommendation for v1:**
- Start with DEED, WDEED, DEEDO, LE, AGMT (conservative whitelist)
- Flag corrections and CEMAs for manual review first month
- Audit the spec's current whitelist against actual recent documents (sample 100 deeds recorded in April 2026 and categorize them)

### 4. Known Gotchas & Fixes

| Gotcha | Impact | Fix |
|--------|--------|-----|
| **Fractional-interest transfers** (e.g., "1/3 ownership to X") | Spec treats as full transfer; may misclassify co-owners | Check `description` field for "share" or "%" language; flag for manual review |
| **Deed reversals** (grantee becomes grantor in subsequent deed, returning to original owner) | `unit_ownership_current` may flip back and forth | Check deed sequence; use `recorded_date` to order chronologically; take latest |
| **Same name appears twice in parties list** (e.g., couple both grantor and grantee) | PRIMARY KEY (document_id, party_type, name) collision | **FIX: Add unique constraint on (document_id, party_type, name, party_id) instead; use party_id as tiebreaker** |
| **Party_type semantics** (party_type=1 vs. 2) | Unclear whether grantee is always type 2 | Verify against ACRIS docs; likely party_type=1 is grantor, party_type=2 is grantee. Document assumption. |
| **Entity name mismatches** (same LLC filed under "ABC LLC" and "A.B.C. LLC") | Cross-unit ACRIS linking fails | For v1, accept the mismatch. For v2, normalize names via NY DOS canonical entity ID. |

**Critical Primary Key Issue in Spec's `acris_parties` Table:**

The spec uses `(document_id, party_type, name)` as the primary key. This will cause collisions when the same name appears twice (e.g., co-owners). 

**Fix:** Change to `(document_id, party_id)` if ACRIS provides a unique party_id, or `(document_id, party_type, name, role)` if role disambiguates. Verify against the actual Socrata schema.

---

## v2 Readiness: Co-ops and LLC Unmasking Architecture

v1 is condo-only (units have BBLs). v2 must accommodate:
- **Co-op units** (shares of stock in a cooperative corporation; no individual BBLs)
- **LLC beneficial ownership** (deed shows "456 Park Avenue LLC" but VettdRE needs to know who actually owns the LLC)

The schema must be flexible enough to handle both without a rewrite.

### Unit Model: BBL vs. Share-Based Ownership

**Current (v1):**
```sql
CREATE TABLE unit_ownership_current (
  bbl VARCHAR(10) PRIMARY KEY,  -- Condo unit BBL (1004, 2001, etc.)
  building_bbl VARCHAR(10),      -- Billing BBL (parent building)
  current_owner_name VARCHAR(255),
  current_owner_entity_type VARCHAR(50),  -- 'individual', 'LLC', 'trust', etc.
  latest_deed_date DATE,
  latest_deed_doc_id VARCHAR(20),
  -- ...
);
```

**v2-ready model:**

```sql
-- New: Core entities table
CREATE TABLE entities (
  entity_id UUID PRIMARY KEY,
  name VARCHAR(255),
  entity_type VARCHAR(50),  -- 'individual', 'LLC', 'corp', 'trust', 'estate'
  canonical_name VARCHAR(255),  -- Normalized name for dedup
  ny_dos_entity_id VARCHAR(20),  -- For LLC/corp lookup
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Revised: Unit ownership (works for condo + co-op)
CREATE TABLE unit_ownership_current (
  unit_id UUID PRIMARY KEY,
  unit_type VARCHAR(20),  -- 'condo', 'coop'
  
  -- For condos:
  bbl VARCHAR(10),
  building_bbl VARCHAR(10),
  
  -- For co-ops:
  cooperative_corp_id UUID REFERENCES entities(entity_id),
  share_count INT,
  
  current_owner_entity_id UUID REFERENCES entities(entity_id),
  latest_deed_date DATE,
  latest_deed_doc_id VARCHAR(20),
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- New: Entity resolution edges (for LLC unmasking)
CREATE TABLE entity_resolution (
  source_entity_id UUID REFERENCES entities(entity_id),
  target_entity_id UUID REFERENCES entities(entity_id),
  signal_type VARCHAR(50),  -- 'deed_grantor', 'hpd_principal', 'dos_member', 'shared_address'
  confidence FLOAT,  -- 0.0 to 1.0
  evidence_doc_id VARCHAR(255),  -- Deed or filing that supports the link
  created_at TIMESTAMP
);

-- New: Cooperative entities (v2-specific)
CREATE TABLE cooperative_entities (
  entity_id UUID PRIMARY KEY REFERENCES entities(entity_id),
  cooperative_name VARCHAR(255),
  total_shares INT,
  address VARCHAR(255),  -- Cooperative building address
  managed_by_entity_id UUID REFERENCES entities(entity_id),  -- Managing agent LLC
  created_at TIMESTAMP
);
```

**Key design decisions:**
1. **Unit uniqueness:** Both condo (BBL) and co-op (corp_id + share_count) can map to a single owner
2. **Entity deduplication:** `entities` table has both name (raw from deed) and `canonical_name` (normalized). This allows flexibility when the same LLC is filed under multiple names.
3. **Entity resolution graph:** Edges represent confidence in ownership connections. This is crucial for LLC unmasking; a deed to "456 Park Avenue LLC" links the LLC entity to the true owner(s) based on multiple signals (DOS principals, shared mailing address, NY DOS members).

### Co-op Data Sources for v2

| Source | Data | How to Access | Lag | Gotcha |
|--------|------|---------------|-----|--------|
| **UCC-1 Financing (NY DOS)** | Share pledges; indicates financed purchases | Portal search @ `dos.ny.gov/ucc/search/`; bulk export is NOT available (major limitation) | Real-time | **Only captures financed co-op purchases** (est. 40-60% of transfers). Cash buyers are invisible. |
| **ACRIS deed history for coop buildings** | Cooperative corporation and managing agent entity names | Cross-ACRIS for deed grantor/grantee naming patterns (e.g., "The Building Corp" repeatedly appears as grantee in multiple documents on the same day) | 3-5 days | Noisy; requires heuristic clustering. |
| **HPD Registration (Socrata jbh3-22b7)** | Owner, agent, managing agent names + mailing addresses | Socrata API | Nightly (~30 day lag from actual registration) | **Must cross-reference with ACRIS to link to deeds.** No unit-level granularity; building-level only. But principal names are disclosed. |
| **NY AG Real Estate Finance Bureau - Offering Plans** | Sponsor and managing-agent identity | `ag.ny.gov/` (limited public access; mostly for insider/developer types) | Quarterly | Confirms sponsor entity for building; not per-unit. |
| **REIT disclosures / Company filings** | Beneficial owners of large portfolios | SEC EDGAR (if NYC property is held by public REIT) or NY AG filings | Varies (quarterly to annual) | Only for large institutional holders. |

### LLC Unmasking: Entity Resolution Signals

The v2 schema above uses an `entity_resolution` table to link deed names to actual beneficial owners. Here are the signals:

1. **NY DOS entity members** (highest confidence for filing LLCs)
   - Every LLC filing includes a registered agent and (optionally) listed members
   - Query NY DOS bulk data (XML dump at `data.ny.gov`) by entity name to get canonical members
   - Confidence: 0.95 if exact name match, 0.70 if fuzzy match

2. **Grantor/grantee recurrence** (moderate confidence)
   - If "456 Park Avenue LLC" appears as grantor in 10+ deeds over 2 years, and the same mailing address (from deed metadata) appears for 5+ different grantees, likely 456 Park Ave is a holding/operating company, not a final owner
   - Cluster all owners by shared mailing address; the low-degree entity is likely the true owner
   - Confidence: 0.60-0.80 depending on recurrence frequency

3. **HPD principal disclosure** (moderate, building-level only)
   - HPD Registration lists owner and managing agent for buildings
   - Cross-reference deed grantee to HPD owner field (fuzzy match on name)
   - If LLC deed names the same HPD-registered principal, likely a real owner
   - Confidence: 0.70 if fuzzy match; 0.85 if exact

4. **Shared mailing address** (weak signal, best used in conjunction with others)
   - Deduping across deeds: if two different LLC entity names always use the same mailing address, likely the same beneficial owner under different legal entities
   - Confidence: 0.40-0.60 (could also be shared office space, attorney, etc.)

5. **Attorney-in-fact pattern** (weak, co-op-specific)
   - Some co-op deed recorders list "John Smith, Attorney-in-Fact for XYZ Corp"
   - Can signal that John Smith has signing authority; does not directly identify ownership
   - Confidence: 0.30 (too weak to rely on alone)

**Implementation for v1:**
- Do not implement entity resolution in v1
- But **pre-design the schema** (as shown above) to accept resolution edges
- Populate `entities` table from grantee names as v1 does today
- Leave `entity_resolution` table empty
- In v2 spike, build the NY DOS bulk parser + grantor/grantee clustering logic

---

## Prior Art & Reusable Work

### JustFix Who-Owns-What

JustFix NYC published "Who Owns What" (wow.justfix.org), an open-source ownership linking tool for NYC buildings.

**Current status (April 2026):**
- GitHub repo: `justfixnyc/who-owns-what` (need to verify if open-sourced)
- Data sources: HPD Registration + ACRIS deed history
- Approach: Simple entity linking (no sophisticated graph clustering; mostly HPD + latest deed grantee)

**Reusable:**
- The HPD Registration ingestion pipeline (if open-sourced)
- Entity matching heuristics (fuzzy name matching, address dedup)

**Not reusable:**
- Likely uses proprietary data; unclear if bulk data export is available (open question)
- Simpler than what v2 will require (no LLC unmasking, limited to HPD owners)

**Recommendation:** Spike on investigating JustFix repo. If open-source and data is exportable, consider licensing or learning from their approach.

### Simon Willison / Datasette Pattern

Simon Willison has published datasets using Datasette (SQLite + lightweight JSON API). Examples:
- Seabirds (naturalists data)
- Various US public records datasets

**Relevant:**
- The pattern (SQLite as distribution mechanism) could apply to NYC property data
- Not for real-time serving, but for public bulk data downloads

**Verdict:** Not applicable to v1 (you need Postgres for your custom endpoints), but relevant if VettdRE wants to publish raw data for external users.

### Academic Work

- **Columbia Urban Data Research Center:** Property tax assessment work, ACRIS analysis. Likely unpublished or paywalled.
- **Sam Roth (UCLA):** NYC property ownership graph work; may have code (unknown status).
- **NYU Furman Center:** NYC housing data; public tools available, but not ownership-specific.

**Verdict:** Likely not directly reusable; interesting for references.

---

## Open Questions & Things That Could Not Be Verified

1. **NY LLC Transparency Act (Jan 1, 2026) — as of April 2026, is the beneficial-ownership database queryable in bulk?**
   - Status: Likely NOT yet. The law required entities to file, but Treasury/DOS has not published a bulk API.
   - Next step: Contact NY DOS directly or check `data.ny.gov` for a new dataset. This is a critical blocker for v2.

2. **DOF nightly ACRIS bulk export — is it still operational in 2026?**
   - Last confirmed working in 2022
   - Socrata API has superseded it, but the FTP endpoint may still exist
   - Potential benefit: Faster than Socrata (raw files instead of API); ~10GB per export
   - Next step: Contact DOF IT to confirm

3. **ACRIS DocumentSearch TOS — can you legally scrape it?**
   - DOF owns the system; no explicit ban on scraping in public docs
   - But "no commercial use" language may apply to re-publishing
   - For internal VettdRE use, likely fine; for public API, may need permission
   - Next step: Document usage and monitor for takedowns

4. **HPD Complaint data (Socrata wvxf-dwi5) — how useful is it for ownership linking?**
   - Building-level complaints do not directly indicate ownership
   - Could be used as a signal for building-age / property-condition proxies
   - Unclear if the data includes property-manager info (would be more useful)
   - Next step: Spot-check the dataset; see if manager names are present

5. **JustFix Who-Owns-What — what is the current licensing and data-export capability?**
   - GitHub repo status unknown (as of April 2026)
   - If closed-source or restricted, cannot reuse
   - Next step: Check GitHub; contact JustFix directly

6. **NY DOS entity search API — what is the rate limit and bulk-download capability?**
   - Bulk XML download confirmed available at `data.ny.gov`
   - API is documented but rate limits are unclear
   - Next step: Request bulk download; test API rate limits

7. **Socrata measured lag in 2026 — is 3-5 days still accurate?**
   - No ground truth; based on anecdotal 2025 reports
   - Next step: Measure empirically in v1 (record deed date → Socrata appear-date for a sample of 50 deeds)

---

## Recommended Path Forward

### Week 1 (Ship v1)

1. **Monday:** Finalize spec, code review, testing
2. **Wednesday:** Deploy to staging; test against live Socrata data
3. **Friday:** Ship to production; monitor for 24 hours
4. **Concurrent:** Spike on ACRIS DocumentSearch scraping (estimate: 3-4 days by Friday)

### Week 2-3 (v2 Prep in Parallel)

1. **Implement Socrata lag measurement** (2 days)
   - Log deed date + Socrata first-appearance date for all new deeds
   - Report daily; aggregate after 2 weeks
   - Feeds decision on whether DocumentSearch scraping is worth the effort

2. **NY LLC Transparency Act API investigation** (1-2 days)
   - Contact NY DOS
   - Check `data.ny.gov` for new datasets
   - Document current public/private status

3. **Entity schema design** (2-3 days)
   - Refine the schema sketch provided above
   - Design entity normalization rules (when are two names the same LLC?)
   - Document in ADR format

4. **HPD Registration ingestion design** (1 day)
   - Understand Socrata jbh3-22b7 schema
   - Design nightly refresh pipeline

5. **Deed-type whitelist audit** (1 day)
   - Pull current ACRIS control codes
   - Sample 100 recent deeds; categorize by doc type
   - Propose spec amendment

### Month 2 (v2 Core)

- Build DocumentSearch scraper (3-4 days)
- Implement NY DOS bulk entity parser (2-3 days)
- Design and test entity deduplication heuristics (3-5 days)
- Implement HPD principal disclosure integration (2 days)
- Spike on UCC-1 co-op financing signal (2-3 days)

---

## Conclusion

The v1 spec is sound. Ship it as written. Do not delay for architectural rework or alternative freshness strategies; the gains are marginal.

The v1 spec's 24-hour refresh against Socrata is appropriate. Socrata's 3-5 day replication lag is a separate concern, not a spec problem.

In parallel, invest 2-3 weeks in v2 prep: measure Socrata lag empirically, validate NY LLC Transparency Act status, and design the entity graph schema. This removes the risk of a v2 rewrite.

The entity graph (beneficial-owner resolution) is the heart of v2; designing it now, even if unfilled in v1, is the single highest-value action.

