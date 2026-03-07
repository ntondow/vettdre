# Sentiment Intelligence Terminal — Process Map

> **Purpose:** Step-by-step build guide for the VettdRE Sentiment Intelligence Terminal.
> Each task includes the exact files to create/modify, dependencies, acceptance criteria, and integration points.
> This document is the source of truth for implementation sequencing.

---

## Phase 1: Foundation (Weeks 1–6)

### 1.1 Database Schema & Types
**Duration:** 3 days | **Dependencies:** None | **Gate:** `npx prisma migrate dev` succeeds

#### Tasks:
1. **Add enums to `prisma/schema.prisma`**
   - `SentimentSource`: TIKTOK, X, REDDIT, GOOGLE_TRENDS, NEWS, YOUTUBE, JOBS, UHAUL, LISTINGS, INSURANCE, YELP, MOBILITY, PERMITS, MORTGAGE
   - `SignalCategory`: DEMAND, SUPPLY, SENTIMENT, ECONOMIC, RISK, DISTRESS
   - `SignalDirection`: BULLISH, BEARISH, NEUTRAL
   - `GeoLevel`: METRO, COUNTY, NEIGHBORHOOD, ZIP, BUILDING
   - `AssetClass`: RESIDENTIAL, COMMERCIAL, MULTIFAMILY, RETAIL, INDUSTRIAL, MIXED
   - `TimeHorizon`: IMMEDIATE, SHORT, MEDIUM, LONG
   - `AlertCondition`: ABOVE, BELOW, CROSSES_UP, CROSSES_DOWN, DIVERGENCE

2. **Add models to `prisma/schema.prisma`**
   - `SentimentSignal` — core signal storage (see spec §7.1 for all 24 fields)
   - `SentimentIndex` — computed composite indices (see spec §7.1 for all 18 fields)
   - `SentimentAlert` — user-configured threshold alerts
     - Fields: id, userId, orgId, geoLevel, geoId, indexType (MPI/VDI/VSI/VSTI/VEI/VRI), condition (AlertCondition), threshold (Float), isActive, lastTriggeredAt, cooldownMinutes, deliveryMethod (JSON: email/push/inApp)
   - `SentimentWatchlist` — user market watchlist
     - Fields: id, userId, orgId, geoLevel, geoId, geoLabel, addedAt, sortOrder
   - Add indexes per spec §7.1 (composite indexes on geo + category + time)

3. **Run migration**
   ```bash
   npx prisma migrate dev --name add_sentiment_terminal
   npx prisma generate
   ```

4. **Create TypeScript types file: `src/lib/sentiment/types.ts`**
   - Export interfaces: `RawSignal`, `ClassifiedSignal`, `SignalScore`, `CompositeIndex`, `MarketPulse`
   - Export type guards and validation helpers
   - Import and re-export Prisma-generated types for SentimentSignal, SentimentIndex, etc.

**Acceptance Criteria:**
- [ ] Migration applies cleanly to local and Supabase
- [ ] `npx prisma generate` produces client with all new models
- [ ] Types compile with no errors
- [ ] Existing models untouched

---

### 1.2 Ingestion Infrastructure
**Duration:** 5 days | **Dependencies:** 1.1 | **Gate:** Adapter interface + scheduler run successfully with mock data

#### Tasks:
1. **Create adapter interface: `src/lib/sentiment/sentiment-source-adapter.ts`**
   ```typescript
   export interface SentimentSourceAdapter {
     sourceType: SentimentSource;
     fetchSignals(market: string, since: Date): Promise<RawSignal[]>;
     getRefreshInterval(): number; // milliseconds
     getRateLimit(): { maxCalls: number; windowMs: number };
     healthCheck(): Promise<boolean>;
   }
   ```
   - Base class `BaseSentimentAdapter` with shared logic: rate limiting, error handling, retry with exponential backoff, logging
   - Pattern: mirrors existing `nyc-opendata.ts` helper structure

2. **Create rate limiter: `src/lib/sentiment/rate-limiter.ts`**
   - Per-source rate limiting with token bucket algorithm
   - Configurable max calls per window
   - Backoff on 429 responses
   - Integration: used by all adapters via `BaseSentimentAdapter`

3. **Create ingestion scheduler: `src/lib/sentiment/ingestion-scheduler.ts`**
   - Manages refresh cycles per adapter per market
   - Uses `setInterval` with staggered starts (avoid thundering herd)
   - Graceful degradation: if an adapter fails, skip and retry next cycle
   - State tracking: last successful fetch per adapter per market
   - Pattern: similar to Gmail sync's `autoSync` interval in messages

4. **Create raw signal type: `src/lib/sentiment/raw-signal.ts`**
   - `RawSignal`: source, sourceId, content, url, publishedAt, rawGeo (free text), rawMetrics (engagement counts), metadata (JSON)
   - Validation: ensure required fields present before classification

5. **Write tests for infrastructure**
   - Mock adapter that generates fake signals
   - Verify scheduler invokes adapters at correct intervals
   - Verify rate limiter blocks excess calls

**Acceptance Criteria:**
- [ ] Mock adapter + scheduler produces RawSignals stored in DB
- [ ] Rate limiter correctly throttles burst requests
- [ ] Scheduler handles adapter failures gracefully (no crash, logs error, retries)

---

### 1.3 NLP Classification Layer
**Duration:** 5 days | **Dependencies:** 1.1, 1.2 | **Gate:** Claude correctly classifies 10+ test signals with >0.7 accuracy

#### Tasks:
1. **Create keyword pre-filter: `src/lib/sentiment/keyword-filter.ts`**
   - Regex and keyword matching to discard irrelevant content before Claude API
   - Real estate keyword lists (buy, sell, rent, mortgage, apartment, condo, house, listing, etc.)
   - Geographic keyword lists (city names, neighborhood names, state abbreviations)
   - Negative keyword lists (sports teams named after cities, band names, etc.)
   - Expected reduction: 70-80% of raw content filtered out

2. **Create signal classifier: `src/lib/sentiment/signal-classifier.ts`**
   - Uses existing Anthropic SDK pattern from `src/lib/email-parser.ts` and `src/lib/market-intel/ai-analysis.ts`
   - Batch classification: groups 10-20 signals per Claude call
   - Structured JSON output with Zod validation
   - Returns `ClassifiedSignal`: category, direction, magnitude, confidence, geoEntities, assetClass, timeHorizon, entities, summary
   - Confidence gating: discard signals with confidence < 0.6
   - Model selection: Claude Haiku for classification (cost-effective), Sonnet for edge cases
   - Prompt engineering: include real estate domain context, geographic disambiguation rules, example classifications

3. **Create classifier prompt template: `src/lib/sentiment/classifier-prompt.ts`**
   - System prompt with signal taxonomy definitions
   - Few-shot examples for each category + direction combination
   - Geographic disambiguation rules ("Brooklyn" = NYC unless context says otherwise)
   - Output schema definition

4. **Wire classifier into ingestion pipeline**
   - After adapter produces RawSignals → keyword filter → batch to classifier → store ClassifiedSignals
   - Pipeline: `adapter.fetchSignals() → keywordFilter() → batchClassify() → geoTag() → store()`

**Acceptance Criteria:**
- [ ] Classifier correctly categorizes 10 test signals spanning all 6 categories
- [ ] Batch processing handles 20 signals in a single Claude call
- [ ] Confidence gating filters out low-quality classifications
- [ ] Cost per 100 signals < $0.05 (Haiku pricing)

---

### 1.4 Geographic Tagging Engine
**Duration:** 4 days | **Dependencies:** 1.1, 1.3 | **Gate:** GeoTagger resolves "Bushwick" → neighborhood + zip + county + metro

#### Tasks:
1. **Create geo-tagger: `src/lib/sentiment/geo-tagger.ts`**
   - NER extraction: pull location mentions from classified signal text
   - Geocoding: use existing Geocodio integration (GEOCODIO_API_KEY) for coordinates
   - Boundary resolution: map coordinates → metro, county, neighborhood, zip
   - BBL resolution: when NYC address detected, resolve to BBL via PLUTO lookup (existing `nyc-opendata.ts`)
   - Caching: cache geocoding results in Tier 2 LRU (existing `cache-manager.ts`) with 7-day TTL

2. **Create boundary database: `src/lib/sentiment/geo-boundaries.ts`**
   - Static GeoJSON boundaries for tracked markets (start with NYC)
   - NYC: 5 boroughs, ~200 neighborhoods, ~180 zip codes
   - Point-in-polygon lookup using lightweight algorithm (no heavy GIS dependency)
   - Extensible: add new markets by loading their GeoJSON boundary files

3. **Create NYC boundary data: `src/data/nyc-boundaries.json`**
   - Borough boundaries
   - Neighborhood boundaries (NTA — Neighborhood Tabulation Areas from NYC Open Data)
   - Zip code boundaries
   - Source: NYC Department of City Planning open data

4. **Integration with classifier pipeline**
   - GeoTagger runs after classification, before storage
   - Enriches ClassifiedSignal with resolved: metroArea, county, neighborhood, zipCode, bbl, latitude, longitude
   - Falls back to metro level when neighborhood cannot be determined (confidence < 0.7)

**Acceptance Criteria:**
- [ ] "Bushwick apartment" → metroArea: "nyc", county: "Brooklyn", neighborhood: "Bushwick", zipCode: "11237"
- [ ] "Miami condo market" → metroArea: "miami", county: "Miami-Dade"
- [ ] NYC address → BBL resolved via PLUTO
- [ ] Geocoding results cached (no duplicate API calls)

---

### 1.5 Google Trends Adapter
**Duration:** 4 days | **Dependencies:** 1.2 | **Gate:** Fetches and stores trend data for NYC demand + distress keywords

#### Tasks:
1. **Create adapter: `src/lib/sentiment/adapters/google-trends-adapter.ts`**
   - Implements `SentimentSourceAdapter` interface
   - Uses SerpApi (SERPAPI_KEY env var) for programmatic Google Trends access
   - Tracks two keyword sets:
     - **Demand keywords** (12 queries): "apartments for rent in [X]", "homes for sale in [X]", "moving to [X]", "cost of living [X]", "best neighborhoods [X]", "[X] real estate market", etc.
     - **Distress keywords** (10 queries): "can't sell my house [X]", "price reduction real estate [X]", "foreclosure help [X]", "short sale [X]", "housing market crash", etc.
   - Market parameter: replace [X] with tracked market names
   - Returns interest-over-time data normalized 0-100
   - Converts to RawSignal format with magnitude derived from z-score vs. 12-month baseline

2. **Create trend baseline computation: `src/lib/sentiment/adapters/trend-baseline.ts`**
   - Stores 12-month historical baseline per keyword per market
   - Computes z-score: (current_value - mean) / stdev
   - Converts z-score to magnitude: min(100, |z-score| * 25)
   - Direction: positive z-score for demand keywords = BULLISH, positive z-score for distress keywords = BEARISH

3. **Add environment variable**
   - `SERPAPI_KEY` — add to `.env.example`, `cloudbuild.yaml` secrets, and `settings/api-keys` page

4. **Seed initial markets**
   - NYC (default), Miami, Austin, Nashville, Los Angeles, Chicago
   - Each market gets both demand and distress keyword tracking
   - Historical baseline: fetch 12 months of weekly data on first run

**Acceptance Criteria:**
- [ ] SerpApi returns Google Trends data for all tracked keywords
- [ ] Z-score computation produces sensible magnitude values
- [ ] Signals stored in SentimentSignal table with correct geographic tagging
- [ ] Refresh runs every 6 hours without errors
- [ ] API key status shown on settings/api-keys page

---

### 1.6 News & Publication Adapter
**Duration:** 5 days | **Dependencies:** 1.2, 1.3 | **Gate:** Ingests and classifies articles from 8+ publications

#### Tasks:
1. **Create adapter: `src/lib/sentiment/adapters/news-adapter.ts`**
   - Implements `SentimentSourceAdapter` interface
   - Multi-source: RSS feeds + Brave News API (existing BRAVE_SEARCH_API_KEY)
   - Tier 1 publications (30-min refresh): The Real Deal, Commercial Observer, Bisnow, GlobeSt, Multi-Housing News, CoStar News, Curbed, NREI
   - Tier 2 publications (2-hour refresh): WSJ Real Estate, Bloomberg Real Estate, CNBC Housing
   - Tier 3 publications (6-hour refresh): local news via Brave News search queries

2. **Create RSS parser: `src/lib/sentiment/adapters/rss-parser.ts`**
   - Lightweight RSS/Atom feed parser (use `rss-parser` npm package)
   - Extract: title, description, link, pubDate, categories
   - Dedup by URL to avoid processing same article twice
   - Store last-seen article timestamp per feed for incremental fetching

3. **Create Brave News integration extension**
   - Extend existing `src/lib/brave-search.ts` with news-specific queries
   - Search queries: "[market] real estate", "[market] housing market", "[market] rent prices", etc.
   - 6 queries per market, rotated across refresh cycles

4. **Wire into classification pipeline**
   - News articles → keyword filter → Claude classifier → geo-tagger → store
   - For news, Claude extracts additional metadata: publication tier, article type (news/opinion/analysis), named entities (people, companies, buildings)

5. **Add RSS feed configuration: `src/lib/sentiment/config/news-feeds.ts`**
   - Static config of all tracked RSS feeds with tier, category, and geographic focus
   - Easy to add new feeds without code changes

**Acceptance Criteria:**
- [ ] RSS feeds parsed and stored for all 8 Tier 1 publications
- [ ] Brave News queries return relevant results for tracked markets
- [ ] Dedup prevents duplicate article processing
- [ ] Articles classified with correct category and geographic tags
- [ ] 30-minute refresh for Tier 1 operates without rate limit issues

---

### 1.7 Index Computation Engine
**Duration:** 5 days | **Dependencies:** 1.1, 1.3, 1.4 | **Gate:** MPI computed for NYC metro and 5 neighborhoods

#### Tasks:
1. **Create index engine: `src/lib/sentiment/index-engine.ts`**
   - Queries all ClassifiedSignals for target geography within lookback window (30 days default)
   - Groups by category (DEMAND, SUPPLY, SENTIMENT, ECONOMIC, RISK, DISTRESS)
   - Computes weighted average score per category using: `(magnitude × 0.5) + (confidence × 0.3) + (freshness × 0.2)`
   - Applies source diversity bonus: 3+ independent sources → 10% confidence boost
   - Computes MPI: `(Demand × 0.30) + (Supply × 0.20) + (Sentiment × 0.20) + (Economic × 0.20) + (Risk × 0.10)`
   - Normalizes to -100 to +100 scale

2. **Create freshness decay function: `src/lib/sentiment/freshness.ts`**
   - Exponential decay: `freshness = 100 × e^(-λ × days_old)` where λ = 0.05
   - Today = 100, 7 days = ~70, 30 days = ~22, 90 days = ~1
   - Configurable per source (news decays faster than economic data)

3. **Create trend computation: `src/lib/sentiment/trend-compute.ts`**
   - 30/60/90-day moving averages
   - Year-over-year change
   - Percentile rank vs. all tracked markets
   - Velocity: rate of change of MPI

4. **Create computation scheduler**
   - Metro level: every 2 hours
   - County/borough: every 4 hours
   - Neighborhood/zip: every 6 hours
   - Building: on-demand only (triggered by building profile view)
   - Uses `ingestion-scheduler.ts` pattern

5. **Store computed indices**
   - Write to SentimentIndex table with full component breakdown
   - Keep historical indices (do not overwrite — new row per computation)
   - Prune: keep hourly for 7 days, daily for 90 days, weekly for 2 years, monthly for 5 years

**Acceptance Criteria:**
- [ ] MPI correctly computed from mock signals (manual verification)
- [ ] Sub-indices (VDI, VSI, VSTI, VEI, VRI) individually correct
- [ ] Trend computation produces valid 30/60/90-day values
- [ ] Historical indices stored and retrievable
- [ ] Computation completes in < 5 seconds per geography

---

### 1.8 Terminal Dashboard UI
**Duration:** 8 days | **Dependencies:** 1.5, 1.6, 1.7 | **Gate:** /terminal route renders with real data from Google Trends + News

#### Tasks:
1. **Create route: `src/app/(dashboard)/terminal/page.tsx`**
   - Server component that fetches initial data
   - Protected route (requires auth + approval, same as other dashboard pages)

2. **Create main view: `src/app/(dashboard)/terminal/terminal-dashboard.tsx`**
   - Client component ("use client")
   - Layout:
     - Header row: global market summary (top 3 movers, alert count)
     - Watchlist grid: 2×3 responsive grid of market cards
     - Signal feed: scrolling feed of recent classified signals
     - AI summary panel placeholder (Phase 2)
   - Responsive: stacks to single column on mobile
   - Uses existing Tailwind + shadcn/ui patterns

3. **Create market card component: `src/app/(dashboard)/terminal/components/market-card.tsx`**
   - MPI value with color coding (green > +20, yellow -20 to +20, red < -20)
   - 30-day sparkline (lightweight SVG, no charting library needed)
   - Directional arrow with magnitude
   - Top signal preview (most recent impactful signal)
   - Click → drilldown (Phase 2, link to placeholder for now)

4. **Create MPI gauge component: `src/app/(dashboard)/terminal/components/mpi-gauge.tsx`**
   - Semicircular gauge showing -100 to +100
   - Color gradient: red → yellow → green
   - Needle animation on load
   - Numeric display in center

5. **Create signal feed component: `src/app/(dashboard)/terminal/components/signal-feed.tsx`**
   - Scrollable list of recent signals
   - Each signal shows: source icon, summary text, category badge, magnitude, time ago
   - Auto-refresh every 60 seconds
   - Filter by category (tabs or pill bar)
   - Pattern: similar to message thread list in messages-view.tsx

6. **Create server actions: `src/app/(dashboard)/terminal/actions.ts`**
   - `getWatchlistIndices()` — fetch latest SentimentIndex for user's watchlist
   - `getRecentSignals()` — fetch recent ClassifiedSignals with pagination
   - `addToWatchlist()` / `removeFromWatchlist()` — manage user's watched markets
   - `getMarketSummary()` — aggregate stats for header row

7. **Add navigation**
   - Add "Terminal" to desktop sidebar (`src/components/layout/sidebar.tsx`)
   - Add "Terminal" to mobile nav "More" sheet (`src/components/layout/mobile-nav.tsx`)
   - Icon: `Activity` from Lucide React (or `BarChart3`)

8. **Create watchlist management**
   - Modal or slide-over to search and add markets
   - Pre-populated with common markets (NYC boroughs, top US metros)
   - Drag to reorder
   - Max watchlist size gated by plan tier

**Acceptance Criteria:**
- [ ] /terminal renders with market cards showing real MPI data
- [ ] Sparklines display 30-day trend
- [ ] Signal feed populates with classified signals from Google Trends + News adapters
- [ ] Watchlist add/remove persists
- [ ] Mobile responsive (single column, bottom nav accessible)
- [ ] Page loads in < 3 seconds (cached data)

---

### 1.9 Settings Integration
**Duration:** 2 days | **Dependencies:** 1.5, 1.6 | **Gate:** API keys configurable via settings page

#### Tasks:
1. **Update `src/app/(dashboard)/settings/api-keys/page.tsx`**
   - Add SerpApi key status + test connection
   - Add section for "Sentiment Intelligence" API keys
   - Show connection status for each configured adapter

2. **Create sentiment settings page: `src/app/(dashboard)/settings/sentiment/page.tsx`**
   - Configure tracked markets
   - Configure alert delivery preferences (email/push/in-app)
   - Configure refresh frequencies (use defaults or customize)
   - AI synthesis toggle and frequency

3. **Update feature gating**
   - Add sentiment features to plan tier checks
   - Free: 3 watchlist markets, MPI only, news feed
   - Explorer: unlimited watchlist, Google Trends + social, heat map
   - Pro+: full feature set

**Acceptance Criteria:**
- [ ] API key entry and test connection works for SerpApi
- [ ] Sentiment settings save and persist
- [ ] Feature gating blocks unpaid features with upgrade prompt

---

### Phase 1 Ship Gate
**All of the following must be true before Phase 1 is complete:**
- [ ] SentimentSignal table populated with Google Trends + News data for NYC
- [ ] MPI computed and displayed for NYC metro + 5 boroughs
- [ ] /terminal dashboard renders with market cards, sparklines, signal feed
- [ ] Watchlist management functional
- [ ] Settings page shows sentiment API key status
- [ ] No regression in existing Market Intel, CRM, or BMS features
- [ ] Docker build succeeds (`docker build .`)
- [ ] Cloud Run deployment succeeds

---

## Phase 2: Social Layer (Weeks 7–12)

### 2.1 Reddit Adapter
**Duration:** 4 days | **Dependencies:** Phase 1 complete

#### Tasks:
1. **Create adapter: `src/lib/sentiment/adapters/reddit-adapter.ts`**
   - Reddit Data API with OAuth2 (REDDIT_CLIENT_ID, REDDIT_SECRET)
   - Monitor subreddits: r/RealEstate, r/REBubble, r/FirstTimeHomeBuyer, r/Landlord, r/RealEstateInvesting
   - City subs: r/nyc, r/AskNYC, r/Miami, r/Austin, r/Nashville, r/LosAngeles, r/chicago
   - Fetch: posts + top comments (top 10 comments per relevant post)
   - Relevance filter: keyword pre-filter before Claude classification
   - Dedup by post ID

2. **Create subreddit config: `src/lib/sentiment/config/reddit-config.ts`**
   - Subreddit → market mapping
   - Per-sub refresh frequency and relevance keywords
   - Easy to add new subreddits

3. **Env vars:** `REDDIT_CLIENT_ID`, `REDDIT_SECRET`

**Acceptance Criteria:**
- [ ] Reddit posts fetched, filtered, classified, geo-tagged, and stored
- [ ] Subreddit monitoring runs on 2-hour cycle
- [ ] Comments provide additional signal depth

---

### 2.2 X (Twitter) Adapter
**Duration:** 4 days | **Dependencies:** Phase 1 complete

#### Tasks:
1. **Create adapter: `src/lib/sentiment/adapters/x-adapter.ts`**
   - X API v2 with Bearer Token (X_BEARER_TOKEN)
   - Filtered stream rules for real estate keywords + geo
   - Batch search endpoint for broader queries
   - Track: agent accounts, journalist accounts, keyword streams
   - Extract: text, geo (if available), engagement metrics, account info

2. **Create X account list: `src/lib/sentiment/config/x-accounts.ts`**
   - Curated list of real estate professionals, journalists, analysts to track
   - Per-market account lists
   - Weight: verified accounts get higher confidence scores

3. **Env var:** `X_BEARER_TOKEN`

**Acceptance Criteria:**
- [ ] X posts fetched via search API (streaming optional)
- [ ] Real estate professional posts get higher confidence weight
- [ ] Geo-tagging extracts location from post text and user profile

---

### 2.3 Sentiment Heat Map Layer
**Duration:** 5 days | **Dependencies:** 1.7 (index engine), existing map-search.tsx

#### Tasks:
1. **Create map layer: `src/app/(dashboard)/market-intel/sentiment-layer.tsx`**
   - Neighborhood polygons colored by MPI value
   - Color scale: red (-100) → yellow (0) → green (+100)
   - Opacity: 0.3 base, 0.6 on hover
   - Click polygon → show MPI breakdown tooltip
   - Uses existing Leaflet dynamic import pattern from map-search.tsx

2. **Add to layer controls**
   - Add "Sentiment" toggle to `map-layers-renderer.tsx`
   - Add "Sentiment" pill to `intelligence-pill-bar.tsx`
   - Consistent with existing layer UX

3. **Create time-lapse component: `src/app/(dashboard)/terminal/components/time-lapse.tsx`**
   - Slider to scrub through 12 months of historical MPI data
   - Play/pause button for auto-advance
   - Heat map updates in real-time as slider moves

4. **Create server action: `src/app/(dashboard)/market-intel/sentiment-actions.ts`**
   - `getNeighborhoodMPI(metroArea)` — returns MPI for all neighborhoods in a metro
   - `getHistoricalMPI(geoId, months)` — returns time series for time-lapse

**Acceptance Criteria:**
- [ ] Sentiment layer renders on Market Intel map
- [ ] Neighborhood colors match MPI values
- [ ] Time-lapse plays smoothly (30fps equivalent)
- [ ] Layer toggle works alongside existing 14 layers

---

### 2.4 AI Synthesis Panel
**Duration:** 5 days | **Dependencies:** 2.1, 2.2, 1.7

#### Tasks:
1. **Create synthesis engine: `src/lib/sentiment/ai-synthesis.ts`**
   - Uses Anthropic SDK (existing pattern from ai-analysis.ts)
   - Three synthesis types:
     - **Daily briefing**: summarize all signals for user's watchlist in past 24 hours
     - **Market narrative**: deep analysis of a single market with signal citations
     - **Contrarian alert**: identify divergences between sub-indices
   - Prompt template includes: current index values, top signals, historical context, user's watchlist
   - Output: structured JSON with narrative text, cited signals, confidence, recommended actions

2. **Create synthesis UI: `src/app/(dashboard)/terminal/components/ai-panel.tsx`**
   - Collapsible panel on terminal dashboard
   - Daily briefing displayed by default
   - "Analyze" button on each market card triggers market narrative
   - Contrarian alerts shown as warning badges
   - Markdown rendering for narrative text

3. **Create synthesis scheduler**
   - Daily briefing generated at 7:00 AM user's timezone
   - Cached for the day (regenerate on manual refresh)
   - Market narratives generated on-demand, cached 2 hours

**Acceptance Criteria:**
- [ ] Daily briefing generated with relevant signal citations
- [ ] Market narrative provides actionable insights specific to the market
- [ ] Contrarian alerts fire when sub-indices diverge by > 30 points
- [ ] Cost per daily briefing < $0.10 (Sonnet)

---

### 2.5 Building Profile Integration
**Duration:** 4 days | **Dependencies:** 1.7, 2.3

#### Tasks:
1. **Extend data-fusion-engine.ts**
   - Add Phase 4 (Sentiment) to `fetchBuildingIntelligence()`
   - Fetch: building-level signals (by BBL), neighborhood MPI, metro MPI
   - Attach to `BuildingIntelligence` object as new `sentiment` property:
     ```typescript
     sentiment: {
       neighborhoodMPI: number;
       metroMPI: number;
       buildingSignals: ClassifiedSignal[];
       trendDirection: 'RISING' | 'FALLING' | 'STABLE';
       trend30d: number;
       topSignal: string; // AI summary
     }
     ```

2. **Create sentiment section: `src/app/(dashboard)/market-intel/sections/sentiment-section.tsx`**
   - Displays neighborhood MPI with sparkline
   - Shows building-specific signals (if any)
   - Shows trend direction with arrow
   - Shows top 3 recent signals for the neighborhood

3. **Extend lead scoring: `src/app/(dashboard)/market-intel/lead-verification.ts`**
   - Add sentiment-derived signals to lead score:
     - Rising MPI → +5 to investment opportunity score
     - Falling MPI + high distress → +10 to seller motivation score
     - Diverging signals → "transitional market" flag

**Acceptance Criteria:**
- [ ] Building profiles show sentiment section
- [ ] Lead score incorporates sentiment data
- [ ] No performance regression on building profile load (sentiment is Phase 4, non-blocking)

---

### 2.6 Signal Drilldown Views
**Duration:** 5 days | **Dependencies:** 1.7, 1.8

#### Tasks:
1. **Create market drilldown: `src/app/(dashboard)/terminal/[market]/page.tsx`**
   - MPI history chart (recharts or lightweight SVG)
   - Sub-index breakdown chart (5 lines)
   - Signal table with sort/filter
   - Source composition donut chart
   - Comparable markets list

2. **Create signal detail: `src/app/(dashboard)/terminal/signal/[id]/page.tsx`**
   - Original content with source link
   - Classification breakdown
   - Geographic resolution chain
   - Related signals
   - Impact on indices

3. **Create server actions: `src/app/(dashboard)/terminal/[market]/actions.ts`**
   - `getMarketDetail(geoId)` — full index history + recent signals
   - `getSignalDetail(signalId)` — single signal with context
   - `getComparableMarkets(geoId)` — markets with similar MPI trajectory

**Acceptance Criteria:**
- [ ] Market drilldown shows comprehensive view with charts
- [ ] Signal detail shows full classification and context
- [ ] Navigation between dashboard → drilldown → signal detail is smooth

---

### Phase 2 Ship Gate
- [ ] Reddit and X signals flowing into system
- [ ] Sentiment heat map renders on Market Intel map
- [ ] AI synthesis generates daily briefings
- [ ] Building profiles show sentiment data
- [ ] Signal drilldowns functional with charting
- [ ] Lead scoring incorporates sentiment
- [ ] Docker build + Cloud Run deployment succeeds

---

## Phase 3: Alternative Data (Weeks 13–20)

### 3.1 TikTok Adapter
**Duration:** 4 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/tiktok-adapter.ts`
- TikTok Research API (TIKTOK_API_KEY) + Apify fallback (APIFY_API_TOKEN)
- Track: geo-tagged content volume, engagement velocity, hashtag trends
- Real estate hashtags: #ApartmentTour, #MovingTo, #RealEstateTok, #FirstHome, #HouseHunting
- Creator migration: detect when high-follower creators start posting from new locations
- Refresh: every 6 hours for primary markets, daily for secondary

### 3.2 YouTube Adapter
**Duration:** 3 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/youtube-adapter.ts`
- YouTube Data API v3 (YOUTUBE_API_KEY, free tier)
- Track: 200+ real estate channels, view velocity, topic shifts
- Transcript analysis via auto-generated captions
- Refresh: daily

### 3.3 Yelp / Business Activity Adapter
**Duration:** 3 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/yelp-adapter.ts`
- Yelp Fusion API (YELP_API_KEY, free tier 5K calls/day)
- Track: new business openings, closures, review volume trends per neighborhood
- Category analysis: detect gentrification signals (bodega → wine bar shift)
- Refresh: daily

### 3.4 Jobs & Employment Adapter
**Duration:** 4 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/jobs-adapter.ts`
- Indeed/LinkedIn data via Bright Data (BRIGHTDATA_API_KEY) or direct API
- Track: job posting volume by metro, industry concentration, salary trends
- Corporate relocation announcements via news + SEC filing scan
- Refresh: weekly

### 3.5 U-Haul Migration Index
**Duration:** 2 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/uhaul-adapter.ts`
- Scrape one-way pricing between top 50 metro pairs
- Compute directional migration index: high origin→dest price / low dest→origin price = net outflow
- Refresh: weekly

### 3.6 Listing Language NLP
**Duration:** 4 days | **Dependencies:** Phase 2 complete

- `src/lib/sentiment/adapters/listings-nlp-adapter.ts`
- Ingest rental/sale listings from StreetEasy (NYC) + Brave Search
- NLP on descriptions: concession language %, urgency language %, amenity inflation
- Track ratios over time as market condition indicators
- Refresh: every 12 hours

### 3.7 Time-Lapse Heat Map
**Duration:** 3 days | **Dependencies:** 2.3

- Enhance time-lapse component with smooth transitions
- Add annotation markers for major events (policy changes, major transactions)
- Export as GIF/video for sharing

### Phase 3 Ship Gate
- [ ] All 6 new adapters operational
- [ ] Signal volume increased significantly (100+ signals/day for NYC)
- [ ] Index accuracy improved (more source diversity)
- [ ] Time-lapse heat map functional
- [ ] All new env vars documented and deployed

---

## Phase 4: Enterprise Signals (Weeks 21–28)

### 4.1 Insurance Market Adapter
- State insurance commission filing parser
- Insurer withdrawal tracking, premium rate changes, FAIR plan enrollment
- Env: no special API (public data scraping)

### 4.2 Mobility / Foot Traffic Integration
- SafeGraph or Placer.ai API (SAFEGRAPH_API_KEY)
- Foot traffic by neighborhood and POI category
- Transit ridership data (MTA turnstile data for NYC)

### 4.3 Construction Cost Index
- BLS Producer Price Index (free API)
- ENR Construction Cost Index by metro
- Labor availability signals from jobs adapter

### 4.4 STR Regulatory Tracker
- City council agenda scraping for STR-related items
- AirDNA/Mashvisor data integration (if available)
- Enforcement action tracking

### 4.5 Permit Velocity Time-Series
- Extend existing DOB permit data with z-score analysis
- 90-day rolling average vs. 12-month baseline
- Anomaly detection for sudden spikes/drops
- This is mostly new analysis on existing data (NYC Open Data ic3t-wcy2)

### 4.6 Advanced Alert System
- Email digest generation (daily/weekly summary)
- Push notification framework (when service worker ships)
- Alert history and management UI
- Divergence alert: auto-detect when sub-indices disagree by > 30 points

### Phase 4 Ship Gate
- [ ] Insurance, mobility, construction cost signals operational
- [ ] Permit velocity z-scores integrated
- [ ] Alert system delivers email digests
- [ ] Enterprise-tier features gated correctly

---

## Phase 5: Multi-Market Scale (Weeks 29–36)

### 5.1 Market-Agnostic Adapter Framework
- Refactor all adapters to accept market config object (not hardcoded to NYC)
- Market config: name, boundaries GeoJSON, local subreddits, local news RSS, local permit API
- Pattern: similar to Phase 3 multi-market vision in VETTDRE_VISION_ROADMAP.md

### 5.2 New Market Onboarding
- Add: Miami, Austin, Nashville, Los Angeles, Chicago
- Per-market: boundary data, subreddit config, news sources, permit APIs
- Each market takes ~3 days to configure + validate

### 5.3 Cross-Market Views
- National MPI rankings
- Peer market analysis ("markets moving like yours")
- Cross-market signal correlation
- Migration flow visualization (Sankey diagram)

### 5.4 API Access (Enterprise)
- REST API for MPI and sub-indices
- Webhook for alert delivery
- Rate-limited by plan tier
- API documentation page

### Phase 5 Ship Gate
- [ ] 6 markets fully operational with all adapters
- [ ] Cross-market comparison views functional
- [ ] API access working for enterprise tier
- [ ] System handles 6x data volume without performance degradation

---

## File Index

### New Directories
```
src/lib/sentiment/                     # Core sentiment engine
src/lib/sentiment/adapters/            # Source-specific adapters
src/lib/sentiment/config/              # Configuration files
src/app/(dashboard)/terminal/          # Terminal UI
src/app/(dashboard)/terminal/components/  # Terminal components
src/app/(dashboard)/terminal/[market]/ # Market drilldown
src/app/(dashboard)/terminal/signal/   # Signal detail
src/data/                              # Static data (boundaries)
```

### New Files (Phase 1–2, ~35 files)
```
# Types & Schema
src/lib/sentiment/types.ts
prisma/schema.prisma (modified)

# Infrastructure
src/lib/sentiment/sentiment-source-adapter.ts
src/lib/sentiment/raw-signal.ts
src/lib/sentiment/rate-limiter.ts
src/lib/sentiment/ingestion-scheduler.ts
src/lib/sentiment/keyword-filter.ts
src/lib/sentiment/signal-classifier.ts
src/lib/sentiment/classifier-prompt.ts
src/lib/sentiment/geo-tagger.ts
src/lib/sentiment/geo-boundaries.ts
src/lib/sentiment/index-engine.ts
src/lib/sentiment/freshness.ts
src/lib/sentiment/trend-compute.ts
src/lib/sentiment/ai-synthesis.ts

# Adapters
src/lib/sentiment/adapters/google-trends-adapter.ts
src/lib/sentiment/adapters/trend-baseline.ts
src/lib/sentiment/adapters/news-adapter.ts
src/lib/sentiment/adapters/rss-parser.ts
src/lib/sentiment/adapters/reddit-adapter.ts
src/lib/sentiment/adapters/x-adapter.ts

# Config
src/lib/sentiment/config/news-feeds.ts
src/lib/sentiment/config/reddit-config.ts
src/lib/sentiment/config/x-accounts.ts
src/lib/sentiment/config/markets.ts

# UI
src/app/(dashboard)/terminal/page.tsx
src/app/(dashboard)/terminal/terminal-dashboard.tsx
src/app/(dashboard)/terminal/actions.ts
src/app/(dashboard)/terminal/components/market-card.tsx
src/app/(dashboard)/terminal/components/mpi-gauge.tsx
src/app/(dashboard)/terminal/components/signal-feed.tsx
src/app/(dashboard)/terminal/components/ai-panel.tsx
src/app/(dashboard)/terminal/components/time-lapse.tsx
src/app/(dashboard)/terminal/[market]/page.tsx
src/app/(dashboard)/terminal/[market]/actions.ts
src/app/(dashboard)/terminal/signal/[id]/page.tsx

# Map Integration
src/app/(dashboard)/market-intel/sentiment-layer.tsx
src/app/(dashboard)/market-intel/sentiment-actions.ts
src/app/(dashboard)/market-intel/sections/sentiment-section.tsx

# Data
src/data/nyc-boundaries.json

# Modified Files
src/components/layout/sidebar.tsx (add Terminal nav)
src/components/layout/mobile-nav.tsx (add Terminal to More sheet)
src/lib/data-fusion-engine.ts (add Phase 4 sentiment)
src/app/(dashboard)/market-intel/lead-verification.ts (add sentiment signals)
src/app/(dashboard)/market-intel/building-profile.tsx (add sentiment section)
src/app/(dashboard)/settings/api-keys/page.tsx (add SerpApi + sentiment keys)
```

### Environment Variables (New)
```
SERPAPI_KEY=              # Google Trends (Phase 1)
REDDIT_CLIENT_ID=        # Reddit API (Phase 2)
REDDIT_SECRET=           # Reddit API (Phase 2)
X_BEARER_TOKEN=          # X/Twitter API (Phase 2)
TIKTOK_API_KEY=          # TikTok Research API (Phase 3)
APIFY_API_TOKEN=         # Apify scraper fallback (Phase 3)
YOUTUBE_API_KEY=         # YouTube Data API (Phase 3)
YELP_API_KEY=            # Yelp Fusion API (Phase 3)
BRIGHTDATA_API_KEY=      # Bright Data job scraping (Phase 3)
SAFEGRAPH_API_KEY=       # SafeGraph foot traffic (Phase 4)
```
