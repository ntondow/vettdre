# Screening Module: Finish & Polish — Claude Code Handoff

## Goal

Complete the tenant screening module to production-ready state. This means: deploying the existing 8-phase build, adding identity verification (Didit + Stripe Identity fallback), wrapping the credit provider in an abstraction layer, adding FCRA adverse action notices, applicant completion notifications, fixing a Stripe key mismatch, and running end-to-end verification. Work in 4 batches, each independently deployable.

## Project

- **Repo:** VettdRE (Next.js 16, TypeScript, Prisma, Supabase)
- **Target folder:** `src/` within existing repo
- **Screening code lives in:** `src/lib/screening/`, `src/app/(dashboard)/screening/`, `src/app/screen/[token]/`, `src/app/api/screen/[token]/`, `src/app/api/screening/`, `src/components/screening/`

## Current State

All 8 build phases are complete. Security hardening is done (rate limiting, SSN pass-through via Redis, OTP, CSP, webhook idempotency, PII redaction). The module works end-to-end in mock mode (`SCREENING_USE_MOCKS=true`). What's missing: IDV step, credit provider abstraction, FCRA adverse action flow, applicant notifications, Stripe key fix, Plaid webhook URL, and production deploy.

---

## Batch 1: Config Fixes + Deploy Baseline

### What it should do
Get the current screening module deployed to Cloud Run with all config issues fixed, so there's a working baseline to test against.

### Implementation intent

1. **Fix Stripe key mismatch — DONE.** `.env.local` already updated: `pk_test_*` → `pk_live_*`. Still need to update the GCP Secret Manager value:
   ```bash
   echo -n "pk_live_51QAHX9CehWC3IMoUQAQibhN9LN32LnpQltItvHEAnInDyVYUFtrJrW0AbzY7fJStIxXe1Zc9icKrNddF97nF9jax00VfSP7vEt" | gcloud secrets versions add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY --data-file=-
   ```

2. **Set Plaid webhook URL — DONE in .env.local.** Set to `https://vettdre-ru6vvo37qa-ue.a.run.app/api/webhooks/plaid`. Nathan still needs to configure this same URL in the Plaid dashboard under Developers → Webhooks (manual step, not code). Also add `PLAID_WEBHOOK_URL` to `cloudbuild.yaml` runtime secrets (currently missing).

3. **Clean up .env.local.** Line 1 has a typo `AANTHROPIC_API_KEY` (double A) with a placeholder value — remove it. Lines 2-3 have `ANTHROPIC_API_KEY` duplicated — remove one.

4. **Run Prisma migration.** The screening models (7 enums, 11 tables) were added to `schema.prisma` but the migration may not have been applied to production DB. Also need the `ProcessedWebhook` model migration from security hardening. Check if migrations exist in `prisma/migrations/` — if not, generate them. Then apply via Supabase MCP or direct connection.

5. **Verify Supabase Storage buckets.** Confirm `screening-reports` and `screening-documents` buckets exist in Supabase Storage (they should from prior work).

6. **Add missing GCP secrets to `cloudbuild.yaml`.** The following runtime secrets are MISSING from `cloudbuild.yaml` and need to be added to the `--set-secrets` block:
   - `PLAID_WEBHOOK_URL` — not in runtime secrets
   - `PLAID_ENV` — not in runtime secrets (code defaults to sandbox without it)
   - `SCREENING_USE_MOCKS` — not in runtime secrets
   - `CRS_API_BASE_URL` — not in runtime secrets (exists in .env.local)
   - `CRS_ACCOUNT_ID` — not in runtime secrets (exists in .env.local)
   - `BASE_SCREENING_FEE_CENTS` — not in runtime secrets (may be fine if hardcoded in constants.ts)
   - `ENHANCED_SCREENING_FEE_CENTS` — same as above

   Also note: `CRS_API_SECRET` IS in cloudbuild.yaml but the actual code (`crs.ts`) uses `CRS_API_KEY` as Bearer token — verify whether `CRS_API_SECRET` is dead or if it maps to a different header.

   Already confirmed present: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (build-time).

7. **Create GCP secrets for new env vars.** For any secrets added to `cloudbuild.yaml`, they must also exist in GCP Secret Manager. Run:
   ```bash
   echo -n "value" | gcloud secrets create SECRET_NAME --data-file=-
   # Or for existing secrets that need a new version:
   echo -n "value" | gcloud secrets versions add SECRET_NAME --data-file=-
   ```

8. **Deploy to Cloud Run.** Run `gcloud builds submit` and verify the screening routes are accessible.

### Files likely involved
- `.env.local` — key fixes
- `cloudbuild.yaml` — secret verification
- `Dockerfile` — build arg verification
- `next.config.ts` — env var inlining check
- `prisma/schema.prisma` — migration status
- `prisma/migrations/` — migration files

### Constraints
- Do NOT flip `SCREENING_USE_MOCKS` to false yet (CRS not approved)
- Do NOT modify any screening business logic
- Follow existing `cloudbuild.yaml` secret patterns (runtime via `--set-secrets`, build-time via `availableSecrets`)
- Prisma migrations must be run against production DB, not just generated

---

## Batch 2: Identity Verification (Didit + Stripe Identity)

### What it should do
Add a new wizard step (Step 3, between e-sign and Plaid) that verifies the applicant's identity using Didit as primary provider and Stripe Identity as automatic fallback. IDV score contributes as a BONUS on top of the existing 100-point scale, not a redistribution of existing weights.

### Implementation intent

1. **Schema addition.** Add `IdentityVerification` model to Prisma schema per the spec in `IDV_INTEGRATION_PLAN.md`. Key fields: applicantId, applicationId, provider, providerSessionId (unique), status, documentType, livenessScore, faceMatchScore, documentQuality, warnings JSON, rawResponseEncrypted, completedAt.

2. **Provider abstraction layer.** Create `src/lib/screening/idv-provider.ts` with a common `IdvProvider` interface: `createSession()`, `getResult()`, `parseWebhook()`. Create `idv-didit.ts` (Didit implementation), `idv-stripe.ts` (Stripe Identity implementation), and `idv-factory.ts` (selects provider via `IDV_PROVIDER` env var, automatic failover on 5xx/timeout from Didit → Stripe Identity).

3. **API routes.** Create `src/app/api/screen/[token]/idv-start/route.ts` (POST — creates verification session with selected provider, returns redirect URL or session token) and `src/app/api/screen/[token]/idv-status/route.ts` (GET — polls verification result). Create webhook route at `src/app/api/webhooks/idv/didit/route.ts` (HMAC-SHA256 signature verification using `DIDIT_WEBHOOK_SECRET`).

4. **Wizard step.** Create `src/components/screening/wizard/IdvStep.tsx`. Flow: show explanation of what IDV does → user clicks "Verify My Identity" → redirect to Didit/Stripe hosted verification → return to wizard → poll for result → show success/failure. If IDV fails or times out, allow the applicant to retry (up to 3 attempts) or skip (flag for manual review).

5. **Wizard orchestrator update.** In `src/app/screen/[token]/client.tsx`, insert the IDV step between signature and plaid steps. Update the step state machine: `landing → personal_info → signature → idv → plaid → documents → payment → confirmation`.

6. **Pipeline integration.** In `src/lib/screening/pipeline.ts`, add an IDV scoring step. IDV contributes as a BONUS (up to +15 points) on top of the existing 100-point score. Scoring: approved with high confidence (liveness ≥ 90, face match ≥ 90) = +15. Approved with lower confidence = +5 to +10. Not verified / skipped = +0. Declined / fraud detected = -10 penalty. Do NOT redistribute existing scoring weights.

7. **PDF report update.** In `src/lib/screening/pdf-report.ts`, add an "Identity Verification" section showing: provider used, verification status, document type, liveness/face match scores, and whether it was a bonus or penalty.

8. **Admin detail page.** In `src/app/(dashboard)/screening/[id]/page.tsx`, show IDV status on applicant cards (verified badge, pending, failed, skipped). Show scores in the Overview tab.

### Files likely involved
- `prisma/schema.prisma` — new model
- `src/lib/screening/idv-provider.ts` — NEW: types + interface
- `src/lib/screening/idv-didit.ts` — NEW: Didit implementation
- `src/lib/screening/idv-stripe.ts` — NEW: Stripe Identity implementation
- `src/lib/screening/idv-factory.ts` — NEW: provider selection + failover
- `src/app/api/screen/[token]/idv-start/route.ts` — NEW
- `src/app/api/screen/[token]/idv-status/route.ts` — NEW
- `src/app/api/webhooks/idv/didit/route.ts` — NEW
- `src/components/screening/wizard/IdvStep.tsx` — NEW
- `src/app/screen/[token]/client.tsx` — step machine update
- `src/lib/screening/pipeline.ts` — IDV scoring step
- `src/lib/screening/pdf-report.ts` — IDV section
- `src/lib/screening/scoring.ts` — bonus scoring logic
- `src/app/(dashboard)/screening/[id]/page.tsx` — IDV display
- `src/lib/supabase/middleware.ts` — whitelist webhook route
- `.env.local` — new env vars
- `cloudbuild.yaml` — new secrets

### Env vars needed
```
IDV_PROVIDER=didit
DIDIT_API_KEY=<Nathan has this>
DIDIT_WEBHOOK_SECRET=<Nathan has this>
DIDIT_WORKFLOW_ID=<Nathan needs to create workflow in Didit console>
```

### Constraints
- IDV score is a BONUS modifier, not a weight redistribution. Existing 100-point scale stays intact.
- Follow the provider abstraction pattern exactly as described in `IDV_INTEGRATION_PLAN.md`
- Rate limit IDV routes using existing Upstash rate limiters
- Encrypt raw IDV response using existing `encryption.ts` (AES-256-GCM)
- Webhook must verify HMAC-SHA256 signature before processing
- Add idempotency via existing `webhook-idempotency.ts` pattern
- Add session validation using existing `session.ts` pattern on IDV routes
- Whitelist `/api/webhooks/idv/` in middleware.ts
- IDV should be skippable (flagged for manual review) — don't block the entire wizard if Didit is down

### Reference
- Full spec: `IDV_INTEGRATION_PLAN.md` at project root (599 lines, detailed)
- Didit API base: `https://verification.didit.me/v3`
- Stripe Identity docs: `https://docs.stripe.com/identity`

---

## Batch 3: Credit Provider Abstraction + FCRA Compliance + Notifications

### What it should do
Wrap the existing CRS credit client in an abstraction layer (so the credit provider can be swapped later), add legally required FCRA adverse action notices, and add applicant completion notifications.

### Implementation intent

1. **Credit provider abstraction.** Create `src/lib/screening/credit-provider.ts` with a `CreditProvider` interface: `pullSingleBureau(applicant)`, `pullTriBureau(applicant)`, `getCriminalRecords(applicant)`, `getEvictionRecords(applicant)`. Create `credit-crs.ts` that wraps the existing `crs.ts` logic behind this interface. Create `credit-factory.ts` that selects provider via `CREDIT_PROVIDER` env var (default: `crs`). Update `pipeline.ts` to use the factory instead of importing `crs.ts` directly. When `SCREENING_USE_MOCKS=true`, the factory should return the mock provider (existing `crs-mock.ts` logic).

2. **FCRA adverse action notice — automatic on decline.** When an agent clicks "Decline" on the decision panel, the system must automatically send an adverse action notice to the applicant. The notice must include:
   - Name of the credit bureau(s) used
   - Bureau contact information (address, phone, website)
   - Statement that the bureau did not make the decision
   - Applicant's right to dispute accuracy with the bureau
   - Applicant's right to a free report within 60 days
   - The specific score(s) that factored into the decision

   Create `src/lib/screening/adverse-action.ts` with `sendAdverseActionNotice(applicationId)`. Send via email (Resend). Log as a `ScreeningEvent`. Create an email template that meets FCRA requirements.

3. **Wire adverse action into decision flow.** In `src/app/(dashboard)/screening/actions.ts`, the `updateDecision()` function — when decision is "declined", call `sendAdverseActionNotice()` fire-and-forget after updating the record.

4. **Applicant completion notification.** When the screening pipeline completes (regardless of result), send the applicant an email and/or SMS saying: "Your screening application has been submitted and processed. The property manager will be in touch with next steps." Do NOT reveal the screening result to the applicant — only the agent sees the result. Add this to the end of `pipeline.ts` after all steps complete.

5. **Applicant notification on approval.** When the agent clicks "Approve", send the applicant a congratulatory email: "Great news — your application for [property address] has been approved! The property manager will contact you with next steps regarding your lease." Wire into `updateDecision()` for "approved" decisions.

### Files likely involved
- `src/lib/screening/credit-provider.ts` — NEW: interface + types
- `src/lib/screening/credit-crs.ts` — NEW: CRS implementation wrapping existing crs.ts
- `src/lib/screening/credit-factory.ts` — NEW: provider selection
- `src/lib/screening/adverse-action.ts` — NEW: FCRA notice generation + sending
- `src/lib/screening/notifications.ts` — add applicant completion + approval notifications
- `src/lib/screening/pipeline.ts` — use credit factory, add applicant notification at end
- `src/app/(dashboard)/screening/actions.ts` — wire adverse action + approval notification into updateDecision()
- `src/lib/screening/crs.ts` — may need minor refactor to fit interface
- `src/lib/screening/crs-mock.ts` — may need minor refactor to fit interface
- `.env.local` — add `CREDIT_PROVIDER=crs`

### Constraints
- Adverse action notices are legally required under FCRA. The email template MUST include all required disclosures. Research FCRA Section 615(a) requirements.
- Do NOT reveal the screening score or recommendation to the applicant in any notification. Only the agent/landlord sees the result.
- Adverse action fires automatically on decline — no agent confirmation step needed.
- Follow existing notification patterns in `notifications.ts` (Resend for email, Twilio for SMS, fire-and-forget)
- Credit factory must be backward-compatible with existing `SCREENING_USE_MOCKS` flag
- Do not change the scoring engine — only change how credit data is fetched

---

## Batch 4: End-to-End Testing + Polish

### What it should do
Verify the entire screening flow works end-to-end, fix any issues found, and polish the UX.

### Implementation intent

1. **Mock-mode E2E walkthrough.** With `SCREENING_USE_MOCKS=true`, walk through the entire wizard as an applicant: create screening → receive invite → complete all 7 steps (personal info → signature → IDV → Plaid → documents → payment → confirmation) → verify pipeline runs → verify agent gets notified → verify PDF generates → verify applicant gets completion notification → test approve flow (verify approval notification) → test decline flow (verify adverse action notice).

2. **Plaid sandbox test.** With `PLAID_ENV=sandbox`, test the real Plaid Link flow: link token creation → open Plaid Link → connect test bank → token exchange → transaction sync. Verify data flows into the pipeline correctly.

3. **Didit sandbox test.** Test the real Didit verification flow: create session → redirect to hosted verification → complete with test documents → webhook callback → verify result stored. If Didit doesn't have a sandbox, test with their test/demo mode.

4. **Error state testing.** Test: what happens if Plaid Link fails? If IDV times out? If Stripe payment fails? If document upload fails? If the pipeline crashes mid-run? Verify graceful degradation and error messages at every step.

5. **Mobile responsiveness check.** Walk through the entire wizard on mobile viewport. The wizard was built with responsive classes but hasn't been verified end-to-end on mobile. Fix any layout issues.

6. **Admin dashboard polish.** Verify all screening dashboard pages render correctly with real(ish) data: list page, detail page with all 5 tabs, new screening form, billing page. Check that the cross-app integrations work: screening widget on main dashboard, screening stats on BMS dashboard, screening tab on agent detail pages, screening history on contact dossier.

7. **TypeScript verification.** Run `npx tsc --noEmit` and fix any new errors introduced by Batches 1-3.

### Files likely involved
- All screening files (for bug fixes found during testing)
- `src/components/screening/wizard/*` — mobile fixes
- `src/app/(dashboard)/screening/*` — dashboard polish
- `src/app/screen/[token]/client.tsx` — wizard flow fixes

### Constraints
- Do NOT flip `SCREENING_USE_MOCKS=false` until Nathan confirms CRS credentials are ready
- Test with Plaid sandbox before production
- All TypeScript errors must be resolved before declaring done
- Mobile testing should cover the full wizard flow, not just individual pages

---

## Discovery Instructions for Claude Code

**Before writing ANY code, read these files and directories first:**

```
# Core screening module (understand current state)
src/lib/screening/                    # All 16 lib files
src/app/(dashboard)/screening/        # Dashboard pages + actions
src/app/screen/[token]/               # Wizard orchestrator
src/app/api/screen/[token]/           # Applicant API routes
src/app/api/screening/                # Agent API routes
src/app/api/webhooks/plaid/route.ts   # Existing webhook pattern
src/components/screening/             # All screening components

# IDV plan (detailed spec for Batch 2)
IDV_INTEGRATION_PLAN.md               # 599-line spec at project root

# Existing patterns to follow
src/lib/screening/notifications.ts    # Notification patterns (Resend + Twilio)
src/lib/screening/session.ts          # Session validation pattern
src/lib/screening/otp.ts              # OTP pattern
src/lib/rate-limit.ts                 # Rate limiting pattern
src/lib/encryption.ts                 # Encryption pattern
src/lib/webhook-idempotency.ts        # Webhook idempotency pattern
src/lib/supabase/middleware.ts        # Route whitelisting pattern
src/lib/screening/pipeline.ts         # Pipeline step pattern (Step 1-7)
src/lib/screening/scoring.ts          # Scoring engine (understand current weights)

# Build & deploy config
cloudbuild.yaml                       # GCP deployment config
Dockerfile                            # Build args
next.config.ts                        # Env var inlining
.env.local                            # Current env var state
prisma/schema.prisma                  # Current schema (look at screening models)

# Reference docs
CLAUDE.md                             # Full project context
SCREENING_BUILD_PLAN.md               # Original 8-phase build plan
CODEBASE_SUMMARY.md                   # Architecture overview
```

**After reading, propose a plan for the current batch before writing any code.** Include:
- Which files you'll create or modify
- What order you'll work in
- What you'll verify after each step
- Any questions or ambiguities you need resolved

## Pre-Requisites (Nathan's manual steps)

Before Claude Code starts each batch:

**Before Batch 1:**
- [x] ~~Provide live Stripe publishable key~~ — DONE, swapped in `.env.local`
- [x] ~~Confirm Cloud Run domain~~ — DONE: `https://vettdre-ru6vvo37qa-ue.a.run.app`
- [x] ~~Set Plaid webhook URL in .env.local~~ — DONE
- [x] ~~Update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in GCP Secret Manager~~ — DONE (version [3] created)
- [x] ~~Configure Plaid webhook URL in Plaid dashboard~~ — DONE (Identity verification status updated → `https://vettdre-ru6vvo37qa-ue.a.run.app/api/webhooks/plaid`)
- [ ] Create GCP secrets for missing env vars (PLAID_WEBHOOK_URL, PLAID_ENV, SCREENING_USE_MOCKS, etc.)

**Before Batch 2:**
- [x] ~~Create Didit workflow~~ — DONE: Custom KYC (ID Verify + Liveness + Face Match), ID `6601f41d-405a-4b01-98df-342f937b4188`
- [x] ~~Set DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, DIDIT_WORKFLOW_ID in .env.local~~ — DONE
- [x] ~~Configure Didit webhook URL~~ — DONE: `https://vettdre-ru6vvo37qa-ue.a.run.app/api/webhooks/idv/didit`
- [x] ~~Check if Stripe Identity is enabled~~ — DONE (enabled via Stripe dashboard, Fraud Prevention use case, no restricted business)
- [ ] Create GCP secrets for DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, DIDIT_WORKFLOW_ID, IDV_PROVIDER

**Before Batch 3:**
- [ ] No blockers — can proceed with mocks for credit provider abstraction

**Before Batch 4:**
- [ ] Ideally: CRS Credit API approved with credentials (for real credit testing). If not ready, testing proceeds in mock mode.
- [x] ~~Plaid webhook URL configured in Plaid dashboard~~ — DONE

**Ongoing (parallel to batches):**
- [ ] Book CRS Credit API sales call: calendly.com/crs-sales/initial-consultation-call or (866) 344-9443
- [ ] Ask CRS for: soft pull tenant screening pricing (single + tri-bureau), criminal + eviction add-on pricing, sandbox access, approval timeline
