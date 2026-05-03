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
- **Lighthouse / runtime perf numbers.** Bundle size ≠ runtime perf. Z.1 is intentionally scoped to bytes-on-the-wire — see the **Core Web Vitals baseline** section below (added in Z.2) for runtime LCP/FCP/TTI/CLS/TTFB.

## Re-baseline triggers

Re-run `npm run analyze` and update this doc when:
1. A speed slice claims to have removed a heavy dependency (e.g. recharts, leaflet) — diff the top-10 chunks list.
2. A new route lands that's expected to be in the top 10 (e.g. a new dashboard or deal sub-page).
3. The analyzer toolchain itself changes (Turbopack-native analyzer ships, webpack mode goes away, etc.).
4. Quarterly anyway — Q3 baselines should be captured before any Q3 speed slices start.

---

# Core Web Vitals baseline

**Slice:** Z.2 — Lighthouse CI tooling + Web Vitals baseline
**Captured:** 2026-05-03
**Branch:** `chore/speed-z2-lighthouse-ci`
**Source:** `npm run lighthouse` (= `lhci collect`) against `npm run dev` on `http://localhost:3000`. Median of 3 runs per URL, desktop preset.

## Methodology

1. Start the dev server: `npm run dev` (Next 16 default = Turbopack).
2. Run `npm run lighthouse` — `lhci collect` measures the URL list in `lighthouserc.cjs` 3 times each, writing JSON + HTML reports to `.lighthouseci/` (gitignored).
3. Median of 3 is taken per metric to reduce noise. Cold-cache; no warm-up run.
4. `npm run lighthouse:report` opens the most recent HTML in a browser for ad-hoc investigation.

Threshold assertions are warn-only in this slice (Core Web Vitals "good" cutoffs: LCP < 2.5s, FCP < 1.8s, TTI < 3.8s, CLS < 0.1, TTFB < 800ms). Failing them does NOT exit non-zero — numbers are observational; threshold enforcement waits on calibration data + `z2-followup-ci-integration`.

## Compiler caveat (different from Z.1's caveat)

Z.1's bundle baseline measures a webpack-bundled view because `@next/bundle-analyzer` is webpack-only. Z.2's runtime baseline measures the Turbopack-served output of `npm run dev`, which is **the same compiler Cloud Run uses in production** (`next build` → Turbopack). So Z.2's numbers are directionally more representative of production runtime than Z.1's bundle numbers were of production bundle layout. The remaining gap: dev-server overhead (HMR, source maps, no minification) inflates absolute numbers vs production. Re-baseline against `npm run build && npm run start` once test user provisioning + a production-mode local run pattern is established (likely landing with `z0b-followup-verify-e2e-runs`).

## 10 priority routes — TBD pending test user provisioning

All 10 priority routes from Z.1 are auth-gated under `(dashboard)/`. Without a provisioned test user (deferred per `z0b-followup-verify-e2e-runs`), unauthenticated Lighthouse runs against these routes measure the redirect to `/login`, not the actual page. Numbers below are placeholders pending the auth path forward documented in `lighthouserc.cjs`.

| Route | LCP | FCP | TTI | CLS | TTFB | Perf score |
|---|---|---|---|---|---|---|
| `/dashboard` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/contacts` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/pipeline` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/messages` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/calendar` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/market-intel` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/deals` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/terminal` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/brokerage/transactions` | TBD | TBD | TBD | TBD | TBD | TBD |
| `/leasing/setup` | TBD | TBD | TBD | TBD | TBD | TBD |

## Public routes captured

These are the only routes reachable without authentication. Numbers prove the tooling works end-to-end and provide a partial baseline. Note these are **not** in the priority list — they're surfaces a typical agent rarely lives on. Sub-200ms TTFB and 100/100 perf score for `/login` and `/privacy` indicate the route-shell scaffolding is healthy; they're not optimization targets in themselves.

| Route | LCP | FCP | TTI | CLS | TTFB | Perf score |
|---|---|---|---|---|---|---|
| `/login` | 0.49s | 0.25s | 0.49s | 0.000 | 0.02s | 100/100 |
| `/leasing-agent` | 1.29s | 0.25s | 1.29s | 0.000 | 0.02s | 97/100 |
| `/privacy` | 0.37s | 0.29s | 0.37s | 0.000 | 0.02s | 100/100 |

All three are well within Core Web Vitals "good" thresholds. CLS is 0 across the board — no layout shift from these surfaces. `/leasing-agent` has the highest LCP (1.29s) due to its hero imagery + marketing copy; that's expected for a marketing landing page.

## Re-baseline triggers (Web Vitals)

Re-run `npm run lighthouse` and update this section when:
1. Test user provisioning lands (`z0b-followup-verify-e2e-runs`) — fill in the 10 TBD priority-route rows.
2. A speed slice claims to have improved a route's Core Web Vitals — diff the affected row.
3. A new route lands that's expected to be a top-10 priority surface (e.g. a new dashboard).
4. The Next.js compiler changes (e.g. webpack returns as default, Turbopack rendering pipeline overhauls) — the methodology assumption is invalidated.
5. Quarterly anyway — same cadence as the bundle baseline above.

## Auth path forward

Documented in detail at the top of `lighthouserc.cjs`. Summary:

1. Provision the test user (steps in `docs/playwright-setup.md`); set `PLAYWRIGHT_TEST_EMAIL` + `PLAYWRIGHT_TEST_PASSWORD` in `.env.local`.
2. Add `puppeteerScript: "lighthouse/auth-puppeteer.cjs"` to `lighthouserc.cjs`.
3. Write `lighthouse/auth-puppeteer.cjs` — small JS that navigates to `/login`, fills email + password from env vars, submits, waits for non-`/login` URL. Mirrors `tests/e2e/_setup/auth.ts`.
4. Uncomment the AUTH-GATED URLs in `lighthouserc.cjs` (or move them from the staged constant into `ci.collect.url`).
5. Re-run `npm run lighthouse`; replace TBD rows above with the median-of-3 numbers.

This work is bundled into whichever slice unblocks `z0b-followup-verify-e2e-runs` — both blockers share the test user as their gating dependency.

---

# Cold start baseline

**Slice:** Z.5 — Cloud Run cold start measurement (LAST Phase Z slice)
**Captured:** 2026-05-03 (scaffold) / TBD (measurements)
**Branch:** `chore/speed-z5-cold-start`
**Source:** Manual `curl https://app.vettdre.com/api/health` runs against the deployed Cloud Run service, post-Z.5-merge + post-deploy.

## Methodology

1. **Confirm Cloud Run scaling config:** `gcloud run services describe vettdre --region us-east1 --format="value(spec.template.spec.containerConcurrency, spec.template.metadata.annotations)"`. Should report `min-instances=0, max-instances=10` per `cloudbuild.yaml`.
2. **Force scale-to-0** if traffic is keeping the service warm: wait ~15-20 minutes of idle, OR set `--min-instances=0` explicitly via `gcloud run services update vettdre --region us-east1 --min-instances=0` (this is already the default; only needed if a prior slice changed it).
3. **Run #1 (cold):** `time curl -s https://app.vettdre.com/api/health | jq .` — record total request time + the `uptime_seconds` field from the response. `uptime_seconds < 5` → cold start.
4. **Wait ~20 minutes idle** between runs to ensure each starts cold. (Cloud Run typically scales down after ~15 min of zero traffic, but this varies; longer is safer.)
5. **Repeat for Runs #2-5.** Capture timestamps so the table reflects elapsed gaps.
6. **Compute median + p95** across the 5 cold measurements. Warm measurements (uptime_seconds > 60) are recorded but excluded from the cold-start aggregate.

## 5 cold-start measurements — TBD pending Nathan's post-merge runs

Numbers below are placeholders. Nathan fills them in via a separate commit on `main` post-Z.5-merge + post-deploy. Same TBD pattern as Z.2's auth-gated route table.

| Run | Timestamp (UTC) | Request latency (ms) | Response `uptime_seconds` | Classification |
|---|---|---:|---:|---|
| 1 | TBD | TBD | TBD | TBD (cold/warm) |
| 2 | TBD | TBD | TBD | TBD |
| 3 | TBD | TBD | TBD | TBD |
| 4 | TBD | TBD | TBD | TBD |
| 5 | TBD | TBD | TBD | TBD |

**Cold-start aggregate (5 runs):**

| Metric | Value |
|---|---|
| Median request latency | TBD |
| p95 request latency | TBD |
| Median `uptime_seconds` on first response | TBD |

## Decision tree (driven by median request latency)

This drives the Phase 1 keepalive decision. **Z.5 explicitly does NOT implement keepalive** — that's a Phase 1 scope decision based on these numbers.

- **Median < 1s:** cold start is not a bottleneck. **Skip the keepalive work entirely.** Phase 1 should not invest in Cloud Scheduler or `--min-instances=1` on this basis.
- **Median 1-5s:** keepalive is **optional**, depends on UX impact assessment. Phase 1 should decide based on:
  - User-perceived impact at the entry routes (do users frequently hit `/login` or `/dashboard` cold?)
  - Cost trade-off: `--min-instances=1` on a 1Gi/1CPU container ≈ $30-50/mo always-on; Cloud Scheduler keepalive (1 ping/min) is negligible.
- **Median > 5s:** keepalive is **likely required**. Phase 1 work item:
  - **Preferred:** Cloud Scheduler keepalive cron pinging `/api/health` every 5-10 min. Cheap; preserves auto-scaling on traffic spikes.
  - **Alternative:** `--min-instances=1` in `cloudbuild.yaml`. Higher cost, but eliminates cold starts entirely (not just on the keepalive path).
  - At this point, `z5-followup-unwrap-health-span` triggers — the Sentry span wrap on `/api/health` becomes noise once keepalive is pinging it ~1,440x/day.
- **Median > 15s:** **stop and investigate before any keepalive work.** Likely cause: Docker image bloat (`@googleworkspace/cli` global install adds significant time), Prisma client init lag, or Sentry SDK init blocking startup. Fix the root cause first; keepalive on a 15s startup is a band-aid, not a solution.

## Re-baseline triggers (cold-start)

Re-run the 5 measurements + update this section when:
1. `Dockerfile` changes (new global installs, base image bump, build steps reordered).
2. `cloudbuild.yaml` scaling config changes (`--memory`, `--cpu`, `--min-instances`).
3. A heavy server-side dependency lands (large npm install, native binary, large model file).
4. Cloud Run runtime version bumps (Google migrates underlying Node version or pod-init strategy).
5. Quarterly anyway — same cadence as the bundle and CWV baselines above.

## How to capture (Nathan's reference card)

```bash
# 1. Confirm scale-to-0 is in effect and wait for idle
gcloud run services describe vettdre --region us-east1 --format=yaml | grep -A1 minScale

# 2. (Optional) force scale-to-0 if needed
gcloud run services update vettdre --region us-east1 --min-instances=0

# 3. Wait ~20 min idle, then probe
echo "Run 1: $(date -u)" && time curl -s https://app.vettdre.com/api/health | jq .

# 4. Wait 20 min, repeat for runs 2-5
# 5. Edit the TBD table above with timestamps + latencies + uptime values
# 6. Compute median + p95 from the 5 runs
# 7. Match against the decision tree above; record any Phase 1 follow-up
```
