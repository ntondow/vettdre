# Pre-Build Baseline — Building Intel Overhaul

Captured **2026-04-24** before any Phase 1 code is written. Every subsequent phase regenerates this snapshot and diffs against it. Any *unexpected* delta = stop signal.

This is a **written record** of the existing surfaces (routes, components, server actions, schema models, dataset wirings). Screenshots/HAR captures require a running dev server — they will be added by the human reviewer if needed before Phase 1; the route inventory below is the authoritative reference for the regression-test checklist.

---

## How to use this baseline

For every phase ≥ 1:

1. Re-run the inventory commands at the bottom of this file.
2. Diff against the saved snapshot in `route-inventory.txt`, `model-inventory.txt`, and `dataset-inventory.txt`.
3. **Any of the following is a stop signal**:
   - An existing route disappears or changes path
   - An existing model is dropped or renamed
   - A field on `BuildingIntelligence`, `TerminalEvent`, `BuildingCache`, `Portfolio`, `PortfolioBuilding`, `ProspectingItem` is removed or its type narrowed
   - A dataset ID currently in use changes
   - Any `/api/*` route currently in use changes its method, response shape, or auth contract
4. **Expected** deltas (additive only) per the build prompt:
   - New models: `Building`, `Unit`, `Entity`, `EntityRelationship`, `Mortgage`, `TransferTax`, plus tax-lien / lis-pendens / operator-cluster / sponsor-portfolio tables in later phases
   - New dataset registrations in `terminal-datasets.ts`
   - New routes under `/market-intel/*`, `/terminal/*`, possibly a new `/intel/*` namespace
   - New nullable columns on existing tables

---

## Surfaces in scope for regression testing per phase

### Tier A — must-not-regress (user-facing core)

| Surface | Route | Why it matters |
|---|---|---|
| Dashboard home | `/dashboard` | Default landing page |
| Market Intel search | `/market-intel` | Heavy `data-fusion-engine` consumer; the building profile slide-over is the central artifact this overhaul rewrites |
| Terminal feed | `/terminal` | Real-time event feed; right panel reuses `BuildingProfile`; new ingest jobs land here |
| Terminal admin health | `/settings/admin/terminal` | Pipeline status — must continue to show all datasets healthy |
| Contacts list | `/contacts` | Common landing for CRM workflows |
| Contact dossier | `/contacts/[id]` | Building-aware enrichment surfaces |
| Properties hub | `/properties` | Aggregates Listings + Deals + Showings + ProspectingItems — touches `Portfolio`/`PortfolioBuilding` references |
| Portfolios | `/portfolios` | Direct consumer of `Portfolio` + `PortfolioBuilding`; first place a Building-spine migration could break |
| Prospecting | `/prospecting` | Direct consumer of `ProspectingItem` |
| Pipeline | `/pipeline` | Deal kanban — depends on `Deal` (not building data, but high-traffic) |
| Calendar | `/calendar` | High-traffic CRM surface |
| Messages | `/messages` | High-traffic CRM surface; isolated from this overhaul but verify rendering |

### Tier B — verify renders without errors (less affected)

`/brokerage/*` (16 sub-pages), `/leasing/*`, `/deals/*`, `/screening/*`, `/settings/*`, `/messages/templates`, `/brokerage/client-onboarding/*`.

### Tier C — public + auth pages (out-of-band, but smoke-test the build)

`/login`, `/signup`, `/pending-approval`, `/book/[slug]`, `/sign/[token]`, `/submit-deal/[token]`, `/leasing-agent`, `/chat/[configSlug]`.

---

## API contracts that must stay backward-compatible

These routes are called by the existing UI and/or the mobile app. Any change to their request/response shape needs explicit Nathan sign-off:

- `/api/terminal/ingest`, `/api/terminal/enrich`, `/api/terminal/generate-briefs`, `/api/terminal/backfill` (cron, Bearer-auth)
- `/api/cache` (admin cache ops)
- `/api/report/[bbl]` (single building PDF)
- `/api/vitality/refresh`
- `/api/mobile/*` (~22 routes — mobile app talks to these)
- `/api/onboarding/[token]/*`, `/api/screen/[token]/*` (public, token-auth)
- `/api/webhooks/stripe`, `/api/webhooks/plaid`, `/api/webhooks/idv/didit`
- `/api/twilio/*`, `/api/leasing/*`

---

## Server actions that consume the data-fusion engine

Anything that renames or repackages a field on `BuildingIntelligence` will ripple through these:

- `src/app/(dashboard)/market-intel/building-profile-actions.ts` — `fetchBuildingProfile(boroCode, block, lot)` is the legacy single-building entrypoint; still uses local dataset constants (PLUTO, HPD_VIOLATIONS, …) duplicated from `data-fusion-engine.ts`.
- `src/app/(dashboard)/market-intel/actions.ts`, `unified-search-actions.ts`, `ownership-actions.ts`, `enrichment.ts`, `graph-engine.ts`, `portfolio-engine.ts`, `recent-activity-actions.ts`, `comps-actions.ts`, `street-intel-actions.ts`, `quick-screen-actions.ts`, `neighborhood-actions.ts`, `bov-actions.ts`, `motivation-actions.ts`.
- `src/app/(dashboard)/market-intel/nys-actions.ts`, `nj-actions.ts` — sister modules that may share types.
- `src/lib/cache-warming.ts` — pre-warms `PLUTO` and `HPD_REG` only; new sources will likely want hooks here.
- `src/lib/terminal-enrichment.ts` — calls `fetchBuildingCritical` / `fetchBuildingStandard` / `fetchBuildingBackground` from `data-fusion-engine.ts`.

---

## Inventory snapshots (regenerate per phase)

`route-inventory.txt` — output of:
```
find src/app/\(dashboard\) -name 'page.tsx' | sort
find src/app/api -name 'route.ts' | sort
```

`model-inventory.txt` — output of:
```
grep -nE '^model ' prisma/schema.prisma
grep -cE '^model ' prisma/schema.prisma
grep -cE '^enum ' prisma/schema.prisma
```

`dataset-inventory.txt` — output of:
```
grep -nE '"[a-z0-9]{4}-[a-z0-9]{4}"' src/lib/data-fusion-engine.ts src/lib/terminal-datasets.ts src/lib/cache-warming.ts src/lib/nyc-opendata.ts src/app/\(dashboard\)/market-intel/building-profile-actions.ts
```

The first capture (this commit) is included as the three sibling files in this directory.
