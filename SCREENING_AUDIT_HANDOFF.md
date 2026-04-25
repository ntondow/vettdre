# Screening Module: Thorough Bug & Issue Audit — Claude Code Handoff

## Goal
Perform a comprehensive audit of the entire tenant screening module. Find bugs, logic errors, Prisma field mismatches, broken flows, security gaps, missing error handling, and UX issues. Do NOT fix anything yet — produce a prioritized findings report organized by severity (CRITICAL / HIGH / MEDIUM / LOW) with file paths, line numbers, and recommended fixes. Save the report to `SCREENING_AUDIT_REPORT.md` at the project root.

## Project
- **Repo:** VettdRE (Next.js 16, TypeScript, Prisma 5.22, Supabase)
- **Screening code:** `src/lib/screening/`, `src/app/(dashboard)/screening/`, `src/app/screen/[token]/`, `src/app/api/screen/[token]/`, `src/app/api/screening/`, `src/app/api/webhooks/plaid/`, `src/app/api/webhooks/idv/`, `src/components/screening/`

## Context
This module was built across 8 phases + 4 finish batches + security hardening, by multiple Claude Code sessions. Each session fixed bugs from the previous one, but the rapid iteration means there are likely remaining issues — especially at integration seams between phases. The module has NOT been manually tested end-to-end yet.

---

## Audit Streams

Run these 8 audit streams. For each, read every file listed, trace the logic end-to-end, and flag anything wrong.

### 1. Schema ↔ Code Consistency
**Goal:** Every Prisma field name, relation, and enum used in code must exactly match `prisma/schema.prisma`.

**Read:**
- `prisma/schema.prisma` — find ALL screening-related models: ScreeningApplication, ScreeningApplicant, ScreeningSignature, ScreeningPayment, ScreeningDocument, ScreeningEvent, CreditReport, PlaidConnection, FinancialTransaction, FinancialWellnessProfile, DocumentAnalysis, IdentityVerification, ProcessedWebhook
- Then grep every screening file for Prisma operations (`prisma.screeningApplication`, `prisma.screeningApplicant`, `.create(`, `.update(`, `.findFirst(`, `.findUnique(`, `.findMany(`, `.upsert(`, `.updateMany(`, `.delete(`) and verify field names match the schema exactly.

**Common issues from prior audits:** `role: "primary"` vs `"main"`, `applicationId` vs `screeningApplicationId`, `tier` vs `screeningTier`, `riskScore` vs `vettdreRiskScore`, `formData` vs `personalInfo`, `fileUrl` vs `filePath`, `amount` vs `amountCents`.

**Files to check:**
```
prisma/schema.prisma
src/lib/screening/pipeline.ts
src/lib/screening/integration.ts
src/lib/screening/scoring.ts
src/lib/screening/wellness.ts
src/lib/screening/adverse-action.ts
src/lib/screening/notifications.ts
src/lib/screening/pdf-report.ts
src/app/(dashboard)/screening/actions.ts
src/app/(dashboard)/screening/[id]/page.tsx
src/app/(dashboard)/screening/new/page.tsx
src/app/(dashboard)/screening/page.tsx
src/app/api/screen/[token]/route.ts
src/app/api/screen/[token]/personal-info/route.ts
src/app/api/screen/[token]/signature/route.ts
src/app/api/screen/[token]/plaid-link/route.ts
src/app/api/screen/[token]/plaid-exchange/route.ts
src/app/api/screen/[token]/plaid-skip/route.ts
src/app/api/screen/[token]/documents/route.ts
src/app/api/screen/[token]/payment/route.ts
src/app/api/screen/[token]/status/route.ts
src/app/api/screen/[token]/submit-ssn/route.ts
src/app/api/screen/[token]/idv-start/route.ts
src/app/api/screen/[token]/idv-status/route.ts
src/app/api/webhooks/plaid/route.ts
src/app/api/webhooks/idv/didit/route.ts
src/app/api/screening/report/[applicationId]/route.ts
src/app/api/screening/billing/route.ts
src/app/api/screening/billing/setup-intent/route.ts
src/app/api/screening/billing/payment-method/route.ts
```

### 2. Wizard Flow (Applicant Side)
**Goal:** Trace the complete applicant journey from invite link to confirmation. Every step transition, API call, error state, and edge case.

**Read:**
```
src/app/screen/[token]/page.tsx
src/app/screen/[token]/client.tsx
src/components/screening/wizard/WizardShell.tsx
src/components/screening/wizard/LandingView.tsx
src/components/screening/wizard/PersonalInfoStep.tsx
src/components/screening/wizard/SignatureStep.tsx
src/components/screening/wizard/IdvStep.tsx
src/components/screening/wizard/PlaidStep.tsx
src/components/screening/wizard/DocumentUploadStep.tsx
src/components/screening/wizard/PaymentStep.tsx
src/components/screening/wizard/ConfirmationStep.tsx
src/lib/screening/constants.ts
```

**Check for:**
- Step order in client.tsx matches what each step component expects
- `currentStep` values written by API routes match what client.tsx reads to determine which step to show
- Every step's `onNext` / `onComplete` callback correctly transitions to the next step
- Error handling: what happens if an API call fails at each step? Does the user see a useful error or a blank screen?
- Back navigation: can the user go back? Should they be able to? What happens to already-submitted data?
- Browser refresh: if the user refreshes mid-wizard, do they resume at the correct step or restart?
- Stripe payment return: after Stripe redirect, does the wizard correctly detect `?session_id=` and advance?
- IDV return: after Didit redirect, does IdvStep correctly detect the return and poll for results?
- Plaid Link: in mock mode, does the fake token flow work? In real mode, does `usePlaidLink` get configured correctly?
- Mobile: are there any viewport issues in the wizard components (fixed positioning, overflow, keyboard overlap)?
- Double-submit prevention: can the user click "Next" twice quickly and cause duplicate API calls?
- Token expiration: what happens if the applicant opens an expired or already-completed screening link?

### 3. Pipeline (Backend Processing)
**Goal:** Trace the full screening pipeline from trigger to completion. Every step must be idempotent, handle errors gracefully, and use correct field names.

**Read:**
```
src/lib/screening/pipeline.ts
src/lib/screening/scoring.ts
src/lib/screening/wellness.ts
src/lib/screening/document-analysis.ts
src/lib/screening/plaid.ts
src/lib/screening/crs.ts
src/lib/screening/crs-mock.ts
src/lib/screening/credit-crs.ts
src/lib/screening/credit-factory.ts
src/lib/screening/credit-provider.ts
src/lib/screening/idv-provider.ts
src/lib/screening/idv-didit.ts
src/lib/screening/idv-stripe.ts
src/lib/screening/idv-factory.ts
src/lib/screening/integration.ts
src/lib/screening/ssn-passthrough.ts
src/lib/screening/pdf-report.ts
```

**Check for:**
- Pipeline idempotency: if `runScreeningPipeline()` is called twice for the same application, does it skip already-completed steps or create duplicates?
- Error propagation: if Step 3 fails, does it correctly mark the application as failed and notify the agent? Or does it silently continue?
- Step ordering: each step should depend on prior steps' data. Verify the data actually exists when each step tries to read it.
- Enhanced tier charge (Step 0): if the org has no payment method, does it correctly downgrade to base tier?
- Credit pull (Step 1): does the mock provider return data in the same shape as the real CRS provider? Does the credit factory correctly select mock vs real?
- Plaid data (Step 2): are account balances and transactions correctly parsed from Plaid's response format?
- Document analysis (Step 3): is the AI prompt safe from injection via uploaded document content? Does it handle empty/corrupt files?
- Scoring (Step 5): do all score components add up correctly? Does the IDV bonus actually get applied? What if IDV data is missing?
- PDF generation (Step 6): does it handle missing data gracefully (no credit report, no Plaid, no IDV)?
- CRM integration (Step 7): does `linkOrCreateContact` handle duplicate emails? Does it create Activities correctly?
- Notification (Step 7): does the agent actually receive a notification on completion? On failure?

### 4. Security & Data Protection
**Goal:** Verify all security measures are actually working — rate limiting, session validation, SSN handling, encryption, CSRF, webhook verification.

**Read:**
```
src/lib/screening/session.ts
src/lib/screening/otp.ts
src/lib/screening/ssn-passthrough.ts
src/lib/screening/pii-redaction.ts
src/lib/rate-limit.ts
src/lib/encryption.ts
src/lib/webhook-idempotency.ts
src/lib/supabase/middleware.ts
src/app/api/webhooks/plaid/route.ts
src/app/api/webhooks/idv/didit/route.ts
src/app/api/screen/[token]/submit-ssn/route.ts
```

**Check for:**
- Session validation: are ALL applicant POST routes checking the session cookie? Or are some unprotected?
- Rate limiting: are all rate limiters actually called before processing? Are any routes missing rate limits?
- SSN handling: is SSN truly never written to the database? Trace the full SSN lifecycle from submit-ssn through pipeline to credit pull.
- Webhook signature verification: is Plaid JWT verification actually running (not bypassed)? Is Didit HMAC verification correct?
- Webhook idempotency: are both webhooks checking for duplicate events before processing?
- Token validation: what happens if someone sends requests with a valid token but for a different applicant?
- File upload security: are uploaded documents validated for file type and size? Can someone upload a 1GB file?
- PII redaction: is the redaction actually applied to AI outputs? Could PII leak into logs?
- Middleware whitelisting: are all public screening routes (`/screen/*`, `/api/screen/*`, `/api/webhooks/*`) correctly whitelisted?
- CORS: can arbitrary origins hit the screening API routes?
- Input validation: are all user inputs (personal info fields, SSN, phone, email) validated and sanitized?

### 5. Admin Dashboard (Agent Side)
**Goal:** Verify the agent-facing pages work correctly — list, detail, new screening, billing, cross-app widgets.

**Read:**
```
src/app/(dashboard)/screening/page.tsx
src/app/(dashboard)/screening/[id]/page.tsx
src/app/(dashboard)/screening/new/page.tsx
src/app/(dashboard)/screening/actions.ts
src/app/(dashboard)/screening/billing/page.tsx
src/app/api/screening/billing/route.ts
src/app/api/screening/billing/setup-intent/route.ts
src/app/api/screening/billing/payment-method/route.ts
src/app/api/screening/report/[applicationId]/route.ts
src/lib/screening/integration.ts (getScreeningDashboardStats, getScreeningBmsStats)
```

**Check for:**
- Permission checks: are all server actions checking user role/org/permissions before returning data?
- Data leakage: could Agent A see Agent B's screenings from a different org?
- Decision flow: when agent clicks Approve/Decline, does the UI update immediately? Does the adverse action fire on decline?
- PDF download: does the signed URL generation work? What if the PDF hasn't been generated yet?
- Billing page: does the Stripe Elements integration load correctly? Can the org add/remove a payment method?
- Stats accuracy: do the dashboard stat queries return correct counts?
- Pagination: does the list page handle 100+ screenings correctly?
- Empty states: what does each page show when there are zero screenings?
- New screening form: are all validation rules enforced (required fields, email format, phone format)?
- Wizard progress display: does the admin detail page correctly show which step each applicant is on?

### 6. Notifications & Email
**Goal:** Verify all notification paths actually work and contain correct content.

**Read:**
```
src/lib/screening/notifications.ts
src/lib/screening/adverse-action.ts
```

**Check for:**
- Are all notification functions actually called from the right places? (invite, completion, approval, decline/adverse action, failure)
- Do email templates have correct merge fields (applicant name, property address, etc.)?
- Does adverse action notice include ALL FCRA-required disclosures?
- Are Twilio SMS notifications working (correct phone number lookup, message length limits)?
- Are push notifications working (correct web push payload)?
- Fire-and-forget: do notification failures silently log or do they crash the caller?

### 7. TypeScript & Build
**Goal:** Catch type errors, unused imports, and build issues.

**Run:** `npx tsc --noEmit 2>&1 | grep -i screening` to find all screening-related type errors.

**Check for:**
- Any `as any` casts that hide real type issues
- Unused imports
- Functions that accept `any` when they should have typed parameters
- Missing null checks on optional fields
- Prisma types that don't match runtime data shapes (especially JSON fields like `personalInfo`, `accounts`, `warnings`)

### 8. Environment & Deployment
**Goal:** Verify all env vars, secrets, and deployment config are correct.

**Read:**
```
cloudbuild.yaml
Dockerfile
next.config.ts
.env.local (just the screening-related vars)
```

**Check for:**
- Every env var referenced in screening code exists in cloudbuild.yaml runtime secrets
- Build-time vs runtime: are NEXT_PUBLIC vars in the build args section?
- CSP headers in next.config.ts: do they allow Didit's hosted verification domain? Plaid Link's domain? Stripe Elements?
- Middleware: are webhook routes excluded from auth AND from rate limiting middleware?
- Mock mode: when `SCREENING_USE_MOCKS=true`, does EVERY external call get intercepted? Or could a real API call slip through?

---

## Output Format

Save findings to `SCREENING_AUDIT_REPORT.md` at the project root. Use this format:

```markdown
# Screening Module Audit Report
Generated: [date]

## Summary
- CRITICAL: [count]
- HIGH: [count]
- MEDIUM: [count]
- LOW: [count]

## CRITICAL Issues
### [C1] [Short title]
- **File:** `path/to/file.ts` line [N]
- **Issue:** [What's wrong]
- **Impact:** [What breaks]
- **Fix:** [Recommended fix]

## HIGH Issues
### [H1] ...

## MEDIUM Issues
### [M1] ...

## LOW Issues
### [L1] ...
```

## Constraints
- **READ ONLY.** Do not modify any files. This is an audit, not a fix session.
- Read every file listed above — do not skip files or skim.
- For schema checks, compare field-by-field against the actual Prisma schema, not from memory.
- Run `npx tsc --noEmit` to catch type errors programmatically.
- Check for issues at integration boundaries (where one phase's code calls another phase's code).
- Flag any TODO/FIXME/HACK comments that indicate known unfinished work.
- If you find something that MIGHT be a bug but you're not sure, include it as LOW with a note to verify.

## Discovery Instructions

**Before starting the audit, read these files first to understand the full context:**

```
CLAUDE.md                              # Full project context + schema reference
SCREENING_BUILD_PLAN.md                # Original build plan (understand intent)
SCREENING_FINISH_HANDOFF.md            # Finish batches (understand recent changes)
IDV_INTEGRATION_PLAN.md                # IDV spec (understand intended IDV behavior)
prisma/schema.prisma                   # Ground truth for all field names
src/lib/screening/constants.ts         # Field configs, step definitions, thresholds
```

**Then proceed through the 8 audit streams in order.** Propose your audit plan before starting — list which files you'll read in what order.
