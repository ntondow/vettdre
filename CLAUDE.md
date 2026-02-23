# VettdRE — AI-Native NYC Real Estate CRM

## Project Overview
VettdRE is a CRM platform for NYC real estate agents combining traditional CRM with AI-powered property intelligence. The key differentiator is Market Intelligence — integrating 17+ NYC Open Data APIs with skip tracing (People Data Labs) and professional enrichment (Apollo.io) to identify property owners, discover portfolios, and score leads automatically.

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router, Turbopack, standalone output)
- **Language:** TypeScript 5 (strict mode)
- **React:** 19.2.3
- **Database:** PostgreSQL via Supabase (Session Pooler)
- **ORM:** Prisma 5.22
- **Auth:** Supabase Auth with SSR middleware + user approval system
- **Styling:** Tailwind CSS 4 (custom animations + mobile utilities in `globals.css`)
- **Icons:** Lucide React + emoji icons in some UI elements
- **Maps:** Leaflet + OpenStreetMap (dynamic import, `circleMarker` for performance)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk` ^0.76.0)
- **Skip Tracing:** People Data Labs API (primary), Tracerfy API (fallback)
- **Professional Enrichment:** Apollo.io API (Organization Plan — People Search, People Enrichment, Org Enrichment, Bulk Enrich)
- **Deployment:** Docker + Google Cloud Run (cloudbuild.yaml)
- **Utilities:** clsx, tailwind-merge

## Environment Variables
```
DATABASE_URL=                    # Supabase Session Pooler (port 5432)
DIRECT_URL=                      # Supabase Direct connection (port 5432)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=               # Claude AI for ownership analysis + email parsing
PDL_API_KEY=                     # People Data Labs skip tracing
APOLLO_API_KEY=                  # Apollo.io (used in market-intel/lead-verification.ts)
TRACERFY_API_KEY=                # Tracerfy skip trace (fallback, CSV-based)
BRAVE_SEARCH_API_KEY=            # Brave Web Search API (on-market listings, web comps, entity research)
GOOGLE_CLIENT_ID=                # Gmail + Calendar OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
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
│   │   ├── login/page.tsx         # Email/password login
│   │   ├── signup/page.tsx        # Registration with email confirmation
│   │   └── pending-approval/page.tsx  # Shown when user account not yet approved
│   │
│   ├── auth/callback/route.ts     # Supabase OAuth callback
│   │
│   ├── api/
│   │   ├── auth/gmail/route.ts           # Gmail OAuth initiation
│   │   ├── auth/gmail/callback/route.ts  # Gmail OAuth callback → stores tokens
│   │   └── book/route.ts                 # Public showing booking endpoint
│   │
│   ├── book/[slug]/page.tsx       # Public showing booking page (no auth)
│   │
│   └── (dashboard)/               # Protected layout (auth + approval required)
│       ├── layout.tsx             # Sidebar (desktop) + MobileNav (phone) + responsive main
│       ├── dashboard/             # Home dashboard
│       ├── contacts/              # CRM contacts + [id] detail
│       ├── pipeline/              # Kanban deal board
│       ├── messages/              # Gmail inbox + templates
│       ├── calendar/              # Calendar + showing slots
│       ├── market-intel/          # NYC property intelligence (core feature)
│       ├── properties/            # Property listings (minimal)
│       ├── prospecting/           # Saved prospects from Market Intel
│       ├── portfolios/            # Portfolio dashboard (schema exists, basic UI)
│       └── settings/              # 14 settings sub-pages
│
├── components/layout/
│   ├── header.tsx                 # Top navigation bar
│   ├── sidebar.tsx                # Desktop left sidebar (hidden on mobile: hidden md:flex)
│   └── mobile-nav.tsx             # Mobile bottom tab bar + "More" sheet overlay
│
├── lib/
│   ├── prisma.ts                  # Prisma client singleton
│   ├── utils.ts                   # Shared utilities
│   ├── gmail.ts                   # Gmail token management + refresh
│   ├── gmail-sync.ts              # Initial + incremental Gmail sync engine
│   ├── gmail-send.ts              # Send/reply via Gmail API
│   ├── google-calendar.ts         # Google Calendar sync (16KB, full 2-way)
│   ├── email-parser.ts            # AI email parsing (Claude) — extracts lead data
│   ├── email-categorizer.ts       # Email categorization (lead source, intent, sentiment)
│   ├── email-scoring.ts           # Email engagement scoring algorithm
│   ├── follow-up-checker.ts       # Follow-up reminder trigger logic
│   ├── nyc-opendata.ts            # NYC Open Data API helpers
│   ├── apollo.ts                  # Apollo.io API: enrich person/org, search people, bulk enrich, merge logic
│   ├── zillow-data.ts             # Zillow rent/sale estimates
│   ├── entity-resolver.ts         # Fuzzy matching, address normalization, owner resolution across sources
│   ├── data-fusion-engine.ts      # Central aggregation: 14 NYC APIs + Brave + scoring + caching
│   ├── brave-search.ts            # Brave Search API wrapper (Web Search + Summarizer)
│   ├── brave-listings.ts          # Live listings search via Brave, listing parser, dedup
│   ├── brave-comps.ts             # Web comps: merge Brave results with DOF Rolling Sales
│   ├── brave-entity.ts            # Owner/entity web research: news, courts, corporate records
│   └── supabase/
│       ├── client.ts              # Supabase browser client
│       ├── server.ts              # Supabase server client
│       └── middleware.ts           # Auth middleware (session + approval check)
│
├── middleware.ts                   # Next.js middleware → Supabase session
│
└── prisma/
    └── schema.prisma              # 30 models, 17 enums

# Root files
├── Dockerfile                     # Multi-stage Docker build (Node 20-Alpine, standalone)
├── cloudbuild.yaml                # Google Cloud Build → Cloud Run deployment
├── next.config.ts                 # output: "standalone"
└── public/
    ├── manifest.json              # PWA manifest (standalone, theme #1E40AF)
    ├── favicon.ico
    ├── icon-192.png               # PWA icon 192x192
    └── icon-512.png               # PWA icon 512x512
```

## Auth & Approval System
- **Supabase Auth** handles login/signup with email + password
- **User approval gate:** new signups have `isApproved = false` by default
- **Middleware flow:** authenticated but unapproved users → redirect to `/pending-approval`
- **Public routes** (skip approval check): `/login`, `/signup`, `/auth/*`, `/pending-approval`, `/book/*`, `/`
- Admin must set `isApproved = true` on User record to grant dashboard access

## Mobile & PWA

### PWA Setup
- `manifest.json`: name="VettdRE CRM", display="standalone", theme="#1E40AF"
- Root `layout.tsx` exports `viewport` (device-width, no scale, viewportFit="cover") and `metadata` (appleWebApp capable, black-translucent status bar, manifest link, apple-touch-icon)
- `<meta name="theme-color" content="#1E40AF" />` in `<head>`

### Mobile Navigation
- **Bottom tab bar** (`mobile-nav.tsx`): fixed bottom, visible on phones (`md:hidden`)
  - 5 tabs: Dashboard, Contacts, Pipeline, Messages (with unread badge), More
  - "More" opens a slide-up sheet with: Properties, Tasks, Calendar, AI Insights, Analytics, Prospecting, Market Intel, Settings + Sign out
  - Sheet has backdrop, drag handle, smooth enter/exit transitions
- **Desktop sidebar** (`sidebar.tsx`): `hidden md:flex` — hidden on mobile
- **Dashboard layout**: `<main className="pb-16 md:pb-0 md:pl-60">` — bottom padding for tab bar on mobile, left padding for sidebar on desktop

### Mobile CSS Utilities (`globals.css`)
- `pb-safe` / `pt-safe` — safe area insets for notched devices
- `no-scrollbar` — hides scrollbars for horizontal pill scrolling
- `@keyframes slide-up-sheet` — sheet animation

### Mobile Optimizations Still Needed
- Page-specific responsive layouts (contacts card view, messages pane adaptation, pipeline vertical stages, calendar agenda-first on mobile, market-intel full-screen building profiles)
- Touch targets (44x44px minimum), input font-size (16px to prevent iOS zoom)
- Service worker / offline support not yet implemented

## Routes & Pages

### Auth (Public)
| Route | Description |
|-------|-------------|
| `/login` | Email/password login |
| `/signup` | Registration with email confirmation |
| `/pending-approval` | Approval pending page (unapproved users) |
| `/auth/callback` | Supabase OAuth callback |
| `/book/[slug]` | Public showing booking (no auth required) |

### API Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/gmail` | GET | Initiates Gmail OAuth flow |
| `/api/auth/gmail/callback` | GET | Gmail OAuth callback, stores tokens |
| `/api/book` | POST | Public showing slot reservation |

### Dashboard (Protected — requires auth + approval)
| Route | Status | Description |
|-------|--------|-------------|
| `/dashboard` | **Basic** | Welcome + placeholder stats (needs real data) |
| `/contacts` | **Working** | Contact list with filters, create/edit forms |
| `/contacts/[id]` | **Working** | 5-tab dossier: Overview, Details, Activity, Deals, Tasks + AI enrichment |
| `/pipeline` | **Working** | Kanban board with drag-and-drop, 6 default stages |
| `/messages` | **Working** | Gmail inbox: threads, compose, reply, labels, snooze, pin, bulk actions, CRM sidebar |
| `/messages/templates` | **Working** | Email template CRUD with categories + merge variables |
| `/calendar` | **Working** | Month/week/day/agenda views, Google Calendar sync, showing slot creator |
| `/market-intel` | **Working** | 4 search modes: Property, Ownership, Name/Portfolio, Map |
| `/properties` | **Minimal** | Empty state placeholder — needs full implementation |
| `/prospecting` | **Working** | Saved prospect lists from Market Intel, convert to contacts/deals, CSV export |
| `/portfolios` | **Basic** | Schema + basic UI exists, not actively used |

### Settings (14 sub-pages)
| Route | Status | Description |
|-------|--------|-------------|
| `/settings/profile` | **Working** | Name, phone, title, license, brokerage |
| `/settings/team` | **Working** | Team members, roles (owner/admin/manager/agent/viewer), invites |
| `/settings/gmail` | **Working** | Gmail connection status, re-auth, disconnect |
| `/settings/sync` | **Working** | Auto-sync toggle, frequency, depth, label selection |
| `/settings/api-keys` | **Working** | Status + test connections for PDL, Apollo, Tracerfy, Anthropic, Gmail |
| `/settings/pipeline` | **Working** | Customize pipeline stages (names, colors, order) |
| `/settings/branding` | **Working** | Company name, tagline, website, primary color, logo |
| `/settings/signature` | **Working** | Email signature builder with 3 templates + live preview |
| `/settings/notifications` | **Working** | Email/push toggles for leads, emails, tasks, reports |
| `/settings/hours` | **Working** | Timezone + per-day working hours schedule |
| `/settings/lead-rules` | **Working** | Lead assignment: manual, round robin, by source, by geography |
| `/settings/ai` | **Working** | Auto-response mode/delay/tone, email parsing model selection |
| `/settings/export` | **Working** | CSV export: contacts, deals, emails, full backup |
| `/settings/templates` | **Working** | Email template CRUD (alternate location) |

### Placeholder Routes (in sidebar nav, not yet built)
| Route | Sidebar Label | Notes |
|-------|---------------|-------|
| `/tasks` | Tasks | Standalone task management page — not yet implemented |
| `/insights` | AI Insights | AI-powered insights dashboard — not yet implemented |
| `/analytics` | Analytics | Analytics/reporting dashboard — not yet implemented |

## Database Schema (30 Models)

### Core CRM
| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Organization** | name, slug, tier (solo/pro/enterprise), aiLookupsUsed/Limit, settings JSON | Multi-tenant root |
| **User** | email, role (UserRole enum), fullName, title, licenseNumber, brokerage, **isApproved** | RBAC with 5 roles + approval gate |
| **Contact** | firstName, lastName, email, phone, status (ContactStatus), source, qualificationScore, tags[], enrichmentStatus | Core CRM entity |
| **EnrichmentProfile** | contactId, version, employer, jobTitle, linkedinUrl, ownsProperty, rawData JSON, dataSources[], confidenceLevel | PDL/Apollo/PLUTO data |
| **QualificationScore** | contactId, totalScore, financialCapacity, intentSignals, identityVerification, engagementLevel, marketFit | AI scoring breakdown |
| **Deal** | contactId, pipelineId, stageId, dealValue, status (open/won/lost), winProbability, riskFlags JSON | Pipeline deals |
| **Pipeline** | orgId, name, pipelineType, stages JSON, isDefault | Customizable pipelines |
| **Activity** | contactId, dealId, type (ActivityType), direction, subject, body, isAiGenerated | Timeline events |
| **Task** | contactId, assignedTo, title, type (TaskType), priority, dueAt, status, aiReasoning | Follow-ups |
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
| **Portfolio** | name, slug, totalBuildings, totalUnits, entityNames[] | Owner portfolios |
| **PortfolioBuilding** | portfolioId, bbl, address, units, ownerName | Buildings in portfolio |

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

### Enums (17)
`OrgTier`, `SubscriptionStatus`, `UserRole`, `ContactStatus`, `ConfidenceLevel`, `PropertyType`, `TransactionType`, `PropertyStatus`, `DealStatus`, `PipelineType`, `ActivityType`, `ActivityDirection`, `TaskType`, `TaskPriority`, `TaskStatus`, `ShowingStatus`, `InterestLevel`, `TemplateChannel`, `AutomationTrigger`

## Feature Details

### Messages Inbox (Working — Feature-Complete)
**Files:** `messages/messages-view.tsx` (1232 lines), `messages/actions.ts`, `messages/bulk-actions.ts`, `messages/label-actions.ts`, `messages/follow-up-actions.ts`, `messages/crm-actions.ts`, `messages/template-actions.ts`, plus 6 components in `messages/components/`

- Three-pane layout: folder/thread list (left), thread detail (center), CRM sidebar (right)
- Gmail sync: initial full sync + incremental via historyId, auto-sync every 60s
- Thread grouping with smart aggregation (participants, message count, snippet, AI metadata)
- Gmail folder navigation: Inbox, Sent, Starred, Drafts, Trash, Spam, All Mail
- Filter by: all, leads, personal, newsletters, snoozed, pinned, unread, lead source
- Search with debounce
- Compose modal with contact autocomplete and template library
- Reply with templates (7 defaults: Follow Up, Schedule Showing, Application, etc.)
- Bulk actions: mark read/unread, star, pin, label, snooze, archive, delete (syncs back to Gmail)
- Custom labels (5 defaults: Hot Lead, Follow Up, Active Deal, Showing, Archived)
- Snooze with date picker (auto-unsnooze on page load)
- Pin threads (persisted in DB)
- CRM sidebar: shows contact card, enrichment data, deals, activities, tasks, engagement score
- Quick create contact/lead from unknown sender with AI-extracted data
- AI email parsing: lead source, intent, sentiment score, extracted name/phone/budget/area
- Follow-up reminders with banner
- Keyboard shortcuts: c (compose), j/k (navigate), e (archive), # (delete), s (star), p (pin), / (search), ? (shortcuts modal), Esc (close)
- Toast notifications for new emails
- Shift-click multi-select for bulk operations

### Calendar (Working — Feature-Complete)
**Files:** `calendar/calendar-view.tsx` (1900 lines), `calendar/actions.ts`

- Four views: month, week, day, agenda (with smooth fade transitions between views)
- Month view: day grid with event pills, "+N more" pill, quick-create "+" button per day
- Week view: time grid (6AM-10PM), overlapping event layout algorithm (Google Calendar style), all-day row
- Day view: expanded time grid (80px/hour) with event sidebar list
- Agenda view: 2-week lookahead, grouped by day with staggered entrance animations
- Current time indicator: red line + pulsing dot (week + day views)
- Mini calendar sidebar: month navigation, event dots, upcoming events list
- Event CRUD with Google Calendar 2-way sync
- Event types: showing, meeting, open house, inspection, closing, task, milestone, general
- Auto-duration by event type (showing=30m, meeting=60m, open house=120m, etc.)
- Color picker per event
- Showing Slot Creator: bulk-generate slots for a property (address, date, time range, duration, break between)
- Tasks displayed on calendar as 30-minute blocks
- Contact and deal linking on events
- Type filter dropdown
- Unified modal: view mode (details + edit/delete) and create/edit mode (full form)

### Contacts & CRM (Working)
**Files:** `contacts/contact-list.tsx`, `contacts/contact-form.tsx`, `contacts/actions.ts`, `contacts/[id]/contact-dossier.tsx`, `contacts/[id]/actions.ts`, `contacts/[id]/enrich-actions.ts`

- Contact list with status filters
- 5-tab contact dossier: Overview, Details, Activity, Deals, Tasks
- AI Lead Intelligence card: "Verify & Enrich" triggers PDL + NYC PLUTO lookup
  - Scores 0-100 with A-F grade
  - Shows: job title, company, LinkedIn, phones, emails, NYC properties owned
  - Saves to EnrichmentProfile with version tracking
- Activity timeline: notes, calls, emails, meetings
- Task management with priority and due dates
- Tag-based organization
- Enrichment pipeline: PDL (2-pass strategy) -> NYC PLUTO -> scoring algorithm

### Pipeline (Working)
**Files:** `pipeline/pipeline-board.tsx`, `pipeline/actions.ts`

- Kanban board with drag-and-drop
- Default 6 stages: New Lead -> Contacted -> Showing -> Offer -> Under Contract -> Closed
- Customizable stages via settings
- Deal values and commission tracking
- Contact + property linking
- Win/loss tracking with reasons
- Auto-close when moved to "closed" stage

### Market Intelligence (Working — Core Feature)
**Files:** `market-intel/market-intel-search.tsx`, `market-intel/actions.ts`, `market-intel/map-search.tsx`, `market-intel/building-profile.tsx`, `market-intel/building-profile-actions.ts`, `market-intel/tracerfy.ts`, `market-intel/lead-verification.ts`, `market-intel/ai-analysis.ts`, `market-intel/graph-engine.ts`, `market-intel/portfolio-engine.ts`, `market-intel/enrichment.ts`, `market-intel/map-actions.ts`

**4 Search Modes:**
1. **Property Search** — address-based, pulls ACRIS sales + DOB permits + violations
2. **Ownership Lookup** — HPD-registered multifamily buildings, filter by borough/zip/street/units/owner
3. **Name/Portfolio Search** — person/LLC name across ACRIS parties + HPD contacts
4. **Map Search** — Leaflet interactive map with filters (units, value, year, floors, zoning, public housing toggle)

**Building Profiles (Slide-over Modal):**
- PLUTO overview (units, floors, year, assessed value, zoning, FAR)
- AI Ownership Analysis with confidence score (0-95%)
- Smart Contact Directory — AI-ranked contacts from HPD + DOB, auto-PDL enrichment
- Related Properties — real-time portfolio discovery
- AI Lead Score with Apollo verification
- Distress Score (0-100) with signals
- HPD Violations (class A/B/C counts)
- HPD Complaints (311 data with top types)
- DOB Permits
- HPD Litigation
- ECB Violations with penalties
- Rent Stabilization status
- Speculation Watch List status
- Neighborhood data

**17 NYC Open Data APIs:**
1. Rolling Sales (ACRIS) — `usep-8jbt`
2. PLUTO — `64uk-42ks`
3. DOB Permits — `ic3t-wcy2`
4. DOB Violations — `3h2n-5cm9`
5. HPD Registrations — `tesw-yqqr`
6. HPD Contacts — `feu5-w2e2`
7. HPD Violations — `wvxf-dwi5`
8. HPD Complaints — `uwyv-629c`
9. HPD Litigation — `59kj-x8nc`
10. ECB Violations — `6bgk-3dad`
11. ACRIS Legals — `8h5j-fqxa`
12. ACRIS Master — `bnx9-e6tj`
13. ACRIS Parties — `636b-3b5g`
14. Rent Stabilization — `35ss-ekc5`
15. Speculation Watch List — `adax-9x2w`
16. NYS Entity Names — `ekwr-p59j`
17. NYS Entity Filings — `63wc-4exh`

### Prospecting (Working)
**Files:** `prospecting/prospecting-dashboard.tsx`, `prospecting/actions.ts`

- Create/manage prospect lists
- Save buildings from Market Intel
- Convert prospects to CRM contacts
- Create pipeline deals from prospects
- CSV export (21 columns: address, units, owner, contact info, etc.)

### Email Templates (Working)
**Files:** `messages/templates/page.tsx`, `messages/template-actions.ts`

- CRUD for templates with categories: Follow Up, Showing, Application, Welcome, Nurture, Cold Outreach, Custom
- Merge variables support
- Usage tracking (timesUsed, lastUsedAt)
- 7 default templates auto-seeded
- Accessible from compose modal and quick-reply bar

### Public Showing Booking (Working)
**Files:** `book/[slug]/page.tsx`, `api/book/route.ts`

- Shareable booking page per property (no auth)
- Displays available time slots
- Visitor fills in name, email, phone, notes
- Auto-creates Contact + CalendarEvent, marks slot as booked

### Settings (Working — 14 Pages)
**Files:** `settings/actions.ts` (all settings operations), 14 page files

- Profile, Team, Gmail, Sync, API Keys, Pipeline, Branding, Signature, Notifications, Hours, Lead Rules, AI, Export, Templates
- All settings persisted to dedicated DB tables
- API key test connections
- CSV export for contacts/deals/emails

### Skip Tracing / Enrichment
- **People Data Labs (PDL)** — primary, instant API, ~$0.02/match
  - Used in: building profiles (auto-enrich top owner), CRM contacts (Verify & Enrich)
  - Returns: phones, emails, job title, company, LinkedIn, mailing address
  - 2-pass strategy: first by name+location, retry with relaxed params if no match
- **Apollo.io** — professional database (Organization Plan)
  - Core library: `src/lib/apollo.ts` (enrichPerson, enrichOrganization, findPeopleAtOrg, bulkEnrich, testConnection, merge logic)
  - Used in: building-profile-actions.ts (auto-enrich owner + org), enrich-actions.ts (dual-source with PDL), lead-verification.ts (scoring signals), contacts/actions.ts (bulk enrich)
  - People Search: FREE (find people at org by title)
  - People Enrichment: 1 credit (email, phone, LinkedIn, title, company)
  - Org Enrichment: 1 credit (industry, revenue, employees, phone, website, logo)
  - Bulk Enrich: credits (max 10 per call)
  - Returns: verified email, direct phone, title, seniority, LinkedIn photo, company intel
- **Tracerfy** — fallback skip trace, CSV upload/polling, $0.02/record

## Deployment

### Docker
- Multi-stage Dockerfile: builder (Node 20-Alpine) -> runner (standalone)
- Port: 8080
- Non-root user: `nextjs`
- Includes Prisma client, public assets, Zillow data directory

### Google Cloud Run
- `cloudbuild.yaml` configured for Cloud Build pipeline
- Registry: `us-east1-docker.pkg.dev`
- Instance: 1Gi memory, 1 CPU, 80 concurrency, 300s timeout
- Scaling: 0-10 instances
- 11 secrets via Cloud Secret Manager

## Pending / Incomplete Features
| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard real stats | **Needs work** | Currently shows placeholder stats, needs real data queries |
| Tasks page (`/tasks`) | **Not built** | Referenced in sidebar nav, no route exists yet |
| AI Insights page (`/insights`) | **Not built** | Referenced in sidebar nav, no route exists yet |
| Analytics page (`/analytics`) | **Not built** | Referenced in sidebar nav, no route exists yet |
| Properties page | **Minimal** | Empty state only, needs full listing management |
| Portfolios | **Basic** | Schema + basic UI exists, not actively used |
| Automations | **Schema only** | Automation + AutomationRun models exist, no UI or engine |
| Mobile page layouts | **In progress** | Bottom nav done; individual pages need responsive adaptation |
| Service worker | **Not started** | No offline support / true PWA installability |
| SMS integration | **Not started** | Twilio/SendGrid |

## Known Issues / Tech Debt
1. **Apollo API** — Organization Plan active. Full integration: People Search (free), People/Org Enrichment (credits), Bulk Enrich
2. **Map marker error** — "Cannot read properties of undefined (reading 'x')" in map-search.tsx when map hasn't initialized
3. **"use server" constraint** — Next.js 16 requires ALL exported functions in "use server" files to be async
4. **Prisma connection drops** — occasional "Error in PostgreSQL connection: Error { kind: Closed }" from Supabase pooler
5. **Lead scoring** — grading thresholds need tuning for buyer vs seller vs owner contact types
6. **Dashboard** — shows hardcoded placeholder data, not wired to real queries

## Coding Conventions
- All server action files use `"use server"` directive
- All exported functions in server files must be `async` (Next.js 16 requirement)
- NYC API calls go through `actions.ts` in market-intel
- Use `Array.isArray()` checks before spreading API response arrays (PDL returns non-arrays sometimes)
- Serialize data with `JSON.parse(JSON.stringify(obj))` when passing Server -> Client components (Dates, Decimals)
- Tailwind for all styling; custom animations in `globals.css` (fade-in, modal-in, slide-up, slide-up-sheet)
- Use `circleMarker` not `Marker` for Leaflet map performance
- Lucide React for SVG icons; emoji icons in some UI elements (folders, categories)
- Modal pattern: `bg-black/30` backdrop + `modal-in` animation; use `entered` state for backdrop fade
- Thread row selection uses inset box-shadow instead of border-left (avoids layout shift)
- Mobile responsive: `md:` breakpoint splits mobile (bottom tab bar) vs desktop (sidebar); use `pb-safe` for notched devices
