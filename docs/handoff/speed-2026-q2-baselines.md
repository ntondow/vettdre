# Foundation/Speed Audit — Q2 2026 Baselines

**Slice:** Z.1 — Bundle analyzer baseline
**Captured:** 2026-05-03
**Branch:** `chore/speed-z1-bundle-analyzer`
**Source:** `npm run analyze` (which runs `ANALYZE=true next build --webpack`) on `main` HEAD as of 2026-05-03.

## Purpose

Pin a single set of "Day 0" numbers so every later Foundation/Speed slice can claim a measurable delta against a known anchor. If a future slice removes a heavy dependency, deletes a route, or reorders chunks, the diff against this file is the proof — the same pattern Phase 3 of the BMS overhaul used for the typecheck (515) and lint (4484) baselines.

## How to reproduce

```bash
npm run analyze
# → builds with webpack and emits .next/analyze/{client,nodejs,edge}.html
# → also extracts numbers below from .next/analyze/client.html via:
#     window.chartData = [...]   (chunk-by-chunk parsed/gzip sizes)
# → pages chunks live under static/chunks/app/<group>/<route>/page-*.js
```

The HTML reports are gitignored under `.next/`. To re-investigate, run `npm run analyze` and open `.next/analyze/client.html` in a browser.

## Known limitation: webpack vs Turbopack

**As of 2026-05-03, Next.js 16.1.6's default `next build` uses Turbopack, not webpack.** `@next/bundle-analyzer` only wraps webpack — it produces no report under Turbopack. The `npm run analyze` script forces the legacy webpack path via `next build --webpack` so the analyzer has something to instrument. Implications:

1. **The numbers below reflect a webpack-bundled build, not the production-default Turbopack build.** Chunk splitting strategies differ between the two compilers, so byte-for-byte comparisons against a Turbopack-built artifact (e.g. on Cloud Run) will not align. The relative ranking — i.e. which routes are heaviest — should still be directionally correct.
2. If a future slice migrates the analyzer to a Turbopack-native tool (Vercel has a `next experimental-analyze` in flight as of this writing), revisit this doc and re-baseline. Until then, future speed slices should use `npm run analyze` to delta against this file.
3. Production builds (Cloud Run via cloudbuild.yaml → `next build`) continue to use Turbopack. Nothing in this slice changes that.

## Top-line client bundle stats

| Metric | Value |
|---|---|
| Total client chunks | **316** |
| Total parsed (uncompressed) | **7.25 MB** |
| Total gzip-compressed | **2.10 MB** |
| Per-route page chunks (under `static/chunks/app/`) | **121** |
| Heaviest single chunk (gzip) | 135.1 kB — `static/chunks/2170a4aa.*.js` |
| Heaviest page chunk (gzip) | 33.1 kB — `/(dashboard)/deals/new/page-*.js` |

## Top 10 chunks by gzip size

These are the shared/vendor chunks that dominate the app shell. Most are pulled in by every dashboard route via the layout, so shrinking any of them moves every First Load JS number simultaneously.

| Rank | Gzip | Parsed | Chunk |
|---:|---:|---:|---|
| 1 | 135.1 kB | 402.1 kB | `static/chunks/2170a4aa.d28be3e2076c7818.js` |
| 2 | 128.4 kB | 418.3 kB | `static/chunks/8105-30451cdbceb5beaf.js` |
| 3 | 123.7 kB | 395.9 kB | `static/chunks/main-f856f56adbe9d4a3.js` |
| 4 | 106.4 kB | 357.2 kB | `static/chunks/7474-903343e083fe7222.js` |
| 5 | 101.6 kB | 322.4 kB | `static/chunks/164f4fb6-be710a8ad25b1e65.js` |
| 6 | 93.5 kB | 322.8 kB | `static/chunks/9b0008ae.46d37e5c5b722db8.js` |
| 7 | 90.4 kB | 323.2 kB | `static/chunks/8187f03c.a769a888e6bdbcd1.js` |
| 8 | 60.9 kB | 193.8 kB | `static/chunks/4bd1b696-e5d7c65570c947b7.js` |
| 9 | 58.4 kB | 185.3 kB | `static/chunks/framework-81b2e59ffe13bb24.js` |
| 10 | 55.3 kB | 276.3 kB | `static/chunks/679-0666b201a5984cbf.js` |

Hashes change every build; track by rank/size, not filename.

## Top 10 priority routes

These are the 10 routes the audit prompt called out as the load-bearing surfaces. Sizes below are the **page-level chunk only** (`static/chunks/app/<route>/page-*.js`) — they exclude shared framework + vendor chunks above. First Load JS = page chunk + the shared chunks the route imports; webpack analyzer doesn't expose that aggregate in its JSON for this report version, so per-route First Load JS will be re-captured in a follow-up slice if needed.

| Route | Page-chunk gzip | Page-chunk parsed | Notes |
|---|---:|---:|---|
| `/dashboard` | 7.7 kB | 31.2 kB | Stat tiles + recent activity. Within shared chunks; plenty of room. |
| `/contacts` | 7.9 kB | 37.6 kB | List view. `/contacts/[id]` dossier is **17.8 kB / 94.1 kB** — second-heaviest page chunk among non-deal routes. |
| `/pipeline` | 0.4 kB | 0.7 kB | Wrapper only — actual kanban lives in `/deals/pipeline` (**7.3 kB / 25.5 kB**). |
| `/messages` | 19.7 kB | 79.2 kB | Three-pane Gmail view + bulk actions. Heaviest non-deal-non-market dashboard route. |
| `/calendar` | 10.9 kB | 47.6 kB | Four-view calendar + Google sync UI. |
| `/market-intel` | **31.1 kB** | **135.0 kB** | Map + 4 search modes + 17 NYC API integrations. **#2 heaviest page chunk.** Top candidate for code-split / dynamic import. |
| `/deals` | 0.4 kB | 0.7 kB | Wrapper. `/deals/new` (workspace creation) is the **single heaviest page chunk: 33.1 kB / 140.6 kB**. |
| `/terminal` | 16.1 kB | 59.4 kB | Bloomberg-style feed + dark theme + filter sidebar. Reuses `BuildingProfile` via dynamic import (good). |
| `/brokerage/transactions` | 6.7 kB | 26.6 kB | Pipeline list. `/brokerage/transactions/[id]` detail is 11.2 kB / 57.7 kB. |
| `/leasing/setup` | 8.1 kB | 26.6 kB | Onboarding wizard. Bulk import sub-route adds another 6.8 kB. |

## Other notable heavy page chunks

Surfaces that aren't in the top-10 priority list but are large enough to flag for future slices:

| Route | Page-chunk gzip | Page-chunk parsed |
|---|---:|---:|
| `/(dashboard)/deals/new` | 33.1 kB | 140.6 kB |
| `/(dashboard)/contacts/[id]` | 17.8 kB | 94.1 kB |
| `/screen/[token]` | 15.5 kB | 66.1 kB |
| `/(dashboard)/brokerage/deal-submissions` | 13.4 kB | 61.6 kB |
| `/(dashboard)/brokerage/invoices/bulk` | 13.0 kB | 48.1 kB |
| `/(dashboard)/brokerage/listings` | 12.4 kB | 55.8 kB |
| `/(dashboard)/brokerage/agents/[id]` | 12.2 kB | 59.8 kB |
| `/(dashboard)/leasing` | 12.2 kB | 48.4 kB |
| `/(dashboard)/settings/automations` | 11.5 kB | 45.8 kB |

## What's deliberately NOT in this baseline

- **Per-route First Load JS aggregate** (page chunk + shared chunks). Next.js 16's build CLI no longer prints the per-route size summary, and the analyzer's `client.html` for this report version doesn't expose `window.entrypoints` data. A follow-up slice can either parse the build-time `pages-manifest.json` + `app-build-manifest.json` to compute First Load JS, or wait for the Turbopack-native analyzer.
- **Server bundles.** `nodejs.html` (3.3 MB report) and `edge.html` (341 kB report) were captured for completeness but are not summarized here — server bundle weight has different optimization levers (cold-start, Cloud Run unzipped size limit) and warrants its own slice.
- **Lighthouse / runtime perf numbers.** Bundle size ≠ runtime perf. Z.1 is intentionally scoped to bytes-on-the-wire; runtime profiling is a separate audit.

## Re-baseline triggers

Re-run `npm run analyze` and update this doc when:
1. A speed slice claims to have removed a heavy dependency (e.g. recharts, leaflet) — diff the top-10 chunks list.
2. A new route lands that's expected to be in the top 10 (e.g. a new dashboard or deal sub-page).
3. The analyzer toolchain itself changes (Turbopack-native analyzer ships, webpack mode goes away, etc.).
4. Quarterly anyway — Q3 baselines should be captured before any Q3 speed slices start.
