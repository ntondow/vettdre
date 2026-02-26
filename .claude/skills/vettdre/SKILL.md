---
name: vettdre
description: VettdRE is a NYC/NYS/NJ commercial real estate intelligence SaaS platform built with Next.js 16, Prisma, Supabase, and Stripe. Use this skill for ANY task involving the VettdRE codebase — building features, fixing bugs, debugging deployments, writing server actions, updating the UI, working with real estate data APIs, or modifying the billing/permissions system. This skill contains the full architecture, file structure, data source catalog, coding conventions, and deployment pipeline.
---

# VettdRE — Codebase Intelligence Skill

## What is VettdRE?

A real estate intelligence platform for NYC commercial real estate professionals. Users search properties across NYC, New York State, and New Jersey, view unified building profiles aggregated from 17+ public data sources, model deals with AI-powered underwriting, prospect building owners, and run outreach campaigns.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) via Prisma ORM |
| Auth | Supabase Auth (email/password, magic links) |
| Payments | Stripe (Checkout, Webhooks, Billing Portal) |
| Hosting | Google Cloud Run (Docker, us-east1) |
| Build | Cloud Build (cloudbuild.yaml) |
| Maps | Leaflet (dynamic import, no SSR) |
| AI | Anthropic Claude API (deal assumptions, AI underwriting, email parsing) |
| Search | Brave Search API (live listings, entity research, web comps) |
| Enrichment | Apollo.io (people/org enrichment), People Data Labs (skip tracing) |
| Communication | Twilio (SMS + voice), Gmail API (OAuth) |
| Styling | Tailwind CSS + shadcn/ui components |

## File Structure — src/lib/ (58 files)

### Core Infrastructure
| File | Purpose |
|------|---------|
| `prisma.ts` | Prisma ORM client singleton with connection pool management |
| `utils.ts` | cn (classname merger), formatting (currency, date, initials), color/label scoring |
| `stripe.ts` | Stripe client (lazy init), price-to-plan mapping, checkout/portal helpers |
| `feature-gate.ts` | Client-safe feature gating: 5 plans, 68 feature flags, upgrade messages |
| `feature-gate-server.ts` | Server-side permission checks, daily search limits, trial management |
| `supabase/client.ts` | Browser-side Supabase client |
| `supabase/server.ts` | Server-side Supabase client |
| `supabase/middleware.ts` | Auth middleware (session + approval gate) |

### Gmail & Calendar
| File | Purpose |
|------|---------|
| `gmail.ts` | Gmail OAuth token management & refresh (scopes: readonly, send, modify, labels, calendar) |
| `gmail-sync.ts` | Initial & incremental Gmail sync engine with historyId tracking |
| `gmail-send.ts` | Send & reply via Gmail API with CC/BCC, attachments, templates |
| `google-calendar.ts` | Google Calendar 2-way sync: event CRUD, color mapping, attendees (16KB) |

### Email Processing
| File | Purpose |
|------|---------|
| `email-parser.ts` | AI email parsing via Claude: extracts lead data (name, phone, budget, area) |
| `email-categorizer.ts` | Rule-based categorization: lead, personal, newsletter, transactional |
| `email-scoring.ts` | Engagement scoring (0-100): frequency, recency, response speed, thread depth |
| `follow-up-checker.ts` | Auto-trigger follow-up reminders for lead threads >24h without reply |

### Real Estate Data Sources
| File | Purpose |
|------|---------|
| `nyc-opendata.ts` | 17 NYC Open Data (Socrata) API helpers: ACRIS, PLUTO, DOB, HPD, ECB, Rent Stab |
| `entity-resolver.ts` | Fuzzy matching, address normalization, LLC piercing, owner dedup across sources |
| `data-fusion-engine.ts` | Unified BuildingIntelligence: 14+ sources in parallel, conflict resolution, scoring |
| `comps-engine.ts` | Comparable sales: DOF Rolling Sales + PLUTO bounding box, similarity scoring |
| `ny-corporations.ts` | NY DOS corporate filing lookup: entity names, filings, registered agents |

### Market Intelligence & Valuation
| File | Purpose |
|------|---------|
| `brave-search.ts` | Brave Web Search API wrapper with budget tracking |
| `brave-listings.ts` | Live listings search via Brave, listing parser, dedup |
| `brave-comps.ts` | Web comps: merge Brave results with DOF Rolling Sales |
| `brave-entity.ts` | Owner/entity web research: news, courts, corporate records |
| `renovation-engine.ts` | Renovation cost estimator: condition assessment, 3-tier costs, ARV, ROI |
| `airbnb-market.ts` | STR market data: InsideAirbnb neighborhood metrics, STR vs LTR projections |
| `deal-calculator.ts` | Full underwriting model: unit mix, expenses, DCF, IRR, 10-year proforma |
| `zillow-data.ts` | Zillow rent/sale estimates: NYC ZIP ranges, home values, rent trends |
| `redfin-market.ts` | Redfin metrics: median price, days-on-market, inventory, market temperature |
| `fhfa.ts` | FHFA HPI + ACRIS appreciation: metro benchmarks, zip-level 1yr/5yr trends |
| `fannie-mae.ts` | Fannie Mae loan lookup: ROPC OAuth2, determine agency-backed mortgage |
| `promote-engine.ts` | GP/LP promote waterfall: distribution tiers, IRR hurdles, catch-up logic |
| `expense-analyzer.ts` | Building expense analysis: T-12 parsing, market benchmarks, anomaly detection |

### Census & Demographics
| File | Purpose |
|------|---------|
| `census.ts` | Census Bureau ACS API: tract-level demographics (housing, income, rent burden) |
| `geocodio.ts` | Geocodio API: rooftop geocoding + Census data (2,500 free/day, LRU cache) |
| `neighborhoods.ts` | NYC neighborhoods: 200+ per borough with ZIP mappings, coordinates |
| `neighborhoods-nys.ts` | NYS counties + municipalities |
| `neighborhoods-nj.ts` | NJ counties + municipalities |
| `geo-utils.ts` | Radius-to-bounding-box, haversine distance, lat/lng helpers |
| `nyc-zip-centroids.ts` | NYC ZIP code centroids & radius search |

### Economic Data
| File | Purpose |
|------|---------|
| `fred.ts` | FRED API: mortgage rates, unemployment, CPI, housing starts (24hr cache) |
| `fred-actions.ts` | Server actions for FRED lookups |
| `hud.ts` | HUD Fair Market Rents: ZIP-level FMR by unit count (30-day cache) |
| `hud-actions.ts` | Server actions for HUD FMR lookups |
| `market-trends-actions.ts` | Server actions for market trends aggregation |

### AI & Analysis
| File | Purpose |
|------|---------|
| `ai-assumptions.ts` | AI deal assumptions: calibrates with census, builds T-12, STR context |
| `apollo.ts` | Apollo.io: enrich person/org, search people, bulk enrich, merge logic |
| `contact-types.ts` | Contact type interfaces: landlord, buyer, seller, renter metadata |
| `bms-types.ts` | BMS types, labels, Excel column aliases |
| `invoice-pdf.ts` | Commission invoice PDF (jsPDF) |

### Document Generation
| File | Purpose |
|------|---------|
| `pdf-report.ts` | 4-page building intelligence PDF: comps, investment analysis, renovation, STR |
| `deal-pdf.ts` | Deal analysis PDF: underwriting, market context, pro forma |
| `loi-template.ts` | Letter of Intent structured content & metadata |
| `loi-pdf.ts` | LOI PDF generation with signature fields |
| `loi-docx.ts` | LOI Word (.docx) generation with bookmarks |

### Communication
| File | Purpose |
|------|---------|
| `twilio.ts` | Twilio SMS + voice API client (lazy init) |
| `twilio-actions.ts` | Server actions for SMS sending & call management |

## Route Files

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/gmail` | GET | Gmail OAuth initiation |
| `/api/auth/gmail/callback` | GET | Gmail OAuth callback → token storage |
| `/api/book` | POST | Public showing slot reservation |
| `/api/stripe/checkout` | POST | Create checkout session |
| `/api/stripe/portal` | POST | Customer billing portal |
| `/api/webhooks/stripe` | POST | Stripe event webhooks |
| `/api/twilio/sms` | POST | Incoming SMS webhook |
| `/api/twilio/voice` | POST | Incoming call webhook |
| `/api/twilio/status` | POST | Call/SMS status callback |
| `/api/report/[bbl]` | GET | Generate building PDF report |

### Dashboard Pages (Protected)
| Route | Status | Description |
|-------|--------|-------------|
| `/dashboard` | Basic | Welcome + stats (needs real data) |
| `/contacts` | Working | Contact list, filters, create/edit |
| `/contacts/[id]` | Working | 5-tab dossier + AI enrichment |
| `/deals` | Working | Deal management |
| `/deals/new` | Working | Create new deal / deal modeler |
| `/deals/promote` | Working | Promote waterfall analysis |
| `/pipeline` | Working | Kanban board, 6 default stages |
| `/messages` | Working | Gmail inbox: threads, compose, reply, bulk actions |
| `/messages/templates` | Working | Email template CRUD |
| `/calendar` | Working | Month/week/day/agenda + Google sync |
| `/market-intel` | Working | 4 search modes: property, ownership, name, map |
| `/properties` | Minimal | Empty state (needs implementation) |
| `/prospecting` | Working | Prospect lists from Market Intel |
| `/brokerage` | Working | Redirects to /brokerage/dashboard |
| `/brokerage/dashboard` | Working | Stats cards, deal/invoice status charts, period selector |
| `/brokerage/deal-submissions` | Working | Agent deal submission queue + approval |
| `/brokerage/invoices` | Working | Invoice generation, Excel upload, batch PDF, inline payments |
| `/brokerage/commission-plans` | Working | Commission plan templates (flat/volume/value tiers) |
| `/brokerage/reports/*` | Working | P&L, agent production, 1099 prep, deal pipeline (4 sub-tabs) |
| `/brokerage/compliance` | Working | Document tracking, expiry alerts, agent compliance grid |
| `/brokerage/payments` | Working | Payment recording, history, filters, CSV export |
| `/brokerage/agents` | Working | Agent roster, detail pages, Excel import, onboarding |
| `/brokerage/agents/[id]` | Working | Agent detail: stats, plan tiers, deals, invoices |
| `/brokerage/settings` | Working | Roles & permissions, brokerage settings, audit log (3 tabs) |
| `/brokerage/my-deals` | Working | Agent self-service: own submissions + invoices |
| `/join/agent/[token]` | Working | Public agent invite landing + accept flow |
| `/portfolios` | Basic | Schema + basic UI |
| `/book/[slug]` | Working | Public showing booking (no auth) |

### Settings (20 sub-pages)
`/settings/profile`, `/settings/team`, `/settings/gmail`, `/settings/sync`, `/settings/api-keys`, `/settings/pipeline`, `/settings/branding`, `/settings/signature`, `/settings/notifications`, `/settings/hours`, `/settings/lead-rules`, `/settings/ai`, `/settings/export`, `/settings/templates`, `/settings/phone`, `/settings/billing`, `/settings/admin`, `/settings/admin/users`, `/settings/admin/waitlist`

## Server Action Files (32 files)

### Market Intelligence
| File | Key Functions |
|------|--------------|
| `market-intel/actions.ts` | `searchNYCBuildings`, `searchOwnership`, `searchNamePortfolio` |
| `market-intel/building-profile-actions.ts` | `enrichBuildingProfile`, `enrichOwner`, `generateBuildingReport` |
| `market-intel/map-actions.ts` | `searchMap`, `getMapMarkers` |
| `market-intel/neighborhood-actions.ts` | `getCensusContextForAI`, `getNeighborhoodTrends` |
| `market-intel/nys-actions.ts` | `searchNYSBuildings`, `searchNYSOwnership` |
| `market-intel/nj-actions.ts` | `searchNJBuildings`, `searchNJOwnership` |
| `market-intel/comps-actions.ts` | `findComps`, `getComparableSales` |
| `market-intel/renovation-actions.ts` | `estimateRenovation`, `calculateARV` |
| `market-intel/str-actions.ts` | `fetchSTRProjection` |
| `market-intel/recent-activity-actions.ts` | `getRecentActivity` |
| `market-intel/new-development-actions.ts` | `searchNewDevelopments` |

### Contacts & Enrichment
| File | Key Functions |
|------|--------------|
| `contacts/actions.ts` | `createContact`, `updateContact`, `deleteContact`, `listContacts`, `bulkEnrich` |
| `contacts/[id]/actions.ts` | `getContactDossier`, `addActivity`, `linkDeal` |
| `contacts/[id]/enrich-actions.ts` | `enrichContact`, `pdlLookup`, `apolloEnrich` |

### Deals & Underwriting
| File | Key Functions |
|------|--------------|
| `deals/actions.ts` | `saveDealAnalysis`, `getDealAnalysis`, `underwriteDeal` |
| `deals/closing-cost-actions.ts` | `fetchClosingCosts`, `fetchTaxReassessment` |
| `deals/benchmark-actions.ts` | `fetchExpenseBenchmark`, `fetchRentProjection`, `fetchLL97Projection` |
| `deals/caprate-actions.ts` | `fetchMarketCapRate` |
| `deals/promote/actions.ts` | `calculatePromote`, `generateWaterfallReport` |

### Brokerage Management System
| File | Key Functions |
|------|--------------|
| `brokerage/deal-submissions/actions.ts` | `createSubmission`, `updateSubmissionStatus`, `approveSubmission`, `rejectSubmission`, `generatePublicLink` |
| `brokerage/invoices/actions.ts` | `createInvoice`, `createInvoiceFromSubmission`, `markPaid`, `voidInvoice`, `validateExcelRows`, `batchCreateInvoices` |
| `brokerage/commission-plans/actions.ts` | `createPlan`, `updatePlan`, `archivePlan`, `assignPlanToAgent`, `getAgentEffectiveSplit` |
| `brokerage/agents/actions.ts` | `createAgent`, `updateAgent`, `updateAgentRole`, `deactivateAgent`, `deleteAgent`, `bulkCreateAgents`, `getAgentStats`, `linkAgentToUser` |
| `brokerage/agents/onboarding-actions.ts` | `inviteAgent`, `revokeInvite`, `acceptInvite` |
| `brokerage/settings/actions.ts` | `getBrokerageSettings`, `updateBrokerageSettings`, `getAuditLogs` |
| `brokerage/my-deals/actions.ts` | `getMyAgent`, `getMySubmissions`, `getMyInvoices`, `getMyStats` |
| `brokerage/reports/actions.ts` | `getDashboardSummary`, `getPnlReport`, `getAgentProductionReport`, `get1099PrepData`, `getDealPipelineReport`, `exportReportCSV` |
| `brokerage/compliance/actions.ts` | `getComplianceOverview`, `getAgentComplianceDocs`, `createComplianceDoc`, `updateComplianceDoc`, `deleteComplianceDoc`, `getExpiringItems`, `refreshComplianceStatuses` |
| `brokerage/payments/actions.ts` | `recordPayment`, `getInvoicePayments`, `getPaymentHistory`, `deletePayment`, `getPaymentSummary`, `exportPaymentHistory` |

### Pipeline, Messages, Calendar, Prospecting, Settings
| File | Key Functions |
|------|--------------|
| `pipeline/actions.ts` | `createDeal`, `updateStage`, `reorderStages` |
| `messages/actions.ts` | `composeEmail`, `replyToThread`, `sendDraft` |
| `messages/bulk-actions.ts` | `markRead`, `markUnread`, `star`, `pin`, `archive`, `delete` |
| `messages/label-actions.ts` | `createLabel`, `applyLabel`, `removeLabel` |
| `messages/follow-up-actions.ts` | `snoozeThread`, `createReminder` |
| `messages/crm-actions.ts` | `linkToCRM`, `createContactFromEmail` |
| `messages/template-actions.ts` | `createTemplate`, `updateTemplate`, `deleteTemplate` |
| `calendar/actions.ts` | `createEvent`, `updateEvent`, `syncGoogleCalendar`, `createShowingSlots` |
| `prospecting/actions.ts` | `createProspectList`, `addProspect`, `convertToContact`, `exportCSV` |
| `settings/actions.ts` | `updateProfile`, `updateTeam`, `testApiKey`, `exportData` |
| `settings/billing-actions.ts` | `createCheckoutSession`, `manageBilling` |
| `settings/admin/admin-actions.ts` | `approveUser`, `updateUserRole` |

## External API Integrations (18 APIs)

### Core Services
| API | Env Vars | Type |
|-----|----------|------|
| Supabase | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Essential |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Essential |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 6× `STRIPE_*_PRICE_ID` | Essential |
| Anthropic Claude | `ANTHROPIC_API_KEY` | Core |

### Real Estate & Market Data
| API | Env Vars | Type |
|-----|----------|------|
| NYC Open Data (Socrata) | `NYC_OPEN_DATA_APP_TOKEN` (optional) | Essential — 17 datasets |
| Apollo.io | `APOLLO_API_KEY` | Core (credits-based) |
| Brave Web Search | `BRAVE_SEARCH_API_KEY` | Core |
| Census Bureau | `CENSUS_API_KEY` | Core |
| Geocodio | `GEOCODIO_API_KEY` | Core (2.5k/day free) |
| FRED | `FRED_API_KEY` | Core |
| HUD | `HUD_API_TOKEN` | Core |
| Fannie Mae | `FANNIE_CLIENT_ID`, `FANNIE_CLIENT_SECRET`, `FANNIE_API_KEY` | Optional |

### Embedded Data (no API key)
| Source | Library File | Data |
|--------|-------------|------|
| FHFA HPI | `fhfa.ts` | Metro house price index benchmarks |
| Redfin | `redfin-market.ts` | Quarterly market metrics |
| InsideAirbnb | `airbnb-market.ts` | 40 neighborhood STR averages |
| Zillow | `zillow-data.ts` | NYC ZIP rent/sale estimates |

### Communication
| API | Env Vars | Type |
|-----|----------|------|
| People Data Labs | `PDL_API_KEY` | Optional (skip tracing) |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Optional (SMS/voice) |
| Tracerfy | `TRACERFY_API_KEY` | Optional (fallback skip trace) |

## Data Sources — NYC Open Data (17 datasets)

| # | Source | Dataset ID | Key Fields |
|---|--------|-----------|------------|
| 1 | PLUTO | `64uk-42ks` | address, units, sqft, year built, FAR, zoning, owner, assessed value |
| 2 | ACRIS Master | `bnx9-e6tj` | Document type, amount, recorded date |
| 3 | ACRIS Legals | `8h5j-fqxa` | BBL linkage to documents |
| 4 | ACRIS Parties | `636b-3b5g` | Buyer/seller names, deed holders |
| 5 | HPD Registrations | `tesw-yqqr` | Owner name, managing agent, phone |
| 6 | HPD Contacts | `feu5-w2e2` | Contact details for registered buildings |
| 7 | HPD Violations | `wvxf-dwi5` | Open/closed violations by class (A/B/C) |
| 8 | HPD Complaints | `uwyv-629c` | Tenant 311 complaints |
| 9 | HPD Litigation | `59kj-x8nc` | Housing court cases |
| 10 | DOB Permits | `ic3t-wcy2` | Active construction permits |
| 11 | DOB Violations | `3h2n-5cm9` | Building code violations |
| 12 | DOB ECB | `6bgk-3dad` | Environmental control board violations |
| 13 | DOF Rolling Sales | `usep-8jbt` | Recent closed sales (comps) |
| 14 | LL84 Energy | `5zyy-y8am` | Energy Star grade, EUI, GHG |
| 15 | RPIE | `wvts-6tdf` | Income & expense filing non-compliance |
| 16 | Rent Stabilization | `35ss-ekc5` | Rent stabilized unit counts |
| 17 | Speculation Watch | `adax-9x2w` | Speculative purchasing patterns |

### NYS (data.ny.gov)
| Source | Dataset ID | Key Fields |
|--------|-----------|------------|
| Assessment Rolls | `7vem-aaz7` | All assessed properties statewide |
| Entity Names | `ekwr-p59j` | Corporation names, filing dates |
| Entity Filings | `63wc-4exh` | Corporate filings, registered agents |

### NJ (ArcGIS REST)
| Source | Service | Key Fields |
|--------|---------|------------|
| Parcels Composite | `Parcels_Composite_NJ_WM/FeatureServer/0` | MUN_NAME, PROP_CLASS, PROP_LOC, DWELL, YR_CONSTR, LAND_VAL |

## Feature Gate System (71 features, 5 plans)

**Plans:** free ($0) → explorer ($59/mo) → pro ($219/mo) → team ($399/mo) → enterprise (custom)

### Free (3 features)
`nav_market_intel`, `market_nyc`, `bp_census_basic`

### Explorer adds (18 features)
`market_nys`, `market_nj`, `map_search`, `search_unlimited`, `bp_owner_name`, `bp_distress_score`, `bp_investment_score`, `bp_rpie`, `bp_live_listings`, `bp_web_intel`, `bp_census_full`, `bp_market_trends`, `bp_fannie_mae_loan`, `bp_renovation_basic`, `bp_str_basic`, `report_basic`, `bp_corp_basic`, `deal_structure_all_cash`

### Pro adds (33 features)
`nav_deal_modeler`, `nav_prospecting`, `nav_portfolios`, `nav_campaigns`, `nav_sequences`, `nav_financing`, `nav_comp_analysis`, `bp_owner_contact`, `bp_apollo_enrichment`, `bp_census_trends`, `bp_corp_full`, `bp_renovation_full`, `bp_str_full`, `report_full`, `phone_sms`, `deal_modeler`, `prospecting`, `portfolios`, `comp_analysis`, `campaigns`, `sequences`, `financing`, `api_access`, `promote_model`, `nav_promote_model`, `deal_structure_conventional`, `deal_structure_bridge_refi`, `deal_structure_assumable`, `deal_structure_syndication`, `deal_structure_compare`, `bms_submissions`, `bms_invoices`, `bms_agent_portal`, `bms_agent_onboarding`

### Team adds (14 features)
`nav_investors`, `investors`, `phone_multi_numbers`, `promote_templates`, `promote_sensitivity`, `promote_export`, `bms_bulk_upload`, `bms_agents`, `bms_commission_plans`, `bms_compliance`, `bms_payments`, `bms_audit_log`, `bms_file_upload`

### Enterprise = Team (all features)

## Prisma Schema (42 models, 20 enums)

### Core Multi-Tenant
- **Organization**: name, slug, tier (free/explorer/pro/team), aiLookupsUsed/Limit
- **User**: email, role (owner/admin/manager/agent/viewer), isApproved, plan, trialEndsAt, usageCounters, usageResetDate

### CRM
- **Contact**: firstName, lastName, email, phone, status, type, source, qualificationScore, tags[]
- **EnrichmentProfile**: contactId, version, employer, jobTitle, linkedinUrl, rawData JSON, dataSources[]
- **QualificationScore**: contactId, totalScore, financialCapacity, intentSignals, engagementLevel
- **Activity**: contactId, dealId, type, direction, subject, body
- **Task**: contactId, assignedTo, title, type, priority, dueAt, status, aiReasoning

### Deals & Pipeline
- **Pipeline**: orgId, name, pipelineType, stages JSON, isDefault
- **Deal**: contactId, pipelineId, stageId, dealValue, status, winProbability, riskFlags JSON
- **DealAnalysis**: orgId, bbl, address, dealType, dealSource, inputs JSON, outputs JSON
- **PromoteModel**: dealAnalysisId, gpEquityPct, lpEquityPct, waterfallTiers JSON

### Properties
- **Property**: address, bbl, propertyType, transactionType, status, price, sqft
- **Showing**: contactId, propertyId, scheduledAt, status, interestLevel, feedback
- **ShowingSlot**: propertyAddress, startAt, endAt, isBooked, bookedByName/Email/Phone
- **ContactPropertyInterest**: contactId, propertyId, interestLevel

### Email
- **GmailAccount**: userId, email, accessToken, refreshToken, historyId
- **EmailMessage**: gmailMessageId, threadId, direction, subject, bodyHtml, aiParsed, leadSource, sentimentScore
- **EmailLabel**, **EmailThreadLabel**, **EmailTemplate**, **FollowUpReminder**, **EmailSignature**

### Calendar
- **CalendarEvent**: googleEventId, title, startAt, endAt, eventType, contactId, attendees JSON

### Prospecting & Portfolios
- **ProspectingList**, **ProspectingItem**: address, block, lot, totalUnits, ownerName, status
- **Portfolio**, **PortfolioBuilding**: bbl, address, units, entityNames[]

### Communication
- **PhoneNumber**: orgId, number, provider (twilio), assignedTo
- **PhoneCall**: direction, duration, recordingUrl, status
- **SmsMessage**: direction, body, status, sentAt

### Settings
- **NotificationPreferences**, **WorkingHours**, **SyncSettings**, **LeadAssignmentRule**, **AiSettings**, **BrandSettings**

### System
- **Automation**, **AutomationRun**: triggerType, conditions/actions JSON
- **AuditLog**: userId, actorName, actorRole, action, entityType, entityId, details JSON, previousValue JSON, newValue JSON

## Brokerage Management System (BMS)

- BMS adds deal submission intake, invoice generation, commission plans, agent management, compliance tracking, payment recording, reporting, role-based access, agent onboarding, file uploads, and audit logging for running a brokerage
- 8 models: BrokerAgent, DealSubmission, Invoice, CommissionPlan, CommissionTier, ComplianceDocument, Payment, FileAttachment
- 5 enums: BmsDealType (sale/lease/rental), InvoiceStatus (draft/sent/paid/void), CommissionPlanType (flat/volume_based/value_based), ComplianceDocType (license/eo_insurance/continuing_education/background_check/other), PaymentMethod (check/ach/wire/cash/stripe/other)
- Organization has `submissionToken` for public submission links
- Server actions follow same `getCurrentOrg()` pattern via authProviderId
- Agent self-service uses `getCurrentUserAndAgent()` — verifies User→BrokerAgent link
- Public submissions at `/submit-deal/[token]` — no auth, looks up org by token
- Invoice PDF uses jsPDF (same as deal-pdf.ts and pdf-report.ts)
- Excel upload uses SheetJS with flexible column alias mapping
- Commission plans: flat/volume_based/value_based with tiered agent splits
- Agent roster: CRUD, detail pages, Excel/CSV import, stats aggregates
- Agent self-service portal: `/brokerage/my-deals` — agents see own submissions + invoices, submit deals
- Sidebar role-gating: owner/admin see "Brokerage", agents see "My Deals"
- Brokerage sub-nav: Dashboard, Deal Submissions, Invoices, Plans, Reports, Compliance, Payments, Agents, Settings
- Reporting: dashboard summary, P&L, agent production, 1099 tax prep, deal pipeline — all with CSV export
- Compliance: document tracking per agent (license, E&O insurance, continuing education, background check), expiry alerts (30-day window), status auto-computation
- Payments: manual recording against invoices, partial payment tracking with progress bars, auto-status cascading (invoice → deal submission), payment history with filters, CSV export, Stripe-ready schema

### BMS Roles & Permissions
- 4 roles: brokerage_admin (all), broker (all except settings), manager (view + manage submissions/compliance), agent (view own only)
- 24 permission keys across categories: submissions, invoices, agents, commission plans, compliance, payments, reports, settings
- `bms-auth.ts`: `getCurrentBmsUser()` returns user with brokerageRole, orgId, agentId; `requireBmsPermission()` enforces permission
- `bms-permissions.ts`: `BMS_ROLES`, `BMS_PERMISSIONS` map, `hasPermission(role, permission)`, `getRoleLabel()`
- BrokerAgent has `brokerageRole` field (string, defaults to "agent")

### BMS Agent Onboarding
- Admin invites agent via `inviteAgent()` → generates UUID `inviteToken` on BrokerAgent
- Public invite page at `/join/agent/[token]` — shows brokerage info, signup/login prompt
- Accept flow: authenticated user → `resolve-user.ts` links User to BrokerAgent, clears token
- BrokerAgent invite fields: `inviteToken` (@unique), `invitedAt`, `inviteEmail`

### BMS Audit Logging
- Fire-and-forget pattern: `.catch()` on Prisma promise, never `await`, never throw
- `bms-audit.ts`: `logAction()` core + 6 convenience functions (logSubmissionAction, logInvoiceAction, logPaymentAction, logAgentAction, logComplianceAction, logSettingsAction)
- Wired into all 7 BMS action files with 24 distinct action types
- Audit Log Viewer: filter bar, log table, relative timestamps, expandable JSON details, pagination (50/page)
- AuditLog model fields: orgId, userId?, actorName?, actorRole?, action, entityType, entityId?, details JSON, previousValue JSON, newValue JSON

### BMS File Upload
- FileAttachment model: generic entity-polymorphic file storage (entityType + entityId)
- `bms-files.ts`: upload, list, delete — indexed by [orgId, entityType, entityId]

### BMS Feature Gates
- bms_submissions (pro+), bms_invoices (pro+), bms_agent_portal (pro+), bms_agent_onboarding (pro+)
- bms_bulk_upload (team+), bms_agents (team+), bms_commission_plans (team+), bms_compliance (team+), bms_payments (team+), bms_audit_log (team+), bms_file_upload (team+)

### BMS File Structure (39 files)
```
src/app/(dashboard)/brokerage/
  layout.tsx                    — sub-nav tabs (Dashboard, Submissions, Invoices, Plans, Reports, Compliance, Payments, Agents, Settings)
  page.tsx                      — redirects to /brokerage/dashboard
  dashboard/
    page.tsx                    — stats cards, deal status chart, deal types, invoice status, period selector
  deal-submissions/
    page.tsx                    — approval queue UI (filter tabs, search, expandable cards)
    actions.ts                  — server actions (CRUD, approve/reject, public link)
    submission-form.tsx         — reusable form (used in deal-submissions + my-deals)
  invoices/
    page.tsx                    — invoice list + management (table, bulk actions, inline payment recording)
    actions.ts                  — server actions (create, batch, mark paid, excel validation)
    excel-upload.tsx            — upload + parse + preview component
    invoice-form.tsx            — manual invoice creation form
    new/
      page.tsx                  — standalone manual invoice page
  commission-plans/
    page.tsx                    — plan list + CRUD (card grid, archive)
    actions.ts                  — server actions (CRUD, assign to agents, effective split calc)
    plan-builder.tsx            — dynamic tier builder + preview (flat/volume/value)
  reports/
    layout.tsx                  — reports sub-nav (P&L, Production, 1099 Prep, Pipeline)
    page.tsx                    — redirects to /brokerage/reports/pnl
    actions.ts                  — getDashboardSummary, getPnlReport, getAgentProductionReport, get1099PrepData, getDealPipelineReport, exportReportCSV
    pnl/
      page.tsx                  — P&L report: revenue, payouts, net income, period chart, CSV export
    production/
      page.tsx                  — agent leaderboard: rankings, top agent highlight, org totals, sort toggle
    tax-prep/
      page.tsx                  — 1099-NEC prep: tax year select, $600 threshold, agent earnings, CSV export
    pipeline/
      page.tsx                  — CSS funnel, conversion rates, speed metrics, source/type breakdowns, rejections
  compliance/
    page.tsx                    — status cards, expiring banner, agent compliance table, doc management side panel
    actions.ts                  — getComplianceOverview, CRUD, getExpiringItems, refreshComplianceStatuses
  payments/
    page.tsx                    — summary cards, filter bar, record payment panel, payment history table, CSV export
    actions.ts                  — recordPayment, getInvoicePayments, getPaymentHistory, deletePayment, getPaymentSummary, exportPaymentHistory
  agents/
    page.tsx                    — agent roster table + inline form + import panel
    actions.ts                  — server actions (CRUD, bulk create, stats, user linking, role update)
    agent-import.tsx            — Excel/CSV upload + preview + bulk create
    onboarding-actions.ts       — inviteAgent, revokeInvite, acceptInvite
    [id]/
      page.tsx                  — agent detail: stats, plan tiers, deals, invoices
  settings/
    page.tsx                    — 3-tab settings: Roles & Permissions, Settings, Audit Log
    actions.ts                  — getBrokerageSettings, updateBrokerageSettings, getAuditLogs
    audit-log.tsx               — audit log viewer (filters, table, pagination, expandable details)
  my-deals/
    page.tsx                    — agent self-service: own submissions + invoices + submit
    actions.ts                  — server actions (my agent, my submissions, my invoices, my stats)

src/app/submit-deal/[token]/
  page.tsx                      — public submission (server component, org lookup by token)
  client.tsx                    — public submission (client component, no auth)

src/app/join/agent/[token]/
  page.tsx                      — public invite landing (server component, agent lookup by token)
  client.tsx                    — invite landing (client component, brokerage info display)
  accept/
    page.tsx                    — accept invite (authenticated, server component)
    accept-client.tsx           — accept invite (client component)
    resolve-user.ts             — link authenticated user to BrokerAgent server action

src/lib/
  bms-types.ts                  — shared types, enums, labels, colors, Excel column aliases, audit log types
  bms-auth.ts                   — getCurrentBmsUser, requireBmsPermission (role-based access)
  bms-permissions.ts            — BMS_ROLES, BMS_PERMISSIONS map, hasPermission, getRoleLabel
  bms-files.ts                  — FileAttachment CRUD (upload, list, delete)
  bms-audit.ts                  — fire-and-forget audit logging (logAction + 6 convenience functions)
  invoice-pdf.ts                — jsPDF invoice generator (single + batch)
```

### BMS Database Models
- **BrokerAgent**: orgId, userId? (@unique), firstName, lastName, email, phone, licenseN, licenseExpiry?, eoInsuranceExpiry?, defaultSplitPct, commissionPlanId?, brokerageRole (string), inviteToken? (@unique), invitedAt?, inviteEmail?, status
- **DealSubmission**: orgId, agentId?, all form fields as snapshots, status (string), invoiceId? (1:1)
- **Invoice**: orgId, submissionId? (1:1), agentId?, invoiceNumber (INV-YYYY-NNNN), all info snapshotted, InvoiceStatus enum, payments[]
- **CommissionPlan**: orgId, name, type (CommissionPlanType), isDefault, isActive, agents[] relation
- **CommissionTier**: planId, tierOrder, minValue, maxValue?, agentSplitPct, houseSplitPct
- **ComplianceDocument**: orgId, agentId, docType (ComplianceDocType), title, description?, issueDate?, expiryDate?, fileUrl?, fileName?, fileSize?, status, notes
- **Payment**: orgId, invoiceId, agentId?, amount (Decimal 12,2), paymentMethod (PaymentMethod), paymentDate, referenceNumber?, stripePaymentId? (@unique), stripeTransferId? (@unique), notes
- **FileAttachment**: orgId, entityType, entityId, fileName, fileType, fileSize, storagePath, publicUrl?, uploadedBy?

## Socrata API Patterns

**CRITICAL: Never quote numeric values in $where clauses.** Socrata does string comparison on quoted values, which breaks negative longitude comparisons.

```typescript
// CORRECT — unquoted numerics
`latitude > ${swLat} AND longitude > ${swLng} AND unitsres > 0`

// WRONG — quoted numerics (breaks negative numbers)
`latitude > '${swLat}' AND longitude > '${swLng}'`
```

Standard pattern:
```typescript
const url = new URL("https://data.cityofnewyork.us/resource/DATASET_ID.json");
url.searchParams.set("$where", conditions.join(" AND "));
url.searchParams.set("$limit", "400");
url.searchParams.set("$select", "field1,field2,field3");
```

## Server Actions Pattern

```typescript
"use server";

export async function fetchSomething(params: Params): Promise<Result> {
  try {
    const url = new URL("https://api.example.com/resource.json");
    url.searchParams.set("$where", buildQuery(params));
    const response = await fetch(url.toString());
    if (!response.ok) return { properties: [], total: 0 };
    const data = await response.json();
    return { properties: data.map(parseRecord), total: data.length };
  } catch (error) {
    console.error("Fetch error:", error);
    return { properties: [], total: 0 };
  }
}
```

**CRITICAL for `"use server"` files:**
- Never use `export type { ... }` — crashes with `ReferenceError: X is not defined`
- Use `import type { X }` for type imports (correctly erased)
- Export types from separate non-server files

## Data Fusion Engine

`fetchBuildingIntelligence(bbl)` in `data-fusion-engine.ts`:
1. Fires 14+ data source queries in parallel via `Promise.allSettled()`
2. Cross-references entities via `entity-resolver.ts` (fuzzy matching, LLC piercing)
3. Resolves conflicts using source priority hierarchy
4. Calculates distress score (0-100) and investment score (0-100)
5. Includes STR projection (Phase 13b) and renovation estimates
6. Returns unified `BuildingIntelligence` object
7. Caches results for 15 minutes (LRU, 100 entries)

## Leaflet Map

Dynamically imported (no SSR). Key patterns:
- `invalidateSize()` via IntersectionObserver when tab becomes visible
- `loadPropertiesRef.current` pattern to avoid stale closures
- Query PLUTO with viewport bounds on `moveend` event
- Use `circleMarker` not `Marker` for performance

## Deployment

```bash
npm run dev                                    # local with --turbopack
git push origin main                           # trigger build
gcloud builds submit --config cloudbuild.yaml --region=us-east1
```

Docker: Multi-stage (Node 20-Alpine), standalone output, port 8080.
Cloud Run: 1Gi memory, 1 CPU, 80 concurrency, 0-10 instances, 11 secrets.

## Common Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| Map returns 0 results | Quoted numerics in SODA $where | Remove quotes from all numeric comparisons |
| Map blank on tab switch | Leaflet container size unknown | `invalidateSize()` via IntersectionObserver |
| Map stale data | Event handler captures old closure | Use `ref.current` pattern for callbacks |
| 500 on page load | `export type` in "use server" file | Move type exports to non-server file |
| Docker build fails "apiKey not provided" | Module-level Stripe/API init | Use lazy initialization pattern |
| NYS returns 0 results | Wrong column names / roll year | Check dataset schema, use `getFullYear()-2` |
| NJ returns 0 results | Dead ArcGIS service URL | Verify service URL hasn't changed |
| Webhook signature fails | Using `request.json()` | Must use `request.text()` for raw body |
| `as const` on ternary in JSX | TS error in typed arrays | Extract to typed variable with explicit annotation |
| NormalizedAddress `.display` | Property doesn't exist | Use `.raw` instead |

## Coding Conventions

- All data fetching via server actions (`"use server"`)
- Graceful degradation — API failures return empty results, never crash
- Lazy initialization for all API clients (Stripe, Brave, Twilio, etc.)
- Parallel fetching with `Promise.allSettled()` for building profiles
- Feature gating checked both client-side (UI) and server-side (actions)
- Dynamic imports for lazy-loading optional modules (`import("./str-actions")`)
- `Array.isArray()` checks before spreading API responses (PDL returns non-arrays)
- `JSON.parse(JSON.stringify(obj))` for Server→Client serialization (Dates, Decimals)
- Console.log debugging must be removed before committing
- Build must pass (`npx next build`) with zero errors before deployment
- Default Market Intel tab is **map** (not property)
- Market Pulse widget uses Bloomberg terminal dark theme aesthetic
