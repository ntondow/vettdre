# VettdRE Intelligence Layer — NYC Condo Unit Ownership Module

**Handoff to Claude Code · Owner: Nathan · Status: v1 spec, ready to build**

## 1. What we're building

A new VettdRE intelligence module that returns verified, unit-level ownership of record for every NYC condominium unit — searchable by address, BBL, or owner name, returning the current owner, last sale date, last sale price, and transaction history per unit.

v1 scope: condos only. Co-ops are deferred to v2 (will require UCC-1 derivation — separate spec).

UX target: the smoothest/fastest search experience in the product. Data does not need to be live — a daily refresh is fine. Search must feel instant because it hits a pre-computed Postgres table, not ACRIS at query time.

## 2. Why this is achievable (the data reality)

Every NYC condo unit has its own tax lot with its own BBL (Borough-Block-Lot). Ownership transfers are recorded as deeds in ACRIS against those unit-level BBLs. This makes condo unit ownership authoritative and public — unlike co-ops, where shareholder transfers are not recorded in ACRIS.

The critical architectural gotcha: MapPLUTO does not contain individual condo unit BBLs. It aggregates them up to the billing lot (lots starting with `75xx`). Unit-level BBLs exist in the DOF Property Assessment Roll (RPAD/PTS), which is published as a separate NYC Open Data dataset. This is the #1 mistake to avoid — do not try to derive unit BBLs from PLUTO.

## 3. Data sources (all free, NYC Open Data / Socrata)

| Source | Dataset ID | Purpose |
|---|---|---|
| ACRIS Real Property Master | `bnx9-e6tj` | Document metadata (doc type, date, amount) |
| ACRIS Real Property Legals | `8h5j-fqxa` | Links documents to BBLs (unit-level) |
| ACRIS Real Property Parties | `636b-3b5g` | Grantor/grantee names per document |
| ACRIS Document Control Codes | `7isb-wh4c` | Doc type lookup (deed types, mortgages, etc.) |
| DOF Property Assessment Roll | `8y4t-faws` (current FY) | Unit-level BBLs, condo number, address, owner-of-record per tax roll |
| MapPLUTO | `64uk-42ks` | Billing BBL → parcel geometry, condo flag |

All accessible via Socrata SODA API: `https://data.cityofnewyork.us/resource/<dataset_id>.json`

Auth: App token only (free to register). No key needed for low-volume reads but rate-limited. Use an app token for the daily batch.

## 4. Join model (the heart of this build)

```
                    ┌─────────────────────────┐
                    │  DOF Assessment Roll    │  ← unit-level BBLs + condo_number
                    │  (unit BBLs per condo)  │
                    └────────────┬────────────┘
                                 │ BBL
                                 ▼
┌──────────────────┐   documentid   ┌────────────────┐   documentid   ┌──────────────────┐
│  ACRIS Legals    │◄───────────────│ ACRIS Master   │───────────────►│ ACRIS Parties    │
│  (BBL, doc_id)   │                │ (doc meta,     │                │ (grantor/grantee)│
│                  │                │  sale amount)  │                │                  │
└──────────────────┘                └────────────────┘                └──────────────────┘
```

Logic for "current owner of a unit":

1. Find all ACRIS documents where `legals.bbl = <unit_bbl>` AND `master.doctype` is a deed type (DEED, DEEDO, DEED, etc. — see doc codes).
2. Order by `master.docdate` DESC.
3. The most recent deed's grantee (party_type = 2) is the current owner of record.

Caveat to surface in UI: "Current owner of record per ACRIS as of [last_refresh_date]. Entity-owned units (LLCs, trusts) reflect the entity, not beneficial ownership."

## 5. Stack (matches existing VettdRE pattern)

- Ingest: Node/TypeScript on Google Cloud Run Jobs (same pattern as the DOS broker ingest)
- DB: Supabase (Postgres + PostGIS)
- Scheduler: Cloud Scheduler → Cloud Run Job, daily at 04:00 ET
- API: Next.js API route on the existing VettdRE app, `/api/v1/condo-ownership/*`
- UI: New VettdRE module at `/intel/condo-ownership`, single search bar with autocomplete

## 6. Database schema (Supabase)

Create a new schema `condo_ownership` to keep this namespaced away from LandScope/DOS broker tables.

```sql
-- Raw ACRIS mirror (normalized for query speed)
create table condo_ownership.acris_master (
  document_id      text primary key,
  record_type      text,
  crfn             text,
  recorded_borough smallint,
  doc_type         text,
  document_date    date,
  document_amount  numeric,
  recorded_datetime timestamptz,
  modified_date    timestamptz,
  good_through_date date,
  raw              jsonb
);

create table condo_ownership.acris_legals (
  document_id      text,
  record_type      text,
  borough          smallint,
  block            int,
  lot              int,
  bbl              text generated always as (
    lpad(borough::text,1,'0') || lpad(block::text,5,'0') || lpad(lot::text,4,'0')
  ) stored,
  easement         text,
  partial_lot      text,
  air_rights       text,
  subterranean_rights text,
  property_type    text,
  street_number    text,
  street_name      text,
  unit             text,
  primary key (document_id, borough, block, lot, unit)
);
create index on condo_ownership.acris_legals (bbl);
create index on condo_ownership.acris_legals (document_id);

create table condo_ownership.acris_parties (
  document_id      text,
  record_type      text,
  party_type       smallint,   -- 1 = grantor, 2 = grantee
  name             text,
  address_1        text,
  address_2        text,
  country          text,
  city             text,
  state            text,
  zip              text,
  primary key (document_id, party_type, name)
);
create index on condo_ownership.acris_parties (document_id);
create index on condo_ownership.acris_parties using gin (to_tsvector('simple', name));

-- Unit-level BBL registry (the spine of the product)
create table condo_ownership.condo_units (
  bbl              text primary key,
  borough          smallint not null,
  block            int not null,
  lot              int not null,
  condo_number     int,
  billing_bbl      text,            -- 75xx parent
  building_address text,            -- from assessment roll
  unit_number      text,            -- apartment number
  building_class   text,
  assessed_owner   text,            -- per DOF roll (may lag ACRIS)
  source_fy        int,             -- fiscal year of roll
  last_refreshed   timestamptz default now()
);
create index on condo_ownership.condo_units (billing_bbl);
create index on condo_ownership.condo_units (building_address);

-- Denormalized lookup table (this is what the search endpoint hits)
create table condo_ownership.unit_ownership_current (
  bbl                  text primary key references condo_ownership.condo_units(bbl),
  building_address     text,
  unit_number          text,
  billing_bbl          text,
  condo_number         int,
  current_owner        text,
  current_owner_type   text,          -- 'individual' | 'llc' | 'trust' | 'corp' | 'unknown'
  last_deed_doc_id     text,
  last_sale_date       date,
  last_sale_price      numeric,
  grantor_name         text,
  owner_mailing_address text,
  deed_count           int default 0,
  last_refreshed       timestamptz default now()
);
create index on condo_ownership.unit_ownership_current (building_address);
create index on condo_ownership.unit_ownership_current using gin (to_tsvector('simple', current_owner));
create index on condo_ownership.unit_ownership_current (billing_bbl);

-- Full transaction history per unit (for the detail card)
create view condo_ownership.unit_transaction_history as
select
  l.bbl,
  m.document_id,
  m.doc_type,
  m.document_date,
  m.document_amount,
  string_agg(case when p.party_type = 1 then p.name end, ' / ') as grantor,
  string_agg(case when p.party_type = 2 then p.name end, ' / ') as grantee
from condo_ownership.acris_legals l
join condo_ownership.acris_master m on l.document_id = m.document_id
left join condo_ownership.acris_parties p on m.document_id = p.document_id
group by l.bbl, m.document_id, m.doc_type, m.document_date, m.document_amount
order by m.document_date desc;
```

## 7. Ingest pipeline

Two jobs, both as Cloud Run Jobs:

**Job A: `condo-units-refresh` (weekly, Sunday 03:00 ET)**

1. Fetch DOF Assessment Roll from Socrata, filtered to condo unit lots:
   - `$where=lot >= 1001 and lot <= 7499` (condo unit lots are typically in this range; adjust per borough — validate with sample queries)
   - Building class codes starting with `R` (R0, R1, R2, R3, R4, R6, R9 for condos)
2. Upsert into `condo_units`.
3. Log row counts per borough for drift monitoring.

**Job B: `acris-incremental-sync` (daily, 04:00 ET)**

1. Fetch ACRIS Master where `modified_date > (last successful run - 2 days)` for safety overlap.
2. For each changed `document_id`, refetch the corresponding rows from Legals and Parties.
3. Upsert into the three raw tables.
4. Recompute affected rows in `unit_ownership_current`:
   - For each `bbl` touched by the sync, re-derive the current deed (latest doc_date where doc_type is in the deed whitelist).
   - Upsert the new "current owner" row.
5. Log deltas (new units, ownership changes) for the daily email digest.

**Doc type whitelist for "sale deeds"**

Pull from `document_control_codes` dataset and whitelist only:

- `DEED` (Deed)
- `DEED, LE` (Life Estate)
- `DEEDO` (Deed, Other)
- `EASE` — exclude (easement)
- `MTGE` — exclude (mortgage)
- Exclude all non-deed doc types

Maintain this whitelist as a config constant, pulled from the codes dataset on build.

**Backfill (one-time, first run)**

Full historical ACRIS ingest is ~50M+ rows. Two options:

1. **Recommended for v1**: Backfill only deeds from 2000 onward (covers effectively all current owners). Chunk by `recorded_borough` and `document_date` in monthly windows. Estimate: ~6-10 hours on a single Cloud Run Job with 4GB RAM.
2. Alternate: Pull the bulk CSV mirror from the fitnr/acris-download GitHub tool (faster initial load), then switch to Socrata incremental.

## 8. API endpoints

All under `/api/v1/condo-ownership/`:

```
GET  /search?q=<string>&limit=20
  → Smart search. Detects input type:
    - 10-digit BBL → exact lookup on unit_ownership_current.bbl
    - Address fragment → ILIKE / trigram match on building_address
    - Name-like string → full-text search on current_owner
  → Returns: [{bbl, building_address, unit_number, current_owner, last_sale_date, last_sale_price}]

GET  /unit/:bbl
  → Full detail card: current owner + full transaction history + links to ACRIS docs
  → Returns: {unit: {...}, current: {...}, history: [...]}

GET  /building/:billing_bbl/units
  → All units in a condo building, ordered by unit_number (natural sort)
  → Returns: [{bbl, unit_number, current_owner, last_sale_date, last_sale_price}]

GET  /owner/:name_query
  → All units owned by a person/entity (fuzzy name match, threshold configurable)
  → Returns: [{bbl, building_address, unit_number, ...}] ordered by last_sale_date desc
```

All endpoints are read-only, cached at the edge (Cloudflare) with a 1-hour TTL since data only changes once daily anyway.

## 9. UI module

Route: `/intel/condo-ownership`

Layout:

- Single prominent search bar at the top, full width, autocomplete enabled.
- Autocomplete hits `/search` with debounce 150ms, shows up to 8 suggestions grouped by type (Address / Owner / BBL).
- Result view is a table: Address | Unit | Current Owner | Last Sale Date | Last Sale Price.
- Clicking a row opens a right-side drawer with the full unit detail: transaction history timeline, ACRIS doc links (format: `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=<document_id>`), owner mailing address flag (if different from property address → "investor/out-of-building" badge).
- Export: CSV download of current result set.

Match the existing VettdRE Terminal dark UI. Use shadcn `Command` for autocomplete, `Table` for results, `Sheet` for the detail drawer.

## 10. Performance targets

- Search endpoint p95 latency: < 150ms
- Autocomplete p95: < 80ms
- Daily ACRIS sync: completes in < 30 min
- Coverage at launch: 100% of NYC condo units that exist in the current DOF assessment roll
- Staleness tolerance: 24 hours for new deeds (acceptable; ACRIS itself has recording lag of days to weeks)

## 11. Out of scope for v1 (explicit)

- Co-op ownership (v2 — UCC-1 derivation)
- Beneficial ownership behind LLCs (not practical with public data)
- Historical time-series of ownership changes in aggregate (can be queried from transaction history view, but no dashboards)
- Tax lien / foreclosure overlays (future module)
- Mortgage detail / lender data (future — already ingested in raw tables, just not surfaced)
- NJ/CT coverage (NYC only for v1)

## 12. Compliance / disclosure notes

- All data is public record sourced from NYC DOF and NYC Open Data. No FCRA concerns (this is not consumer data).
- Display a footer on every result: "Source: NYC ACRIS and DOF Property Assessment Roll. Last refreshed [timestamp]. Not a title search."
- Do not advertise this as a substitute for a title report. Internal leasing intel use only; if we expose externally, add a ToS.

## 13. Success criteria for v1

- [ ] Nathan can search "15 Central Park West" and see all 201 units with current owners.
- [ ] Nathan can search "Sting" (or any owner name) and see all units owned under that name.
- [ ] Nathan can search any 10-digit BBL and land directly on the unit detail card.
- [ ] Daily sync runs unattended for 14 consecutive days without intervention.
- [ ] Coverage QA: random sample of 50 condo units matches PropertyShark for current owner (target: ≥95% match rate; diffs should be explainable by recording lag).
