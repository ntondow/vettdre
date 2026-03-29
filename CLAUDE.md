# VettdRE — AI-Native NYC Real Estate Platform

## Project Overview
VettdRE is a multi-tenant real estate platform for NYC agents and brokerages combining CRM, brokerage management, AI-powered property intelligence, deal underwriting, and an AI leasing agent. The platform integrates 17+ NYC Open Data APIs, skip tracing (People Data Labs), professional enrichment (Apollo.io), Stripe billing, Twilio SMS/voice, and Brave Search to deliver a comprehensive real estate operations suite.

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router, Turbopack, standalone output)
- **Language:** TypeScript 5 (strict mode)
- **React:** 19.2.3
- **Database:** PostgreSQL via Supabase (Session Pooler)
- **ORM:** Prisma 5.22
- **Auth:** Supabase Auth with SSR middleware + user approval + auto-provisioning
- **Styling:** Tailwind CSS 4 (custom animations + mobile utilities in `globals.css`)
- **Icons:** Lucide React + emoji icons in some UI elements
- **Maps:** Leaflet + OpenStreetMap (dynamic import, `circleMarker` for performance)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk` ^0.76.0)
- **Google Workspace:** `@googleworkspace/cli` (gws) — AI agent tool layer for Gmail, Calendar, Drive, Sheets, Tasks
- **Skip Tracing:** People Data Labs API (primary), Tracerfy API (fallback)
- **Professional Enrichment:** Apollo.io API (Organization Plan — People Search, People Enrichment, Org Enrichment, Bulk Enrich)
- **Payments:** Stripe (checkout sessions, billing portal, webhook lifecycle)
- **Communications:** Twilio (SMS, voice, status callbacks)
- **Search:** Brave Web Search API (listings, comps, entity research)
- **Deployment:** Docker + Google Cloud Run (cloudbuild.yaml)
- **Utilities:** clsx, tailwind-merge

## Key Reference Docs
- `VETTDRE_VISION_ROADMAP.md` — Product vision, roadmap, competitive positioning
- `CODEBASE_SUMMARY.md` — Full architecture, file map, recent dev history
- `BMS_SPEC.md` — Brokerage Management System spec (Phases 1-10.5)
- `MOBILE_SPEC.md` — Remaining mobile responsiveness work

## Environment Variables
```
# Database
DATABASE_URL=                    # Supabase Session Pooler (port 5432)
DIRECT_URL=                      # Supabase Direct connection (port 5432)

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=               # Claude AI for ownership analysis, email parsing, leasing agent, deal underwriting

# Data APIs
NYC_OPEN_DATA_APP_TOKEN=         # NYC Open Data (Socrata)
NYC_OPEN_DATA_TOKEN=             # Alternate NYC token
NYS_OPEN_DATA_TOKEN=             # NYS entity/filing data
CENSUS_API_KEY=                  # Census demographic data
GEOCODIO_API_KEY=                # Geocoding
HUD_API_TOKEN=                   # HUD fair market rents
FRED_API_KEY=                    # FRED economic data (mortgage rates)
FANNIE_CLIENT_ID=                # Fannie Mae loan data
FANNIE_CLIENT_SECRET=
FANNIE_API_KEY=

# Skip Tracing & Enrichment
PDL_API_KEY=                     # People Data Labs
APOLLO_API_KEY=                  # Apollo.io
TRACERFY_API_KEY=                # Tracerfy (fallback, CSV-based)

# Web Search & Scraping
FIRECRAWL_API_KEY=               # Firecrawl (primary — web scraping for listings, comps, entity research)
FIRECRAWL_MAX_CREDITS_PER_MONTH= # Monthly credit budget (default: 500)
BRAVE_SEARCH_API_KEY=            # Brave Web Search API (fallback when Firecrawl unavailable)

# Gmail & Calendar
GOOGLE_CLIENT_ID=                # Gmail + Calendar OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Stripe Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_YEARLY_PRICE_ID=
STRIPE_EXPLORER_MONTHLY_PRICE_ID=
STRIPE_EXPLORER_YEARLY_PRICE_ID=
STRIPE_TEAM_MONTHLY_PRICE_ID=
STRIPE_LEASING_PRO_PRICE_ID=
STRIPE_LEASING_TEAM_PRICE_ID=

# Twilio SMS/Voice
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Push Notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# Error Monitoring (Sentry)
NEXT_PUBLIC_SENTRY_DSN=          # Sentry DSN (public, identifies project)
SENTRY_AUTH_TOKEN=               # (Optional) Source map upload auth token

# Security & Config
TOKEN_ENCRYPTION_KEY=            # AES-256-GCM for Gmail token encryption (falls back to ANTHROPIC_API_KEY)
AI_PARSE_MAX_PER_HOUR=100       # Max AI email parses per hour (default: 100)
NEXT_PUBLIC_APP_URL=             # Public app URL
LEASING_FALLBACK_EMAIL=          # Fallback for leasing email routing
CRON_SECRET=                     # Auth for cron endpoints
EMAIL_WEBHOOK_SECRET=            # Leasing email webhook auth
VITALITY_REFRESH_KEY=            # Vitality cache refresh auth
```

## Project Structure
```
src/
├── app/
│   ├── globals.css                # Keyframes: fade-in, modal-in, slide-up, slide-up-sheet
│   │                              # Utilities: pb-safe, pt-safe, no-scrollbar
│   ├── layout.tsx                 # Root layout with PWA meta tags, viewport, apple-web-app
│   ├── page.tsx                   # Root redirect (→ /dashboard or /login)
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── pending-approval/page.tsx
│   │
│   ├── auth/callback/route.ts     # Supabase OAuth callback
│   │
│   ├── api/
│   │   ├── auth/gmail/route.ts           # Gmail OAuth initiation
│   │   ├── auth/gmail/callback/route.ts  # Gmail OAuth callback → stores tokens
│   │   ├── book/route.ts                 # Public showing booking
│   │   ├── cache/route.ts                # Admin cache management
│   │   ├── report/[bbl]/route.ts         # Single building PDF report
│   │   ├── vitality/refresh/route.ts     # Neighborhood vitality cache refresh
│   │   ├── automations/
│   │   │   └── cron/route.ts             # Cron: no_activity + task_overdue triggers (30m)
│   │   ├── leasing/
│   │   │   ├── chat/route.ts             # Web chat inbound
│   │   │   ├── sms/route.ts              # Twilio SMS inbound
│   │   │   ├── sms/status/route.ts       # SMS delivery callbacks
│   │   │   ├── voice/route.ts            # Twilio voice inbound (TwiML)
│   │   │   ├── voice/transcription/route.ts  # Speech-to-text
│   │   │   ├── email/route.ts            # Email webhook inbound
│   │   │   ├── follow-ups/route.ts       # Cron: scheduled follow-ups (15m)
│   │   │   ├── import/route.ts           # Bulk unit import
│   │   │   ├── upgrade/route.ts          # Stripe checkout session
│   │   │   └── benchmarks/route.ts       # Anonymous benchmarking
│   │   ├── webhooks/stripe/route.ts      # Stripe subscription lifecycle
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts         # Create checkout session
│   │   │   └── portal/route.ts           # Billing portal redirect
│   │   └── twilio/
│   │       ├── sms/route.ts              # Twilio SMS webhook
│   │       ├── status/route.ts           # SMS status callbacks
│   │       └── voice/route.ts            # Voice webhook
│   │
│   ├── book/[slug]/page.tsx              # Public showing booking (no auth)
│   ├── join/agent/[token]/page.tsx       # Agent invite accept flow
│   ├── join/agent/[token]/accept/page.tsx
│   ├── submit-deal/[token]/page.tsx      # Public deal submission (no auth)
│   ├── leasing-agent/page.tsx            # Marketing landing page
│   ├── chat/[configSlug]/page.tsx        # Public web chat widget (hosted)
│   │
│   └── (dashboard)/                      # Protected layout (auth + approval required)
│       ├── layout.tsx                    # Sidebar (desktop) + MobileNav (phone)
│       ├── dashboard/                    # Home dashboard
│       ├── contacts/                     # CRM contacts + [id] dossier
│       ├── pipeline/                     # Kanban deal board
│       ├── messages/                     # Gmail inbox + templates
│       ├── calendar/                     # Calendar + showing slots
│       ├── market-intel/                 # NYC property intelligence
│       ├── properties/                   # My Properties unified hub
│       ├── prospecting/                  # Saved prospects from Market Intel
│       ├── portfolios/                   # Portfolio dashboard
│       ├── brokerage/                    # Brokerage Management System (BMS)
│       │   ├── dashboard/               # BMS overview stats
│       │   ├── agents/[id]/             # Agent detail
│       │   ├── my-deals/                # Agent self-service portal
│       │   ├── listings/                # Listing management + bulk upload
│       │   ├── listings/properties/     # Property management
│       │   ├── deal-submissions/        # Approval queue
│       │   ├── transactions/            # Pipeline tracker
│       │   ├── invoices/                # Invoice list + create + bulk
│       │   ├── payments/                # Payment recording
│       │   ├── compliance/              # License/insurance tracking
│       │   ├── commission-plans/        # Plan setup
│       │   ├── reports/                 # Dashboard, production, P&L, tax prep
│       │   ├── leaderboard/             # Agent rankings
│       │   └── settings/                # BMS admin config
│       ├── leasing/                      # AI Leasing Agent
│       │   ├── setup/                   # Onboarding wizard + bulk import
│       │   ├── [configId]/web-chat/     # Web chat config
│       │   ├── [configId]/knowledge/    # FAQ + competitor intel
│       │   ├── [configId]/team/         # Agent assignment + cadences
│       │   ├── analytics/               # Metrics + ROI calculator
│       │   ├── upgrade/success/         # Post-upgrade landing
│       │   └── referral/                # Referral program
│       ├── deals/                        # Deal Modeler / Underwriting
│       │   ├── new/                     # Create workspace
│       │   ├── [id]/                    # Edit workspace
│       │   ├── pipeline/                # Kanban board
│       │   ├── screen/                  # Quick screening tool
│       │   ├── saved/                   # Saved analyses
│       │   ├── compare/                 # Side-by-side comparison
│       │   ├── benchmarks/              # Market cap rates
│       │   ├── comps/                   # Comparable sales research
│       │   ├── closing-costs/           # NYC deal costs
│       │   ├── cap-rates/               # Market analysis
│       │   ├── rent-stabilization/      # RGB modeling
│       │   ├── renovation/              # Cost estimation
│       │   ├── promote/                 # GP/LP waterfall
│       │   ├── documents/               # LOI/PDF exports
│       │   ├── export/                  # LOI, BOV, investment summary
│       │   └── import/                  # CSV upload existing deals
│       └── settings/                     # 17+ settings sub-pages
│           ├── profile/
│           ├── team/
│           ├── gmail/
│           ├── sync/
│           ├── api-keys/
│           ├── pipeline/
│           ├── branding/
│           ├── signature/
│           ├── notifications/
│           ├── hours/
│           ├── lead-rules/
│           ├── ai/
│           ├── export/
│           ├── templates/
│           ├── billing/                 # Stripe subscription management
│           ├── phone/                   # Twilio phone configuration
│           ├── automations/             # Automation engine settings + CRUD
│           └── admin/                   # Admin user/waitlist management
│               ├── users/               # User management (role, plan, team assignment)
│               ├── teams/               # Team CRUD + hierarchy management
│               └── teams/[id]/          # Team detail (members, sub-teams, edit)
│
├── components/
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── sidebar.tsx                  # Desktop (hidden md:flex)
│   │   └── mobile-nav.tsx               # Mobile bottom tab bar
│   ├── bms/                             # Brokerage management UI
│   ├── leasing/                         # AI leasing agent UI
│   ├── research/                        # Deal research widgets
│   └── ui/                              # shadcn + custom (skeleton-shimmer, charts)
│
├── lib/
│   ├── prisma.ts                        # Prisma client singleton (cached in production)
│   ├── utils.ts                         # Shared utilities
│   │
│   │  # Google Workspace AI Tool Layer
│   ├── gws.ts                           # Core gws CLI wrapper (token resolution, Gmail/Cal/Drive/Sheets/Tasks)
│   ├── gws-tools.ts                     # 11 Anthropic tool_use definitions (leasing/email/deal agents)
│   ├── gws-ai-agent.ts                  # Reusable Claude agent runner with gws tool access
│   │
│   │  # Team Hierarchy
│   ├── team-context.ts                  # Get current user's team context (userId, orgId, teamId, teamName)
│   │
│   │  # Gmail & Email
│   ├── gmail.ts                         # Gmail token management + refresh (mutex lock)
│   ├── gmail-sync.ts                    # Initial + incremental Gmail sync
│   ├── gmail-send.ts                    # Send/reply via Gmail API
│   ├── email-parser.ts                  # AI email parsing (Claude)
│   ├── email-categorizer.ts             # Email categorization
│   ├── email-scoring.ts                 # Engagement scoring
│   ├── follow-up-checker.ts             # Follow-up reminder logic
│   │
│   │  # Calendar
│   ├── google-calendar.ts               # Google Calendar 2-way sync
│   │
│   │  # Market Intelligence & NYC Data
│   ├── nyc-opendata.ts                  # NYC Open Data API wrappers
│   ├── data-fusion-engine.ts            # 3-phase progressive building profiles (27KB)
│   ├── entity-resolver.ts               # Fuzzy matching, address normalization
│   ├── cache-manager.ts                 # LRU 3-tier caching (memory, per-source, Supabase)
│   ├── cache-warming.ts                 # Pre-warm cache for map search
│   │
│   │  # Web Search & Scraping (Firecrawl primary, Brave fallback)
│   ├── firecrawl.ts                     # Firecrawl API client (search, scrape, extract, budget)
│   ├── firecrawl-listings.ts            # On-market listing search via Firecrawl
│   ├── firecrawl-comps.ts               # Web comps via Firecrawl
│   ├── firecrawl-entity.ts              # Owner/entity research via Firecrawl
│   ├── brave-search.ts                  # Brave Web Search API wrapper (fallback)
│   ├── brave-listings.ts                # On-market listing search (orchestrates Firecrawl → Brave)
│   ├── brave-comps.ts                   # Web comps (orchestrates Firecrawl → Brave)
│   ├── brave-entity.ts                  # Owner/entity web research (orchestrates Firecrawl → Brave)
│   │
│   │  # Skip Tracing & Enrichment
│   ├── apollo.ts                        # Apollo.io API (people/org search + enrichment)
│   ├── contact-enrichment-pipeline.ts   # PDL + Apollo + PLUTO pipeline
│   ├── zillow-data.ts                   # Zillow rent/sale estimates
│   │
│   │  # Leasing Engine
│   ├── leasing-engine.ts                # Core conversation loop, intent detection, tool execution
│   ├── leasing-prompt.ts                # Building-aware system prompt generation
│   ├── leasing-followups.ts             # Scheduled cadence engine
│   ├── leasing-limits.ts                # Tier-based usage metering
│   ├── leasing-analytics.ts             # Metric aggregation
│   ├── leasing-calendar.ts              # Google Calendar availability + booking
│   ├── leasing-ab.ts                    # A/B testing framework
│   ├── leasing-types.ts                 # Type definitions
│   ├── leasing-waitlist.ts              # Waitlist matching logic
│   ├── leasing-import.ts                # CSV/XLSX unit import
│   ├── leasing-email.ts                 # Email handling + ILS parser
│   ├── leasing-benchmarks.ts            # Cross-building percentiles
│   ├── ils-parser.ts                    # StreetEasy/Apartments/Zillow email parsing
│   │
│   │  # BMS & Finance
│   ├── bms-types.ts                     # Shared types, status labels, Excel mappings
│   ├── bms-auth.ts                      # Role + agent info helpers
│   ├── bms-permissions.ts               # RBAC matrix (4 roles x 24 permissions)
│   ├── bms-audit.ts                     # Fire-and-forget audit logging
│   ├── bms-files.ts                     # File attachment CRUD
│   ├── invoice-simple-pdf.ts            # Commission invoice PDF generator
│   ├── invoice-pdf.ts                   # Alternative invoice format
│   ├── transaction-templates.ts         # Transaction workflow templates
│   │
│   │  # Deal Analysis & Underwriting
│   ├── deal-calculator.ts               # Full underwriting (DCF, IRR, proforma)
│   ├── deal-structure-engine.ts         # 5 deal structures + comparison
│   ├── ai-assumptions.ts               # One-click underwrite generator (15KB)
│   ├── cap-rate-engine.ts               # Market-derived cap rates
│   ├── comps-engine.ts                  # Comparable sales + valuation scoring
│   ├── nyc-deal-costs.ts                # Transfer taxes, MRT, mansion tax, CEMA
│   ├── rent-stabilization.ts            # RGB rates + MCI/IAI
│   ├── ll97-penalties.ts                # LL97 carbon penalty calculation
│   ├── renovation-engine.ts             # Renovation cost estimation
│   ├── promote-engine.ts                # GP/LP waterfall
│   ├── expense-benchmarks.ts            # RGB I&E benchmarks
│   ├── expense-analyzer.ts              # T-12 parsing
│   │
│   │  # Document Generation
│   ├── deal-pdf.ts                      # Deal summary PDF export
│   ├── investment-summary-pdf.ts        # Executive summary generator
│   ├── pdf-report.ts                    # Property analysis PDF
│   ├── pdf-utils.ts                     # PDF generation utilities
│   ├── bov-pdf.ts                       # Build-out validator PDF
│   ├── loi-template.ts                  # LOI template + DOCX
│   ├── loi-pdf.ts                       # LOI PDF generator
│   ├── document-parser.ts               # PDF/Word OCR + parsing
│   ├── document-parser-mappings.ts      # Deal input extraction mappings
│   │
│   │  # Market Data & Economics
│   ├── vitality-engine.ts               # Neighborhood commercial vitality scoring
│   ├── vitality-data.ts                 # POI/retail density calculations
│   ├── fannie-mae.ts                    # GSE loan lookup
│   ├── fhfa.ts                          # House price index
│   ├── fred.ts                          # FRED API (mortgage rates, economic data)
│   ├── hud.ts                           # HUD fair market rents
│   │
│   │  # Maps & Neighborhoods
│   ├── map-layers.ts                    # Leaflet layer definitions
│   ├── map-styles.ts                    # Custom map styling
│   ├── neighborhoods.ts                 # NYC neighborhood data
│   ├── neighborhoods-nys.ts             # NYS neighborhoods
│   ├── neighborhoods-nj.ts              # NJ neighborhoods
│   ├── nyc-zip-centroids.ts             # ZIP code coordinates
│   │
│   │  # Automations Engine
│   ├── automation-types.ts              # Type definitions: triggers, conditions, actions
│   ├── automation-evaluator.ts          # Condition evaluation (7 operators, AND/OR groups)
│   ├── automation-executor.ts           # Action execution (create_task, update_status, notify, add_tag)
│   ├── automation-dispatcher.ts         # Trigger dispatcher + safe wrapper (never throws)
│   │
│   │  # Integrations & Utilities
│   ├── stripe.ts                        # Stripe client + price ID mapping
│   ├── twilio.ts                        # Twilio client initialization
│   ├── encryption.ts                    # AES-256-GCM for sensitive data
│   ├── feature-gate.ts                  # Feature flag system (client)
│   ├── feature-gate-server.ts           # Feature flag system (server)
│   ├── motivation-engine.ts             # Agent motivation + streak logic
│   ├── agent-badges.ts                  # Badge definitions
│   ├── push-notifications.ts            # Web push (VAPID)
│   ├── rss-feed.ts                      # Market news RSS aggregation
│   │
│   └── supabase/
│       ├── client.ts                    # Supabase browser client (.trim() on env)
│       ├── server.ts                    # Supabase server client (.trim() on env)
│       └── middleware.ts                # Auth middleware (session + approval + auto-provisioning)
│
├── middleware.ts                        # Next.js middleware → Supabase session
│
└── prisma/
    └── schema.prisma                    # 72 models, 34 enums

# Root files
├── Dockerfile                           # Multi-stage Docker build (Node 20-Alpine, standalone, gws CLI)
├── docker-entrypoint.sh                 # (exists but not used — CMD node server.js)
├── cloudbuild.yaml                      # Google Cloud Build → Cloud Run
├── next.config.ts                       # standalone output + hardcoded NEXT_PUBLIC_* for edge inlining
└── public/
    ├── manifest.json                    # PWA manifest (standalone, theme #1E40AF)
    ├── favicon.ico
    ├── icon-192.png
    └── icon-512.png
```

## Auth & Approval System
- **Supabase Auth** handles login/signup with email + password
- **Auto-provisioning:** first-time login auto-creates Organization + default Team + User records via middleware
- **User approval gate:** new signups have `isApproved = false` by default (middleware now auto-approves on first signup)
- **Referral attribution:** referral code from cookies applied during auto-provisioning
- **Middleware flow:** authenticated but unapproved users → redirect to `/pending-approval`
- **Public routes** (skip auth/approval): `/login`, `/signup`, `/auth/*`, `/pending-approval`, `/book/*`, `/join/*`, `/submit-deal/*`, `/leasing-agent`, `/chat/*`, `/api/webhooks/*`, `/api/twilio/*`, `/api/stripe/*`, `/api/book`, `/`
- Admin user management at `/settings/admin/users` with role assignment and approval toggles

## Mobile & PWA

### PWA Setup
- `manifest.json`: name="VettdRE CRM", display="standalone", theme="#1E40AF"
- Root `layout.tsx` exports `viewport` (device-width, no scale, viewportFit="cover") and `metadata` (appleWebApp capable, black-translucent status bar, manifest link, apple-touch-icon)

### Mobile Navigation
- **Bottom tab bar** (`mobile-nav.tsx`): fixed bottom, visible on phones (`md:hidden`), 5 tabs: Dashboard, Contacts, Pipeline, Messages (unread badge), More
- **Desktop sidebar** (`sidebar.tsx`): `hidden md:flex` — hidden on mobile
- **Dashboard layout**: `<main className="pb-16 md:pb-0 md:pl-60">`

### Mobile CSS Utilities (`globals.css`)
- `pb-safe` / `pt-safe` — safe area insets for notched devices
- `no-scrollbar` — hides scrollbars for horizontal pill scrolling
- `@keyframes slide-up-sheet` — sheet animation

## Database Schema (72 Models, 34 Enums)

### Core CRM
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Organization** | name, slug, tier, plan (UserPlan), aiLookupsUsed/Limit, stripeCustomerId, stripeSubscriptionId, settings JSON | Multi-tenant root with billing |
| **User** | email, role (UserRole), plan (UserPlan), fullName, title, licenseNumber, brokerage, isApproved, referralCode, referredBy | RBAC + approval + referrals |
| **Contact** | firstName, lastName, email, phone, status, source, qualificationScore, tags[], enrichmentStatus | Core CRM entity |
| **EnrichmentProfile** | contactId, version, employer, jobTitle, linkedinUrl, ownsProperty, rawData JSON, dataSources[], confidenceLevel | PDL/Apollo/PLUTO data |
| **QualificationScore** | contactId, totalScore, financialCapacity, intentSignals, identityVerification, engagementLevel, marketFit | AI scoring |
| **Deal** | contactId, pipelineId, stageId, dealValue, status, winProbability, riskFlags JSON | Pipeline deals |
| **Pipeline** | orgId, name, pipelineType, stages JSON, isDefault | Customizable pipelines |
| **Activity** | contactId, dealId, type, direction, subject, body, isAiGenerated | Timeline events |
| **Task** | contactId, assignedTo, title, type, priority, dueAt, status, aiReasoning | Follow-ups |
| **Property** | address, propertyType, transactionType, status, price, bedrooms, sqft, mlsNumber | Listings |
| **Showing** | contactId, propertyId, scheduledAt, status, interestLevel, feedback | Showing tracking |
| **ContactPropertyInterest** | contactId, propertyId, interestLevel | M:N interest mapping |

### Email System
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **GmailAccount** | userId, email, accessToken, refreshToken, historyId | Gmail OAuth tokens |
| **EmailMessage** | gmailMessageId, threadId, direction, fromEmail, subject, bodyHtml, isRead, isPinned, snoozedUntil, category, aiParsed, leadSource, sentimentScore | Full email storage |
| **EmailLabel** | orgId, name, color, icon | Custom labels |
| **EmailThreadLabel** | threadId, labelId | M:N label assignment |
| **EmailTemplate** | name, subject, body, channel, category, mergeFields[], timesUsed | Reusable templates |
| **FollowUpReminder** | threadId, contactId, reason, dueAt, status | AI-generated reminders |
| **EmailSignature** | userId, template, html, accentColor | Per-user signatures |

### Calendar & Showings
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **CalendarEvent** | googleEventId, title, startAt, endAt, eventType, contactId, propertyAddress, color, attendees JSON, source | Events + Google sync |
| **ShowingSlot** | propertyAddress, startAt, endAt, duration, isBooked, bookedByName/Email/Phone | Public booking slots |

### Market Intel & Prospecting
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **ProspectingList** | orgId, name, status | Prospect list container |
| **ProspectingItem** | address, block, lot, totalUnits, ownerName, lastSalePrice, status, contactId | Building prospects |
| **Portfolio** | orgId, name, slug, totalBuildings, totalUnits, entityNames[] | Owner portfolios (tenant-isolated) |
| **PortfolioBuilding** | portfolioId, orgId, bbl, address, units, ownerName | Buildings in portfolio |
| **BuildingCache** | bbl, sourceType, data JSON, expiresAt | Multi-tier cache for NYC API data |
| **VitalitySnapshot** | neighborhood, scores JSON, updatedAt | Neighborhood commercial vitality |

### Brokerage Management System (BMS)
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **BrokerAgent** | orgId, userId, licenseNumber, splitPercent, status, goals, badges | Agent roster |
| **Transaction** | orgId, type, stage, parties JSON, dates, agentPayout, dealSubmissionId | Main deal entity |
| **TransactionAgent** | transactionId, agentId, role, splitPercent, payoutStatus | Multi-agent splits |
| **TransactionTask** | transactionId, stage, title, dueAt, completedAt | Stage-based checklist |
| **TransactionTemplate** | orgId, name, type, tasks JSON | Reusable workflows |
| **TransactionTemplateTask** | templateId, stage, title, daysDue | Template tasks |
| **DealSubmission** | orgId, token, agentName, address, dealType, status, approvedAt | Public/auth deal submissions |
| **Invoice** | orgId, transactionId, agentSplit, houseSplit, status, paidAt | Commission invoices |
| **CommissionPlan** | orgId, name, type, tiers JSON, isDefault | Tiered commission structures |
| **CommissionTier** | planId, threshold, rate | Plan tier breakpoints |
| **ComplianceDocument** | agentId, type, expiresAt, status | License/insurance/background |
| **Payment** | invoiceId, method, amount, reference, paidAt | Payment records |
| **FileAttachment** | entityType, entityId, fileName, url, uploadedBy | Generic file storage |
| **AgentGoal** | agentId, period, target, actual | Monthly/quarterly/annual targets |
| **AgentBadge** | agentId, type, earnedAt | Gamification badges |

### BMS Listings
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **BmsProperty** | orgId, address, landlordName, totalUnits, notes | Building/property record |
| **BmsListing** | propertyId, unitNumber, rent, bedrooms, status, availableAt | Individual unit listings |

### AI Leasing Agent
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **LeasingConfig** | orgId, tier (LeasingTier), channels, aiPersonality, knowledgeBase JSON | Property setup |
| **LeasingConversation** | configId, channel, prospectPhone/Email, status, temperature, escalationReason | Prospect conversation |
| **LeasingMessage** | conversationId, sender, content, channel, metadata JSON | Individual messages |
| **LeasingFollowUp** | conversationId, type, scheduledAt, status, attempts | Scheduled follow-ups |
| **LeasingDailyUsage** | configId, date, messageCount, tourCount | Usage metering |
| **LeasingBenchmark** | metric, percentiles JSON, sampleSize | Cross-building aggregate stats |

### Phone System
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **PhoneNumber** | orgId, userId, number, status, twilioSid | Twilio number assignment |
| **SmsMessage** | phoneNumberId, contactId, direction, body, status | SMS history |
| **PhoneCall** | phoneNumberId, contactId, direction, duration, recordingUrl, status | Call history |

### Deal Analysis
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **DealAnalysis** | orgId, userId, propertyAddress, inputs JSON, outputs JSON, status | Underwriting workspace |
| **PromoteModel** | dealAnalysisId, structure JSON, returns JSON | GP/LP waterfall modeling |

### Teams & Hierarchy
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Team** | orgId, name, slug, type, parentTeamId, description, logoUrl, settings JSON | Self-referencing hierarchy (org→team→sub-team); types: generic/brokerage/firm/property_manager/investment |

### Settings & System
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **NotificationPreferences** | userId, newLeadEmail, followUpPush, weeklySummaryEmail, etc. | Per-user notification toggles |
| **WorkingHours** | userId, timezone, schedule JSON | Per-user availability |
| **SyncSettings** | userId, autoSync, syncFrequency, syncDepth | Gmail sync config |
| **LeadAssignmentRule** | orgId, method, rules JSON, agentOrder JSON | Lead routing rules |
| **AiSettings** | orgId, autoResponseMode, responseTone, parseModel | AI behavior config |
| **BrandSettings** | orgId, logoUrl, primaryColor, companyName, tagline | White-label branding |
| **Automation** | triggerType, conditions JSON, actions JSON, isActive | Automation rules |
| **AutomationRun** | automationId, triggerData JSON, status | Execution log |
| **AuditLog** | userId, action, entityType, entityId, changes JSON | Audit trail |

### Enums (34)
**Core:** `OrgTier`, `SubscriptionStatus`, `UserRole` (admin, agent, super_admin), `UserPlan`, `ContactStatus`, `ConfidenceLevel`, `PropertyType`, `TransactionType`, `PropertyStatus`, `DealStatus`, `PipelineType`, `ActivityType`, `ActivityDirection`, `TaskType`, `TaskPriority`, `TaskStatus`, `ShowingStatus`, `InterestLevel`, `TemplateChannel`, `AutomationTrigger`

**BMS:** `BmsDealType`, `TransactionStage`, `BmsTransactionType`, `InvoiceStatus`, `CommissionPlanType`, `ComplianceDocType`, `PaymentMethod`, `BrokerageRole`, `BmsListingStatus`, `BmsListingType`, `BmsCommissionType`

**Leasing:** `LeasingTier`, `ConversationStatus`, `LeadTemperature`, `EscalationReason`, `MessageSender`, `ConversationChannel`, `FollowUpType`, `FollowUpStatus`

**Phone:** `PhoneNumberStatus`, `MessageDirection`, `SmsStatus`, `CallDirection`, `CallStatus`

## Feature Details

### Brokerage Management System (BMS) — Working
**Routes:** `/brokerage/*` (16+ sub-pages)

Full brokerage operations platform for managing agents, deals, commissions, and compliance.

**Agent Management:** roster with license tracking, split percentages, goal setting, badge gamification, leaderboard rankings. Agent invite flow via `/join/agent/[token]` with token-based onboarding.

**Deal Pipeline:** public deal submission (`/submit-deal/[token]`), approval queue, transaction lifecycle tracking with stage-based task checklists, multi-agent split allocation.

**Financial:** commission plan builder (tiered/flat/hybrid), invoice generation (single + bulk PDF), payment recording (check/ACH/wire/Stripe), P&L reporting, 1099 tax prep export.

**Compliance:** document tracking for licenses, insurance, background checks with expiration alerts.

**Reports:** dashboard overview, agent production reports, P&L, tax preparation exports.

**RBAC:** 4 brokerage roles (owner, admin, manager, agent) x 24 permissions matrix via `bms-permissions.ts`.

### AI Leasing Agent — Working
**Routes:** `/leasing/*` (10+ sub-pages)

Conversational AI assistant for property managers that handles tenant inquiries across SMS, email, voice, and web chat.

**Conversation Engine:** `leasing-engine.ts` — intent detection, tool execution (tour booking, FAQ answers, waitlist management), context-aware responses using building knowledge base. Now includes 4 Google Workspace tools (calendar check, email confirmation, calendar event creation, email thread search) via `gws-tools.ts`.

**Channels:** Twilio SMS (`/api/leasing/sms`), Twilio voice with transcription (`/api/leasing/voice`), email webhook (`/api/leasing/email`), hosted web chat widget (`/chat/[configSlug]`).

**Follow-Up System:** automated cadence engine (`leasing-followups.ts`) with scheduled messages, 15-minute cron job, configurable intervals and attempt limits.

**Tier System:** free/pro/team tiers with usage metering (`leasing-limits.ts`), Stripe checkout for upgrades.

**Analytics:** response times, conversion rates, tour booking rates, A/B testing framework, cross-building benchmarking with anonymous percentiles.

**Setup:** onboarding wizard, bulk CSV/XLSX unit import, knowledge base editor (FAQs, competitor intel, amenities), web chat customization.

**ILS Integration:** `ils-parser.ts` parses inbound emails from StreetEasy, Apartments.com, Zillow for auto-lead creation.

### Google Workspace AI Tool Layer — Working
**Files:** `lib/gws.ts`, `lib/gws-tools.ts`, `lib/gws-ai-agent.ts`

Enables Claude-powered AI agents to directly interact with Google Workspace (Gmail, Calendar, Drive, Sheets, Tasks) via the `@googleworkspace/cli` npm package.

**Architecture:** `gws.ts` wraps the gws CLI binary, resolving OAuth tokens from the existing `GmailAccount` table. `gws-tools.ts` defines 11 Anthropic `tool_use` compatible tools across 3 agent contexts. `gws-ai-agent.ts` provides a reusable `runGwsAgent()` function for any code path needing Claude + Google Workspace.

**Leasing Agent Tools (4):** `check_agent_calendar` (freebusy lookup), `send_confirmation_email` (tour confirmations), `create_calendar_showing` (book events), `search_email_thread` (find prior conversations). Wired into `leasing-engine.ts` TOOLS array.

**Email/CRM Agent Tools (4):** `draft_follow_up` (Gmail draft), `send_follow_up` (Gmail send), `check_inbox` (search inbox), `create_task_from_email` (Google Tasks). Available via `draftFollowUpWithAI()` and `inboxSummaryWithAI()`.

**Deal Analysis Agent Tools (3):** `search_drive_documents` (Drive search), `export_to_sheets` (Sheets append), `schedule_deal_meeting` (Calendar create). Available via `dealResearchWithAI()`.

**Token Resolution:** Uses existing GmailAccount OAuth tokens — `getOrgGoogleToken(orgId)` for org-level access, `getUserGoogleToken(userId)` for user-specific. Auto-refreshes via `getValidToken()`.

### Team Hierarchy — Working
**Routes:** `/settings/admin/teams`, `/settings/admin/teams/[id]`
**Files:** `settings/admin/team-actions.ts`, `lib/team-context.ts`

Organization → Team → Sub-team hierarchy with user assignment. Teams have types (generic, brokerage, firm, property_manager, investment), self-referencing parent/child relationships, and org-scoped unique slugs.

**Admin UI:** team list with hierarchical display, create/edit/delete, member management (add from unassigned pool, remove), inline sub-team creation. Team column in User Management page with dropdown assignment.

**Auto-provisioning:** new organizations automatically get a default "General" team; new users are assigned to it.

**RBAC:** all team operations require `super_admin` role via `requireAdmin()` guard.

### Deal Modeler / Underwriting — Working
**Routes:** `/deals/*` (15+ sub-pages)

Comprehensive real estate investment analysis toolkit.

**Core Analysis:** `deal-calculator.ts` — DCF modeling, IRR calculation, proforma generation, debt service coverage, cash-on-cash returns.

**Deal Structures:** `deal-structure-engine.ts` — 5 structure types with side-by-side comparison.

**AI Underwriting:** `ai-assumptions.ts` — one-click AI-generated assumptions from address + deal type, pulls market data for rent comps, expense benchmarks, cap rates.

**NYC-Specific Tools:** closing costs calculator (transfer taxes, MRT, mansion tax, CEMA via `nyc-deal-costs.ts`), rent stabilization RGB modeling (`rent-stabilization.ts`), LL97 carbon penalty calculator (`ll97-penalties.ts`), renovation cost estimator (`renovation-engine.ts`).

**Market Data:** cap rate engine with market-derived rates, comparable sales scoring (`comps-engine.ts`), FRED API integration for mortgage rates, HUD fair market rents, Fannie Mae loan data.

**Waterfall Modeling:** GP/LP promote structures with multiple hurdle rates (`promote-engine.ts`).

**Document Export:** deal summary PDF, investment summary PDF, LOI generator (DOCX + PDF), build-out validator PDF.

**Document Import:** `document-parser.ts` — PDF/Word OCR + parsing to auto-extract deal inputs.

### Messages Inbox (Working — Feature-Complete)
**Files:** `messages/messages-view.tsx`, `messages/actions.ts`, plus bulk/label/follow-up/crm/template action files and 6+ components

Three-pane layout with Gmail sync (initial + incremental via historyId, auto-sync every 60s). Thread grouping, folder navigation (Inbox/Sent/Starred/Drafts/Trash/Spam/All Mail), filters (leads/personal/newsletters/snoozed/pinned/unread), compose with contact autocomplete + template library, reply with templates, bulk actions (read/star/pin/label/snooze/archive/delete synced to Gmail), custom labels, snooze with date picker, CRM sidebar (contact card, enrichment, deals, activities, tasks, engagement score), quick create contact from unknown sender with AI-extracted data, AI email parsing (lead source, intent, sentiment, name/phone/budget/area), follow-up reminders, keyboard shortcuts (c/j/k/e/#/s/p/?/Esc), shift-click multi-select.

### Calendar (Working — Feature-Complete)
**Files:** `calendar/calendar-view.tsx` (1900 lines), `calendar/actions.ts`

Four views (month/week/day/agenda), Google Calendar 2-way sync, event types (showing/meeting/open house/inspection/closing/task/milestone/general), auto-duration by type, color picker, Showing Slot Creator (bulk-generate slots), contact/deal linking, type filters. Current time indicator with pulsing dot. Mini calendar sidebar with upcoming events.

### Market Intelligence (Working — Core Feature)
**Files:** `market-intel/market-intel-search.tsx`, `market-intel/actions.ts`, `market-intel/map-search.tsx`, `market-intel/building-profile.tsx`, `market-intel/building-profile-actions.ts`, plus tracerfy/lead-verification/ai-analysis/graph-engine/portfolio-engine/enrichment/map-actions

**4 Search Modes:** Property Search (address → ACRIS + DOB + violations), Ownership Lookup (HPD multifamily buildings with borough/zip/units/owner filters), Name/Portfolio Search (person/LLC across ACRIS + HPD), Map Search (Leaflet interactive map with unit/value/year/floor/zoning/public housing filters).

**Building Profiles (Slide-over Modal):** PLUTO overview, AI Ownership Analysis (0-95% confidence), Smart Contact Directory (AI-ranked, auto-PDL enrichment), Related Properties (real-time portfolio discovery), AI Lead Score with Apollo verification, Distress Score (0-100), HPD Violations/Complaints/Litigation, DOB Permits, ECB Violations, Rent Stabilization status, Speculation Watch List, neighborhood data.

**Data Fusion:** 3-phase progressive rendering via `data-fusion-engine.ts` with `Promise.allSettled()` for resilience, 3-tier caching (LRU memory → per-source → Supabase `BuildingCache`).

**17 NYC Open Data APIs:** Rolling Sales (ACRIS) `usep-8jbt`, PLUTO `64uk-42ks`, DOB Permits `ic3t-wcy2`, DOB Violations `3h2n-5cm9`, HPD Registrations `tesw-yqqr`, HPD Contacts `feu5-w2e2`, HPD Violations `wvxf-dwi5`, HPD Complaints `uwyv-629c`, HPD Litigation `59kj-x8nc`, ECB Violations `6bgk-3dad`, ACRIS Legals `8h5j-fqxa`, ACRIS Master `bnx9-e6tj`, ACRIS Parties `636b-3b5g`, Rent Stabilization `35ss-ekc5`, Speculation Watch List `adax-9x2w`, NYS Entity Names `ekwr-p59j`, NYS Entity Filings `63wc-4exh`.

### Contacts & CRM (Working)
Contact list with status filters, 5-tab dossier (Overview/Details/Activity/Deals/Tasks), AI Lead Intelligence with "Verify & Enrich" (PDL + Apollo + NYC PLUTO), scores 0-100 with A-F grade, activity timeline, task management, tag-based organization, enrichment pipeline with version tracking.

### Pipeline (Working)
Kanban board with drag-and-drop, default 6 stages (New Lead → Contacted → Showing → Offer → Under Contract → Closed), customizable stages, deal values + commission tracking, win/loss tracking, auto-close on "closed" stage.

### Prospecting (Working)
Create/manage prospect lists, save buildings from Market Intel, convert to CRM contacts, create pipeline deals, CSV export (21 columns).

### Settings (17+ Pages)
Profile, Team, Gmail, Sync, API Keys, Pipeline, Branding, Signature, Notifications, Hours, Lead Rules, AI, Export, Templates, **Billing** (Stripe subscription management), **Phone** (Twilio config), **Automations** (rule-based workflow engine), **Admin** (user management with role/plan/team assignment, **Teams** management with hierarchy + member assignment, waitlist management).

### Skip Tracing / Enrichment
- **People Data Labs (PDL)** — primary, instant API, ~$0.02/match. 2-pass strategy.
- **Apollo.io** — Organization Plan. People Search (free), People/Org Enrichment (1 credit each), Bulk Enrich (max 10/call).
- **Tracerfy** — fallback skip trace, CSV upload/polling, $0.02/record.
- **Contact Enrichment Pipeline** — `contact-enrichment-pipeline.ts` orchestrates PDL + Apollo + PLUTO with merge logic.

### Stripe Billing Integration
- `lib/stripe.ts` — Stripe client + price ID mapping for all plan tiers
- `/api/stripe/checkout` — Creates checkout sessions
- `/api/stripe/portal` — Redirects to Stripe billing portal
- `/api/webhooks/stripe` — Handles subscription lifecycle (created, updated, deleted, payment failed)
- Plans: free, explorer, pro, team, enterprise (both core + leasing tiers)
- Feature gating via `feature-gate.ts` / `feature-gate-server.ts` with `UserPlan` context

### Twilio SMS/Voice Integration
- `lib/twilio.ts` — Twilio client initialization
- `/api/twilio/sms` — Inbound SMS webhook
- `/api/twilio/voice` — Inbound voice webhook
- `/api/twilio/status` — Delivery status callbacks
- Phone number management in Settings → Phone
- Used by AI Leasing Agent for multi-channel conversation

### Automations Engine — Working
**Routes:** `/settings/automations`, `/api/automations/cron`

Rule-based workflow automation triggered by CRM events: new leads, deal stage changes, inactivity, overdue tasks, and showing bookings.

**Core Engine:** `automation-types.ts` (type definitions), `automation-evaluator.ts` (condition evaluation with 7 operators + AND/OR group logic), `automation-executor.ts` (4 action types), `automation-dispatcher.ts` (safe fire-and-forget dispatch).

**Trigger Types:** `new_lead` (contact created), `stage_change` (deal advances), `no_activity` (stale contacts), `task_overdue` (past due), `showing_completed` (showing booked).

**Actions:** `create_task` (with template tokens like `{{contactName}}`), `update_contact_status`, `send_notification` (console log MVP), `add_tag` (merge into contact.tags[]).

**Conditions:** JSON condition groups with AND/OR logic. Operators: equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty. Dot-notation field access.

**Fire Points:** `contacts/actions.ts` (new_lead after contact create), `brokerage/transactions/actions.ts` (stage_change after advanceStage), `calendar/actions.ts` (showing_completed after bookShowingSlot). All use `dispatchAutomationSafe()` which never throws.

**Cron:** `/api/automations/cron` (GET, Bearer token auth via CRON_SECRET) — checks no_activity + task_overdue triggers, batch limit 100 per automation.

**Settings UI:** List view with active toggle, run count, last run time; inline expand-to-edit; create form with trigger type radio cards, conditions builder, actions builder; empty state.

## Deployment

### Docker
- Multi-stage Dockerfile: builder (Node 20-Alpine, Prisma generate, npm run build) → runner (standalone)
- Port: 8080, non-root user: `nextjs`
- `NEXT_PUBLIC_*` vars passed as Docker build args AND hardcoded in `next.config.ts` for reliable Turbopack edge inlining
- `.env.production` generated during build as additional fallback
- CMD: `node server.js` (no entrypoint script — Prisma migrations run separately)

### Google Cloud Run
- `cloudbuild.yaml`: 3 steps (docker build, push, gcloud run deploy)
- Registry: `us-east1-docker.pkg.dev`
- Instance: 1Gi memory, 1 CPU, 80 concurrency, 300s timeout
- Scaling: 0-10 instances
- 35 runtime secrets via Cloud Secret Manager `--set-secrets` (all API keys, Stripe, Twilio, data APIs, VAPID, encryption keys)
- 5 build-time secrets via `availableSecrets` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY)
- Secret creation script: `bash scripts/create-secrets.sh`

### Known Deployment Issue
- Next.js 16 Turbopack does NOT reliably inline `process.env.NEXT_PUBLIC_*` from Docker build args into edge middleware bundles
- **Workaround:** Public Supabase keys are hardcoded in `next.config.ts` `env` section to force edge inlining
- This is required for the Supabase SSR middleware to function in Cloud Run

## Pending / Incomplete Features
| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard real stats | **Needs work** | Currently shows placeholder stats, needs real data queries |
| Properties page | **Working** | Unified hub aggregating BMS Listings, CRM Deals, Showings, Prospecting Items |
| Automations | **Working (MVP)** | Engine + CRUD + cron + UI complete; Phase 2: send_email action, templates, run history viewer |
| Mobile page layouts | **In progress** | Bottom nav done; pages need responsive adaptation |
| Service worker | **Not started** | No offline support / true PWA installability |
| cloudbuild.yaml secrets | **Complete** | All 35 runtime secrets configured; run `scripts/create-secrets.sh` for GCP |
| Google Workspace AI tools | **Working** | 11 gws tools wired into leasing engine + reusable agent runner; needs UI exposure for email/deal agents |
| Team hierarchy | **Working (Phase 1)** | Schema, CRUD, admin UI, auto-provisioning done; Phase 2: team-scoped data filtering, team dashboards |

## Known Issues / Tech Debt
1. **"use server" constraint** — Next.js 16 requires ALL exported functions in "use server" files to be async
2. **Map marker error** — "Cannot read properties of undefined (reading 'x')" in map-search.tsx when map hasn't initialized
3. **Lead scoring** — grading thresholds need tuning for buyer vs seller vs owner contact types
4. **Dashboard** — shows hardcoded placeholder data, not wired to real queries
5. **Gmail token encryption** — `encryption.ts` created but not yet wired into Gmail token read/write
6. **Edge env var workaround** — NEXT_PUBLIC keys hardcoded in next.config.ts due to Turbopack edge bundling issue
7. **docker-entrypoint.sh** — exists on disk but not referenced by Dockerfile (abandoned approach for Prisma migrations at startup)

## Recent Changes (2026-03-07)
- **NEW:** Google Workspace AI tool layer — 11 Anthropic tool_use tools via `@googleworkspace/cli` (gws.ts, gws-tools.ts, gws-ai-agent.ts)
- **NEW:** Leasing engine now has 9 tools (5 original + 4 gws: calendar check, email confirm, calendar create, email thread search)
- **NEW:** Team hierarchy — Team model with self-referencing parent/sub-team, admin CRUD UI at `/settings/admin/teams`
- **NEW:** `super_admin` role added to UserRole enum; admin pages use role-based auth instead of hardcoded email
- **NEW:** Auto-provisioning creates default "General" team for new orgs; users assigned on signup
- **NEW:** User Management page shows team name + team assignment dropdown
- **NEW:** Dockerfile installs `@googleworkspace/cli` globally in production runner
- **CRITICAL:** Fixed Cloud Run container startup — removed Prisma migration entrypoint that blocked server start
- **CRITICAL:** Hardcoded NEXT_PUBLIC Supabase keys in next.config.ts to fix edge middleware `Invalid supabaseUrl` crash
- **CRITICAL:** Added `.trim()` to all Supabase client env var reads for whitespace resilience
- **HIGH:** Traffic routing fixed — new revisions now receive 100% traffic via `--to-latest`
- **VERIFIED:** Admin Users page shows Role column correctly in production
- **VERIFIED:** Market Intel building profiles open correctly with full data (owner, violations, contacts)

## Previous Audit Fixes (2026-03-06)
- Removed hardcoded Supabase keys from `cloudbuild.yaml` → Secret Manager
- Fixed middleware auto-approval bypass → unapproved users properly blocked
- Added `orgId` to Portfolio/PortfolioBuilding for tenant isolation
- Prisma singleton now cached in production → prevents connection pool exhaustion
- Added 10+ missing database indexes
- Gmail token refresh race condition fixed with in-memory mutex
- OAuth state parameter HMAC-signed with CSRF verification
- AI email parsing rate-limited (100/hr default)
- Security headers (HSTS, nosniff, X-Frame-Options, etc.)
- `Promise.allSettled()` in data-fusion-engine for resilience
- Docker layer caching optimized
- Contacts query paginated (default 200, cap 500)

## Coding Conventions
- All server action files use `"use server"` directive; all exports must be `async`
- NYC API calls go through `actions.ts` in market-intel
- Use `Array.isArray()` checks before spreading API response arrays
- Serialize data with `JSON.parse(JSON.stringify(obj))` when passing Server → Client components
- Tailwind for all styling; custom animations in `globals.css`
- Use `circleMarker` not `Marker` for Leaflet map performance
- Lucide React for SVG icons; emoji icons in some UI elements
- Modal pattern: `bg-black/30` backdrop + `modal-in` animation; use `entered` state for backdrop fade
- Thread row selection uses inset box-shadow instead of border-left (avoids layout shift)
- Mobile responsive: `md:` breakpoint splits mobile (bottom tab bar) vs desktop (sidebar); use `pb-safe` for notched devices
- BMS permissions: always check via `bms-permissions.ts` matrix before operations
- Feature gating: use `hasPermission(feature, plan)` for plan-locked features
- Leasing tier checks: use `leasing-limits.ts` for metering before AI responses
