# VettdRE Tenant Screening — Implementation Plan

## Pre-Build Audit (2026-04-02)

Deep-dive audit of the existing codebase against this plan. Issues found and corrections applied:

### Issues Found & Corrections

**1. `stripeDefaultPaymentMethod` does NOT exist on Organization model**
The plan assumed we could reuse it. We need to ADD this field to the Organization model for enhanced tier card-on-file charges.

**2. Stripe SetupIntent is a NEW pattern — no existing implementation**
The entire card-saving flow (SetupIntent → save PaymentMethod → charge later) doesn't exist anywhere in the codebase. All current Stripe usage is subscription-based. We need to build this from scratch.

**3. Stripe one-time payments are a NEW pattern**
All existing Stripe checkout sessions use `mode: "subscription"`. The applicant $20 fee needs `mode: "payment"` (one-time). This is a new code path in the checkout flow.

**4. PDF generation — DON'T use `@react-pdf/renderer`, use existing `pdf-lib` + `jspdf`**
Both `pdf-lib` (^1.17.1) and `jspdf` (^4.2.0) are already installed. `pdfjs-dist` is also available for reading. No need to add a new PDF package. Use `pdf-lib` for server-side generation (pure JS, no headless browser needed). Drop `@react-pdf/renderer` and Puppeteer from the plan.

**5. `plaid` package is NOT installed — must add to package.json**
Confirmed: no Plaid SDK in the project. Must `npm install plaid`.

**6. Resend uses raw HTML, not templates**
`sendTransactionalEmail({ to, subject, html })` takes raw HTML strings. No template engine. Screening email templates will be inline HTML with inline styles, matching the onboarding notification pattern.

**7. Twilio phone resolution — use `getOrgTwilioNumber(orgId, userId)` from onboarding-notifications**
The existing pattern resolves user-level phone numbers first, then falls back to org-level. Import from `lib/onboarding-notifications.ts`.

**8. Middleware already whitelists `/api/webhooks` broadly**
The path `pathname.startsWith("/api/webhooks")` already covers `/api/webhooks/plaid` and `/api/webhooks/crs`. But we should still add explicit entries for clarity. We DO need to add `/screen/` and `/api/screen/` as new public routes.

**9. `/chat/[configSlug]` is NOT whitelisted in middleware (existing bug)**
The public chat widget works but isn't in the public route list. Should fix while we're editing middleware — add `pathname.startsWith("/chat")`.

**10. Feature gating requires TWO layers, not one**
- **Plan-based** (feature-gate.ts): `hasPermission(plan, "screening_view")` — gates by subscription tier
- **Role-based** (bms-permissions.ts): `hasPermission(role, "view_all_screenings")` — gates by org role
- Both must be checked. Plan controls access to the feature; role controls what you can do within it.

**11. Nav items need both sidebar AND mobile-nav updates**
Must add to `ADMIN_NAV_SECTIONS` in sidebar.tsx AND `ADMIN_MORE_SECTIONS` in mobile-nav.tsx. Feature type must be added to the `Feature` union type in `feature-gate.ts`.

**12. Supabase Storage bucket pattern**
Existing pattern uses `bms-files` bucket with path structure `{orgId}/{entityType}/{entityId}/{timestamp}-{filename}`. Screening documents should follow same pattern, using the existing `FileAttachment` model and `bms-files.ts` upload/download utilities rather than building custom storage logic.

**13. Webhook metadata routing pattern confirmed**
Existing Stripe webhook uses `session.metadata?.leasingTier` to identify leasing payments. We'll add `session.metadata?.screeningApplicationId` to identify screening payments in the same handler. No separate Stripe webhook needed.

**14. Existing UserRole enum has only 3 values: `agent`, `admin`, `super_admin`**
Not 6 as implied by some patterns. BMS has its own separate role system via `BrokerageRole` enum. Screening RBAC should use the BMS permission matrix pattern.

### What's Clean (No Issues)

- All 12 planned model names are unique — zero conflicts with existing 72 models
- All 4 planned enum names are unique — zero conflicts with existing 50 enums
- All planned route paths (`/screening/`, `/screen/`, `/api/screening/`, `/api/screen/`) are clear
- Existing `encryptToken()`/`decryptToken()` in `encryption.ts` work perfectly for SSN and Plaid tokens
- Token-gated public page pattern (`/sign/[token]`) is proven and directly replicable
- Server action pattern with `getAuthContext()` is well-established

---

## Architecture Decisions

### 1. Prisma Schema (not raw SQL migrations)
The spec calls for raw Supabase migrations, but since the existing app uses Prisma with 72 models, we'll translate every table into Prisma models following existing conventions: PascalCase models, camelCase fields, `@map()` for snake_case DB columns, UUID PKs, `createdAt`/`updatedAt` timestamps.

### 2. Reuse Existing Infrastructure
We won't duplicate these — we'll import from existing `lib/`:

| Concern | Existing File | What We Reuse |
|---------|--------------|---------------|
| Auth | `lib/supabase/middleware.ts` | Session + public route whitelist |
| Stripe | `lib/stripe.ts` | `getStripe()` singleton, webhook pattern |
| Twilio | `lib/twilio.ts` + `lib/onboarding-notifications.ts` | `getTwilio()` singleton + `getOrgTwilioNumber()` |
| Resend | `lib/resend.ts` | `sendTransactionalEmail({ to, subject, html })` — raw HTML, no templates |
| Anthropic | `@anthropic-ai/sdk` | Claude document analysis |
| Encryption | `lib/encryption.ts` | AES-256-GCM for SSN, Plaid tokens |
| Prisma | `lib/prisma.ts` | Singleton client |

### 3. Route Structure
- **Dashboard pages:** `src/app/(dashboard)/screening/*` (protected, agent/broker auth)
- **Public wizard:** `src/app/screen/[token]/*` (token-gated, no auth — matches pattern from `/sign/[token]`)
- **API routes:** `src/app/api/screening/*` (agent-facing) + `src/app/api/screen/[token]/*` (applicant-facing) + `src/app/api/webhooks/` additions
- **Internal processing:** `src/app/api/screening/internal/*` (server-only pipeline)

### 4. Sandbox/Mock Strategy
- **Plaid:** Use sandbox environment with test credentials, real SDK calls
- **CRS Credit:** Mock response module (`lib/screening/crs-mock.ts`) returning realistic test data
- **Stripe:** Real sandbox (existing keys work), add new screening-specific checkout flow
- **All mocks:** Behind `SCREENING_USE_MOCKS=true` env flag so real APIs plug in with zero code changes

---

## Phase 1: Database Schema + Foundation

**Goal:** All Prisma models created, migrations run, lib files scaffolded, nav wired up.

### 1.1 Prisma Schema — New Models (~12 models, ~4 enums)

```
ScreeningApplication     — Core application record (links to existing Organization, User)
ScreeningApplicant       — Main applicant + co-applicants/guarantors
ScreeningSignature       — E-signature records per legal document
PlaidConnection          — Plaid access tokens (encrypted), institution info
FinancialTransaction     — Parsed bank transactions from Plaid
CreditReport             — Bureau reports (single or tri-bureau)
ScreeningDocument        — Uploaded files (pay stubs, W-2s, etc.)
DocumentAnalysis         — AI fraud analysis results per document
FinancialWellnessProfile — Computed financial health from transactions
ScreeningPayment         — Stripe payments (applicant $20 + org enhanced $49)
ScreeningEvent           — Audit trail for every action
```

**Enums:**
```
ScreeningTier            — base, enhanced
ScreeningStatus          — draft, invited, in_progress, pending_payment, processing, complete, approved, conditional, denied, withdrawn
ApplicantRole            — main, co_applicant, guarantor, occupant
FraudAssessment          — clean, low_risk, medium_risk, high_risk, fraudulent
```

**Key design choices:**
- `ScreeningApplication.orgId` → references existing `Organization` model
- `ScreeningApplication.agentUserId` → references existing `User` model (the agent who created it)
- No separate `agents` or `organizations` tables — we reuse existing ones
- `accessToken` on `ScreeningApplication` is a cryptographically random 32-char string for public wizard access
- SSN stored in `ScreeningApplicant.ssnEncrypted` using existing `encryptToken()` from `lib/encryption.ts`
- Plaid tokens stored encrypted in `PlaidConnection.accessTokenEncrypted` using same `encryptToken()`
- **ADD** `stripeDefaultPaymentMethod String?` field to existing `Organization` model (does not exist yet)
- Screening documents use existing `FileAttachment` model + `bms-files` Supabase Storage bucket with path `{orgId}/screening/{applicationId}/{timestamp}-{filename}`

### 1.2 Lib Files to Create

```
src/lib/screening/
├── constants.ts          — Tiers, fees, categories, document types, status labels
├── plaid.ts              — Plaid client, link token generation, token exchange, transaction sync
├── crs.ts                — CRS Credit API client (with mock mode)
├── crs-mock.ts           — Realistic mock credit/criminal/eviction responses
├── scoring.ts            — VettdRE Risk Score computation (from spec)
├── wellness.ts           — Financial wellness profile computation from transactions
├── document-analysis.ts  — 3-layer AI fraud detection orchestrator
├── pdf-report.ts         — HTML template + Puppeteer PDF generation
├── field-config.ts       — JSON schema → form field renderer for dynamic application forms
└── utils.ts              — Token generation, OTP helpers, shared screening utilities
```

### 1.3 Navigation + Feature Gating Integration

**Sidebar** (`components/layout/sidebar.tsx`):
- Add new `NavSection` to `ADMIN_NAV_SECTIONS`:
  ```typescript
  { label: "Screening", items: [
    { name: "Screenings", href: "/screening", icon: "🔐", feature: "screening_view" },
  ]}
  ```

**Mobile** (`components/layout/mobile-nav.tsx`):
- Add matching `MoreSection` to `ADMIN_MORE_SECTIONS`

**Feature Gate** (`lib/feature-gate.ts`):
- Add `"screening_view"` to `Feature` union type
- Add to `PRO_FEATURES` array (Pro plan and above)
- Add upgrade message: `"Upgrade to Pro to access Tenant Screening"`

**BMS Permissions** (`lib/bms-permissions.ts` or `lib/bms-types.ts`):
- Add screening permissions to matrix:
  - `create_screening`: all roles
  - `view_all_screenings`: brokerage_admin, broker, manager
  - `view_own_screenings`: all roles
  - `manage_screening_billing`: brokerage_admin, broker

### 1.4 Middleware Update

- Add `/screen/` and `/api/screen/` to public route whitelist in `lib/supabase/middleware.ts`
- Add `/chat/` to public routes (existing bug fix — chat widget works but isn't whitelisted)
- `/api/webhooks/plaid` and `/api/webhooks/crs` are already covered by existing `pathname.startsWith("/api/webhooks")` but add explicit entries for clarity

### 1.5 Environment Variables

Add to `.env.local` and document:
```
PLAID_CLIENT_ID=          # Plaid sandbox
PLAID_SECRET=             # Plaid sandbox secret
PLAID_ENV=sandbox         # sandbox | development | production
PLAID_WEBHOOK_URL=        # Webhook URL for Plaid events
CRS_API_BASE_URL=         # CRS Credit API base URL
CRS_API_KEY=              # CRS API key
CRS_ACCOUNT_ID=           # CRS account ID
SCREENING_USE_MOCKS=true  # Use mock responses for CRS
BASE_SCREENING_FEE_CENTS=2000
ENHANCED_SCREENING_FEE_CENTS=4900
```

**Deliverable:** `npx prisma migrate dev` succeeds, all lib files exist with type stubs, nav shows Screening link.

---

## Phase 2: Agent Dashboard (CRUD + Invites)

**Goal:** Agents can create screening applications, see their list, view details, send invites, and mark decisions.

### 2.1 Pages

```
src/app/(dashboard)/screening/
├── page.tsx                    — Application list (table with filters)
├── new/page.tsx                — Create new application form
├── [id]/page.tsx               — Application detail view
├── billing/page.tsx            — Org billing settings (card on file for enhanced)
└── actions.ts                  — Server actions (CRUD, invite, decision)
```

### 2.2 Components

```
src/components/screening/
├── ApplicationTable.tsx        — Sortable/filterable table (reuse existing table patterns)
├── CreateApplicationForm.tsx   — Property + applicant + tier selector
├── ApplicationDetail.tsx       — Full detail view with tabs
├── StatusTimeline.tsx          — Visual progress indicator (draft → ... → decision)
├── RiskScoreBadge.tsx          — Color-coded score display (green/yellow/red)
├── DecisionPanel.tsx           — Approve/Conditional/Deny buttons + notes
└── EventLog.tsx                — Audit trail timeline
```

### 2.3 Server Actions (`actions.ts`)

Following the `client-onboarding/actions.ts` pattern:

- `getAuthContext()` — reuse existing pattern (user lookup, org, role)
- `createApplication()` — validate inputs, generate access token, create application + main applicant
- `listApplications()` — agent sees own, broker/admin sees org-wide (match RLS logic in app code)
- `getApplication(id)` — full detail with nested applicant, credit, wellness, documents, events
- `updateDecision(id, decision, notes)` — set approved/conditional/denied + log event
- `sendInvite(id)` — dispatch SMS (Twilio) + email (Resend) to all applicants
- `addApplicant(applicationId, role, email, phone)` — add co-applicant/guarantor
- `deleteApplication(id)` — soft delete or status change to withdrawn

### 2.4 Invite Dispatch

Email template (Resend):
- Subject: "Complete Your Rental Application — {propertyAddress}"
- Body: Agent name, property info, link to wizard, deadline
- CTA button: "Start Application"

SMS template (Twilio):
- "{agentName} invited you to complete a rental application for {address}. Start here: {link}"

### 2.5 Billing Settings

- Stripe `SetupIntent` flow for saving org's default payment method
- Card on file display (last 4, brand, expiry)
- Enhanced charge history table
- Only visible to broker/admin roles

**Deliverable:** Agent can create application → send invite → view in list → see detail → mark decision. Billing page shows card management.

---

## Phase 3: Applicant Wizard (6-Step Public Flow)

**Goal:** Applicant receives link, completes mobile-first wizard, pays $20, triggers processing.

### 3.1 Pages

```
src/app/screen/[token]/
├── page.tsx                    — Entry point (loads app data, shows landing or resume)
└── client.tsx                  — Client component with full wizard state machine
```

Single client component manages all 6 steps (matching the `/sign/[token]/client.tsx` pattern — no step-based routing, just state).

### 3.2 API Routes (Applicant-Facing, Token-Gated)

```
src/app/api/screen/[token]/
├── route.ts                    — GET: load application + org config + legal docs
├── otp/route.ts                — POST: send 6-digit OTP via Twilio
├── verify-otp/route.ts         — POST: verify OTP, set httpOnly session cookie (24hr)
├── personal-info/route.ts      — POST: save form data to applicant.personalInfo JSONB
├── signature/route.ts          — POST: upload signature PNG, compute SHA-256 hash
├── plaid-link/route.ts         — POST: generate Plaid Link token
├── plaid-exchange/route.ts     — POST: exchange public_token → access_token (encrypted)
├── documents/route.ts          — POST: upload files to Supabase Storage
├── payment/route.ts            — POST: create Stripe Checkout session ($20)
└── status/route.ts             — GET: current wizard step + processing status
```

All routes validate the `access_token` from URL, return 404 if invalid.

### 3.3 Wizard Steps (Components)

```
src/components/screening/wizard/
├── WizardShell.tsx             — Progress bar + step container + mobile-first layout
├── LandingView.tsx             — Property info, agent info, "Start" / "Resume" buttons
├── PersonalInfoStep.tsx        — Dynamic form from org's field config JSON schema
├── SignatureStep.tsx           — Scrollable legal docs + Canvas signature pad
├── PlaidStep.tsx               — Plaid Link embed + skip option
├── DocumentUploadStep.tsx      — File upload with type selector (PDF/JPG/PNG/HEIC)
├── PaymentStep.tsx             — Stripe Checkout embed ($20)
└── ConfirmationStep.tsx        — Status with real-time updates (polling or Supabase Realtime)
```

### 3.4 Key Implementation Details

**OTP Session Resume:**
- Applicant enters email or phone → receive 6-digit code → verify → httpOnly cookie set
- Cookie contains encrypted `{applicantId, applicationId, expiresAt}`
- On return visit, check cookie first; if expired, prompt OTP again

**Dynamic Form (Personal Info):**
- `organizations.settings` contains `applicationFieldConfig` JSON schema
- Default schema: full name, DOB, SSN, current address, employer, income, rental history, references
- `field-config.ts` renders form fields from schema, respects `roleOverrides` for guarantors
- Auto-save on blur with debounced PATCH

**Signature Capture:**
- HTML Canvas with touch support (finger on mobile, mouse on desktop)
- On sign: convert canvas to PNG blob, compute `SHA-256(signatureBytes + documentText + timestamp)`
- Store hash in `ScreeningSignature`, upload PNG to Supabase Storage
- Record IP + user agent for audit

**Plaid Link:**
- Initialize with `products: ['transactions', 'identity']`
- On success: POST to `/plaid-exchange` → server exchanges token, stores encrypted
- Skip option: marks step as skipped, makes document upload required
- Show institution name + last 4 of account as confirmation

**Document Upload:**
- Drag-and-drop + file picker, accept PDF/JPG/PNG/HEIC, max 10MB/file, max 5 files
- Document type selector per file (pay stub, W-2, tax return, bank statement, employment letter, other)
- Upload to Supabase Storage in `screening-documents/{applicationId}/{filename}`
- AI analysis fires async after upload (doesn't block wizard)

**Payment:**
- Create Stripe Checkout session with `mode: 'payment'`, `amount: 2000`
- `success_url` → back to wizard Step 6
- `cancel_url` → back to payment step
- Webhook triggers processing pipeline (Phase 4)

**Confirmation:**
- Shows animated status timeline: Submitted → Verifying → Analyzing → Complete
- Poll `/api/screen/[token]/status` every 5 seconds (or Supabase Realtime if feasible)
- "You're all done!" message when complete

**Deliverable:** Applicant can receive link → complete all 6 steps → pay $20 → see confirmation with processing status.

---

## Phase 4: Processing Pipeline

**Goal:** After payment, automatically pull credit, sync bank data, analyze documents, compute scores, generate report.

### 4.1 Pipeline Orchestrator

```
src/lib/screening/pipeline.ts   — Main orchestrator function
```

Triggered by Stripe webhook (`checkout.session.completed` for screening payments). Runs server-side only.

```typescript
async function runScreeningPipeline(applicationId: string): Promise<void> {
  // 1. Update status → 'processing'
  // 2. If enhanced tier: charge org's saved card ($49)
  //    - On failure: downgrade to base, notify agent, log event
  // 3. Parallel execution (Promise.allSettled):
  //    - Pull credit report(s) — 1 bureau (base) or 3 (enhanced)
  //    - Sync Plaid transactions — 90d (base) or 6-12mo (enhanced)
  //    - Analyze each uploaded document (3-layer AI pipeline)
  //    - If enhanced: employment verification + rental history
  // 4. After all settle:
  //    - Compute financial wellness profile
  //    - Compute VettdRE Risk Score
  //    - Generate PDF report
  //    - Update status → 'complete'
  //    - Notify agent (email + SMS)
}
```

### 4.2 Credit Report Pull (`lib/screening/crs.ts`)

- **Base tier:** Single Equifax soft pull + criminal + eviction (one API call to CRS)
- **Enhanced tier:** Tri-bureau (Equifax + Experian + TransUnion) + employment verification + RentBureau
- **Mock mode:** Returns realistic test data from `crs-mock.ts` when `SCREENING_USE_MOCKS=true`
- Parse response into `CreditReport` model fields
- Encrypt raw report, set `expiresAt` per FCRA (30 days)

### 4.3 Plaid Transaction Sync (`lib/screening/plaid.ts`)

- Call `transactions/sync` endpoint with stored access token
- **Base:** Last 90 days
- **Enhanced:** 6-12 months
- Parse each transaction into `FinancialTransaction` model
- Categorize using Plaid categories → map to `vettdreCategory` enum
- Flag red flags: NSF fees, overdraft fees, late fees, gambling transactions
- Detect recurring transactions (rent payments, salary deposits)

### 4.4 AI Document Analysis (`lib/screening/document-analysis.ts`)

Three sequential layers per document:

**Layer 1 — Metadata Forensics:**
- Extract PDF metadata (creation software, modification dates, fonts)
- Photoshop/editor origin on pay stubs = red flag
- Multiple modification timestamps = suspicious
- Output: `metadataRiskLevel` (clean/warning/suspicious/fraudulent)

**Layer 2 — AI Data Extraction (Claude):**
- Send document image/text to Claude with structured extraction prompt
- Extract fields based on document type (employer, pay, dates, balances, etc.)
- Output: `extractedData` JSONB + `extractionConfidence` (0-100)

**Layer 3 — Cross-Verification Against Plaid:**
- Compare extracted data vs. Plaid bank transaction data
- Income match: pay stub gross ≈ deposit amounts?
- Employer match: employer name ≈ payroll deposit source?
- Balance match: statement balance ≈ Plaid account balance?
- Output: `crossVerification` JSONB, `discrepancies[]`, `fraudScore` (0-100)

### 4.5 Financial Wellness Computation (`lib/screening/wellness.ts`)

From parsed transactions, compute:
- Average monthly income (by source), income stability score, income trend
- Average monthly expenses, recurring obligations
- Income-to-rent ratio, debt-to-income ratio, disposable income
- Average balances (30/60/90 day), lowest balance in 90 days
- Rent payment history (found, on-time count, consistency rating)
- Red flags: NSF count, overdraft count, late fees, gambling transactions
- Overall financial health score (0-100) + tier (excellent/good/fair/poor/critical)

### 4.6 VettdRE Risk Score (`lib/screening/scoring.ts`)

Weighted composite (0-100) exactly as specified:
- Credit score: 30% (normalized 300-850 → 0-100)
- Financial health: 30%
- Income-to-rent ratio: 20% (3x+ = 100)
- Document fraud: 10% (inverted)
- Rent payment history: 10%

Recommendation: ≥75 approve, 50-74 conditional, <50 decline
Generate risk factor explanations.

### 4.7 Enhanced Tier — Org Charge

- Use org's `stripeCustomerId` + saved `stripeDefaultPaymentMethod`
- Create PaymentIntent for $49 (or org's configured `enhancedScreeningPriceCents`)
- On failure: graceful downgrade to base tier, email + SMS notification to agent
- Log all payment events

### 4.8 Webhook Additions

Add to existing Stripe webhook handler (`api/webhooks/stripe/route.ts`):
- Detect screening checkout sessions via metadata
- Route to `runScreeningPipeline()`

New webhook routes:
- `api/webhooks/plaid/route.ts` — TRANSACTIONS_SYNC, ITEM_ERROR events
- `api/webhooks/crs/route.ts` — Credit report delivery callback (if async)

### 4.9 Idempotency

- Pipeline checks `application.status === 'processing'` before running
- Each sub-step checks if its data already exists (e.g., CreditReport for this applicant)
- Webhook handler logs event ID to prevent double-processing

**Deliverable:** Payment triggers full automated pipeline → credit pulled → bank synced → docs analyzed → scores computed → report generated → agent notified.

---

## Phase 5: PDF Report Generation

**Goal:** Professional, scannable PDF report that is the core deliverable.

### 5.1 Approach

Use `pdf-lib` (already installed, ^1.17.1) for server-side PDF generation. Pure JS, no headless browser needed, consistent with existing PDF generation patterns in the codebase (`invoice-simple-pdf.ts`, `deal-pdf.ts`, `bov-pdf.ts`). `jspdf` (^4.2.0) is also available as an alternative if more complex layouts are needed.

**Decision:** Use `pdf-lib` matching existing codebase patterns. No new packages needed.

### 5.2 Report Template (`lib/screening/pdf-report.ts`)

**Page 1: Cover**
- VettdRE logo + "Tenant Screening Report" header
- Property address + unit, applicant name(s), application date
- Large VettdRE Risk Score circle (green ≥75, yellow 50-74, red <50)
- Recommendation badge: APPROVE / CONDITIONAL / DECLINE
- 3-5 key risk factors listed

**Page 2: Applicant Profile**
- Personal info from application (name, DOB, current address, employer, income)
- Employment history, rental history, references (from self-reported data)

**Page 3: Credit Summary**
- Score + bureau, account summary table
- Collections, public records, bankruptcies
- Eviction history (count + details)
- Criminal background (count + details, NYC Fair Chance Act compliant)

**Page 4: Financial Wellness**
- Income vs. expenses donut chart
- Income-to-rent ratio gauge (visual)
- Debt-to-income ratio
- 30/60/90 day average balances
- Recurring obligations table
- Red flags section (NSF, overdrafts, late fees, gambling — highlighted)

**Page 5: Document Verification**
- Each uploaded document as a row
- Fraud assessment badge per document
- Cross-verification results (income match, employer match, balance match)
- Confidence scores
- Discrepancies called out

**Page 6+: Co-Applicants/Guarantors** (repeat pages 2-5 for each additional person)

**Final Page: Legal**
- E-signature records with timestamps
- FCRA compliance notice
- Report generation timestamp
- "This report was generated by VettdRE and is for informational purposes only"

### 5.3 Storage + Delivery

- Generate PDF → upload to Supabase Storage at `screening-reports/{applicationId}/report.pdf`
- Store path in `application.reportPdfPath`
- Agent downloads from detail page via signed URL (time-limited)

**Deliverable:** Beautiful, professional PDF generated automatically, downloadable from agent dashboard.

---

## Phase 6: Org Billing Settings

**Goal:** Brokers/admins can save a card for enhanced screening charges and view charge history.

### 6.1 Pages

```
src/app/(dashboard)/screening/billing/page.tsx
```

### 6.2 Features

- **Save Card:** Stripe SetupIntent → Elements card form → save as org default payment method
- **Card Display:** Brand icon + last 4 + expiry + "Update" button
- **Charge History:** Table of enhanced screening charges (date, application, amount, status)
- **Access Control:** Broker/admin only (agents see "Contact your broker" message)

### 6.3 API Routes

```
src/app/api/screening/billing/
├── route.ts                    — GET: card on file status
├── setup-intent/route.ts       — POST: create Stripe SetupIntent (NEW PATTERN — first SetupIntent in codebase)
├── payment-method/route.ts     — POST: save default payment method to Organization
└── history/route.ts            — GET: list enhanced screening charges
```

### 6.4 Integration with Existing Org Model

- `stripeCustomerId` — already exists on Organization ✓
- `stripeDefaultPaymentMethod` — **MUST ADD** (new field, does not exist)
- No new model needed, just extend existing Organization

### 6.5 NEW: Stripe SetupIntent Flow (First in Codebase)

This is a new pattern — no existing SetupIntent code to reference. Implementation:
1. Server creates `stripe.setupIntents.create({ customer: org.stripeCustomerId })`
2. Returns `clientSecret` to frontend
3. Frontend uses Stripe Elements `CardElement` to collect card
4. On confirmation: `stripe.setupIntents.confirm()` → returns `paymentMethod` ID
5. Server saves `paymentMethod.id` to `organization.stripeDefaultPaymentMethod`
6. When charging enhanced tier: `stripe.paymentIntents.create({ customer, payment_method, amount: 4900, confirm: true, off_session: true })`

### 6.6 NEW: One-Time Payment Checkout (First in Codebase)

All existing Stripe checkout uses `mode: "subscription"`. Screening applicant fee needs `mode: "payment"`:
```typescript
const session = await stripe.checkout.sessions.create({
  mode: "payment",  // NOT "subscription"
  line_items: [{ price_data: { currency: "usd", unit_amount: 2000, product_data: { name: "Tenant Screening Fee" } }, quantity: 1 }],
  metadata: { screeningApplicationId, applicantId, orgId },
  success_url: `${appUrl}/screen/${token}?step=6`,
  cancel_url: `${appUrl}/screen/${token}?step=5`,
});
```
The existing Stripe webhook handler routes by checking `session.metadata?.screeningApplicationId` to distinguish from subscription payments.

**Deliverable:** Broker can save card → enhanced tier available → charge history visible.

---

## Phase 7: Polish + Deploy

**Goal:** Production-ready with error handling, loading states, mobile UX, and deployment.

### 7.1 Error Handling
- All API routes wrapped in try/catch with appropriate HTTP status codes
- Pipeline steps use `Promise.allSettled` — partial failures don't kill the whole run
- Graceful degradation: if Plaid fails, document analysis still runs; if credit pull fails, flag it on report
- Agent notification on any pipeline failure with specific failure reason

### 7.2 Loading & Empty States
- Skeleton shimmer on application list (reuse existing pattern)
- Step-by-step loading indicators in wizard
- Empty states for: no applications yet, no documents uploaded, no card on file

### 7.3 Mobile Responsiveness
- Wizard is mobile-first: large tap targets, no horizontal scroll, full-width inputs
- Signature pad works with finger (touch events + pointer events)
- Document upload supports camera capture on mobile (`accept="image/*;capture=camera"`)
- Application list responsive: cards on mobile, table on desktop

### 7.4 Deployment
- No new Dockerfile needed — runs within existing VettdRE deployment
- Add new env vars to `cloudbuild.yaml` secrets
- Add Plaid + CRS secrets to Google Secret Manager
- Run `npx prisma migrate deploy` as part of deployment

### 7.5 FCRA Compliance Verification
- Verify all legal disclosures are present and correctly worded
- Credit report auto-expiry job (can add to existing cron endpoint)
- Fair Housing Act: risk score inputs verified as permissible
- NYC Fair Chance Act: criminal history presentation compliant
- Audit trail complete for every action

### 7.6 Testing Checklist
- [ ] Agent creates base screening → invite sent → applicant completes wizard → pipeline runs → PDF generated
- [ ] Agent creates enhanced screening → card charged → tri-bureau pulled → full pipeline runs
- [ ] Enhanced with no card on file → blocked at creation
- [ ] Enhanced card charge fails → graceful downgrade to base
- [ ] Applicant skips Plaid → document upload becomes required
- [ ] OTP session resume works (close browser, reopen link, enter OTP)
- [ ] Multiple co-applicants/guarantors flow
- [ ] Mobile wizard end-to-end
- [ ] Webhook idempotency (replay same webhook → no double processing)

**Deliverable:** Production-ready screening module, deployed.

---

## Phase 8: Cross-App Integration

**Goal:** Screening plugs seamlessly into every relevant surface — CRM, pipeline, brokerage, dashboard, leasing, activity timeline, notifications.

### 8.1 CRM Contacts Integration

**Prisma changes:**
- Add `screeningApplications ScreeningApplication[]` relation to `Contact` model
- Add `contactId` optional FK to `ScreeningApplication` model

**Auto-create contacts from applicants:**
- When screening pipeline completes (`status → 'complete'`):
  1. Check if `ScreeningApplicant.email` matches an existing Contact in the org
  2. If match → link `ScreeningApplication.contactId` to existing Contact
  3. If no match → create new Contact with: name, email, phone from applicant; `contactType: 'renter'`; `status: 'lead'`; `source: 'screening'`
  4. Create/update `EnrichmentProfile` on the Contact with financial data from screening (income, employer, credit score range — NOT raw SSN or credit report)

**Contact Dossier changes** (`contacts/[id]/contact-dossier.tsx`):
- Add "Screening" section to **Overview tab** (after enrichment card):
  - Risk Score badge (color-coded), recommendation, date completed
  - "View Full Report" link → `/screening/{applicationId}`
  - Status: approved/conditional/denied with icon
- Add screenings to the Prisma include in `getContact()`:
  ```typescript
  screeningApplications: { orderBy: { createdAt: 'desc' }, take: 5,
    select: { id, status, vettdreRiskScore, riskRecommendation, completedAt, propertyAddress } }
  ```

### 8.2 Pipeline / Deal Cards Integration

**Transaction list** (`brokerage/transactions/page.tsx`):
- On deal cards for rental transactions, show screening badge:
  - If linked contact has a completed screening → green "✓ Screened" or red "✗ Declined"
  - If no screening → gray "No Screening" (clickable → create screening for this contact)
- Query: join through `Transaction.dealSubmission.contact.screeningApplications`

**Deal detail page:**
- Add "Screening" section showing linked screening status + risk score + link to report

### 8.3 Brokerage Dashboard Widget

**BMS Dashboard** (`brokerage/dashboard/page.tsx`):
- Add new stats card in the dashboard grid:
  - "Screenings This Period" — count of applications created in selected period
  - "Approval Rate" — percentage approved vs total completed
  - "Avg Risk Score" — average VettdRE Risk Score across completed screenings
  - "Pending Review" — count needing agent decision
- Query via new server action `getScreeningDashboardStats(orgId, periodStart, periodEnd)`

**Agent Detail** (`brokerage/agents/[id]/page.tsx`):
- Add "Screening" to tabs array (currently: overview, deals, invoices, compliance, performance, notes)
- Tab content: table of screening applications created by this agent
  - Columns: applicant name, property, status, risk score, date
  - Mini stats row: total screened, approval rate, avg score

**My Deals Portal** (`brokerage/my-deals/`):
- Add screening status column to deal submission rows
- "Start Screening" quick action on eligible rental submissions

### 8.4 Main Dashboard Widget

**Dashboard** (`dashboard/page.tsx`):
- Add "Screening Pipeline" widget after Brokerage Pulse section
- Conditionally rendered: only if user has `screening_view` feature permission
- Widget contents:
  - 4-stat row: In Progress | Awaiting Review | Approved This Month | Avg Score
  - Mini list: 3 most recent completed screenings (applicant, property, decision, score)
  - CTA: "+ New Screening" button → `/screening/new`
- Server action: `getScreeningDashboardWidget(orgId)` in `dashboard/feed-actions.ts`
- Loads async with skeleton shimmer (matching existing dashboard pattern)

### 8.5 Leasing Agent Integration

**Leasing conversation flow** (`leasing/actions.ts`):
- When a conversation reaches "qualified" status (via `resolveEscalation()`):
  - If the conversation has a linked `contactId` → show "Start Screening" action in conversation detail
  - Pre-populate screening creation with prospect data from conversation (name, phone, email, property from `LeasingConfig`)
- In conversation detail sidebar:
  - If contact has a screening → show status badge + risk score + link to report
  - If no screening → show "Initiate Screening" button

### 8.6 Activity Timeline Integration

**Add `screening` to ActivityType enum** (Prisma):
```prisma
enum ActivityType {
  email, call, text, showing, note, meeting, document, system, screening
}
```

**Create Activity records at screening milestones:**

1. **Screening created** → `type: 'screening'`, `subject: 'Screening initiated'`, `metadata: { screeningApplicationId, propertyAddress }`
2. **Screening completed** → `type: 'screening'`, `subject: 'Screening complete: APPROVE/CONDITIONAL/DECLINE'`, `metadata: { screeningApplicationId, riskScore, recommendation }`
3. **Decision recorded** → `type: 'screening'`, `subject: 'Decision: Approved/Denied by {agentName}'`, `metadata: { screeningApplicationId, decision, notes }`

**Display in contact dossier Activity tab:**
- Screening activities render with 🔐 icon
- Show risk score badge inline, clickable link to full report
- Decision activities show the agent's notes

### 8.7 Notifications

**Create `lib/screening/notifications.ts`** (follows `lib/onboarding-notifications.ts` pattern):

- `notifyAgentScreeningComplete(params)` — Email (Resend) + Push + AuditLog
  - Email: styled HTML with risk score, recommendation, property, "View Report" CTA
  - Push: `sendPushNotification(agentUserId, { title: 'Screening Complete', body: '...', url: '/screening/{id}' })`
  - AuditLog: `{ action: 'screening_completed', entityType: 'screening_application', ... }`

- `notifyAgentScreeningFailed(params)` — Email + Push for pipeline failures

- `notifyAgentDecisionNeeded(params)` — Email + Push when screening completes and needs manual review

- `notifyAgentEnhancedDowngrade(params)` — Email + SMS when enhanced charge fails and falls back to base

### 8.8 Automation Engine Integration

**Add screening triggers to automation system:**
- New trigger type: `screening_completed` → fires when screening reaches 'complete' status
- Conditions available: `riskScore`, `recommendation`, `screeningTier`
- Example automation: "When screening completes with score < 50, create task: 'Review declined screening for {contactName}'"
- Wire via existing `dispatchAutomationSafe(orgId, 'screening_completed', { ... })` pattern

### 8.9 Integration Touchpoint Summary

| Surface | File(s) to Modify | What Changes |
|---------|-------------------|--------------|
| Contact model | `schema.prisma` | Add `screeningApplications` relation |
| Contact dossier | `contacts/[id]/contact-dossier.tsx` | Add screening summary card in Overview tab |
| Contact detail fetch | `contacts/[id]/actions.ts` | Include screening apps in Prisma query |
| Transaction cards | `brokerage/transactions/page.tsx` | Add screening status badge |
| BMS Dashboard | `brokerage/dashboard/page.tsx` | Add screening stats widget |
| Agent detail | `brokerage/agents/[id]/page.tsx` | Add "Screening" tab |
| My Deals portal | `brokerage/my-deals/` | Add screening column + quick action |
| Main Dashboard | `dashboard/page.tsx` + `feed-actions.ts` | Add screening pipeline widget |
| Leasing actions | `leasing/actions.ts` | Add screening CTA in qualified conversations |
| ActivityType enum | `schema.prisma` | Add `screening` value |
| Activity creation | `lib/screening/pipeline.ts` | Create activities at milestones |
| Notifications | NEW `lib/screening/notifications.ts` | Email + Push + AuditLog |
| Automation triggers | `lib/automation-types.ts` | Add `screening_completed` trigger |
| Feature gate | `lib/feature-gate.ts` | Add `screening_view` feature |
| BMS permissions | `lib/bms-permissions.ts` or `bms-types.ts` | Add 4 screening permissions |
| Sidebar nav | `components/layout/sidebar.tsx` | Add Screening nav item |
| Mobile nav | `components/layout/mobile-nav.tsx` | Add to More sheet |
| Middleware | `lib/supabase/middleware.ts` | Add `/screen/`, `/api/screen/` public routes |

**Deliverable:** Screening data flows everywhere — contacts show screening status, deal cards show badges, dashboard has live stats, leasing hands off to screening, activity timeline tracks every milestone, agents get notified through all channels.

---

## New Packages Required

```json
{
  "plaid": "^26.0.0"
}
```

That's it. Everything else is already installed:
- `stripe` ^20.3.1 — checkout, SetupIntent, PaymentIntent
- `twilio` ^5.12.2 — SMS invites, OTP
- `resend` ^6.9.4 — email invites, notifications
- `@anthropic-ai/sdk` — document analysis
- `pdf-lib` ^1.17.1 — PDF report generation
- `jspdf` ^4.2.0 — alternative PDF if needed
- `@supabase/supabase-js` ^2.95.3 — storage, auth
- Node.js `crypto` — SHA-256 hashing, encryption (built-in, no package needed)

---

## File Count Estimate

| Category | Files | Notes |
|----------|-------|-------|
| Prisma schema additions | 1 | ~12 models, ~5 enums added to existing file |
| Lib files (`lib/screening/`) | 11 | Core business logic + notifications |
| Dashboard pages | 4 | List, new, detail, billing |
| Dashboard components | 7 | Table, form, detail, timeline, score, decision, events |
| Public wizard pages | 1 | Single page + client component |
| Wizard components | 8 | Shell + 6 steps + landing |
| API routes (agent) | 6 | Applications CRUD + billing |
| API routes (applicant) | 10 | Token-gated wizard endpoints |
| API routes (webhooks) | 2-3 | Plaid, CRS (Stripe extends existing) |
| Cross-app modifications | ~15 | Contact dossier, deal cards, dashboards, leasing, nav, middleware, feature gates |
| **Total** | **~65 files** | (~50 new + ~15 modified existing) |

---

## Session Strategy

Given the scope (now 8 phases with full integration), here's the session breakdown:

**Session 1 (this plan) ✓** — Architecture decisions + full plan + audit

**Session 2** — Phase 1 (schema + foundation + nav + feature gates + middleware)

**Session 3** — Phase 2 (agent dashboard CRUD + invites + billing settings)

**Session 4** — Phase 3 (applicant wizard — all 6 steps + API routes)

**Session 5** — Phase 4 (processing pipeline — credit, Plaid, AI analysis, scoring)

**Session 6** — Phase 5 (PDF report) + Phase 6 (billing SetupIntent + one-time payment flows)

**Session 7** — Phase 8 (cross-app integration — contacts, deals, dashboards, leasing, activities, notifications)

**Session 8** — Phase 7 (polish, mobile, error handling, testing, deployment)

Each session picks up where the last left off via the memory file. Integration (Phase 8) runs after core features are built so we have real data to wire up.
