# Identity Verification Integration Plan
## Didit (Primary) + Stripe Identity (Fallback)

**Date:** 2026-04-03
**Module:** Tenant Screening (`src/lib/screening/`, `src/app/screen/[token]/`)

---

## 1. Architecture Overview

### Provider Abstraction Pattern
A single `IdvProvider` interface abstracts both Didit and Stripe Identity behind a common contract. The active provider is selected via environment variable (`IDV_PROVIDER=didit|stripe`), with automatic failover if the primary returns a 5xx or times out.

```
┌─────────────────────────────────┐
│   Applicant Wizard (Step 2.5)   │  ← New step between Signature & Plaid
│   "Verify Your Identity"        │
└──────────────┬──────────────────┘
               │ POST /api/screen/[token]/idv-start
               ▼
┌─────────────────────────────────┐
│   idv-provider.ts               │  ← Provider abstraction
│   createSession() → URL/token   │
│   getResult() → IdvResult       │
│   handleWebhook() → status      │
└──────┬──────────────┬───────────┘
       │              │
  ┌────▼────┐   ┌─────▼─────┐
  │  Didit  │   │  Stripe   │
  │ (primary)│  │ (fallback) │
  └─────────┘   └───────────┘
```

### Where IDV Fits in the Wizard

Current wizard steps (from `constants.ts`):
```
1. Personal Info
2. Legal & E-Sign
3. Bank Account (Plaid)
4. Documents
5. Payment
6. Confirmation
```

New flow with IDV:
```
1. Personal Info
2. Legal & E-Sign
3. ✨ Identity Verification (NEW — redirect to Didit/Stripe, return via callback)
4. Bank Account (Plaid)
5. Documents
6. Payment
7. Confirmation
```

**Rationale:** IDV goes after e-sign (legal consent collected) and before Plaid (verify who they are before connecting bank accounts). This also means if IDV fails, the applicant hasn't wasted time on Plaid/documents.

---

## 2. Didit Integration Details

### Authentication
- **Method:** Static API key via `x-api-key` header
- **Env var:** `DIDIT_API_KEY`
- **Base URL:** `https://verification.didit.me/v3`

### Session Flow
1. **Create session:** `POST /v3/session/`
   - `workflow_id` — configured in Didit console (ID Verification + Passive Liveness + Face Match)
   - `vendor_data` — `applicationId:applicantId` for reconciliation
   - `callback` — `{APP_URL}/screen/{token}?idv_status={status}&idv_session={sessionId}`
   - `contact_details.email` — pre-fill from applicant data
   - `expected_details` — pre-fill first_name, last_name, date_of_birth from personalInfo
   - **Response:** `{ session_id, url, session_token, status }`

2. **Applicant redirected to Didit URL** — hosted verification flow (document scan + selfie + liveness)

3. **Webhook fires:** `POST /api/webhooks/idv/didit`
   - Events: `status.updated` (Approved / Declined / In Review / Abandoned)
   - Signature: `X-Signature-V2` HMAC-SHA256 with `DIDIT_WEBHOOK_SECRET`
   - Timestamp replay protection (300s window)

4. **Retrieve results:** `GET /v3/session/{sessionId}/decision/`
   - Returns: `id_verifications[]`, `liveness_checks[]`, `face_matches[]` with scores

### Rate Limits
- Free tier: 10 sessions/min, 500/month
- Paid: 600 sessions/min

### Didit Workflow Setup (Console)
Create a workflow in Didit Business Console with:
- ID Verification (document scan)
- Passive Liveness (selfie analysis)
- Face Match (document photo vs selfie)
- Store the `workflow_id` as env var: `DIDIT_WORKFLOW_ID`

---

## 3. Stripe Identity Integration Details

### Authentication
- Uses existing `STRIPE_SECRET_KEY` (already in env)
- **Package:** `stripe` (already installed)

### Session Flow
1. **Create session:** `stripe.identity.verificationSessions.create()`
   - `type: "document"` — ID document verification
   - `metadata: { applicationId, applicantId }`
   - `provided_details: { email }` — pre-fill
   - `return_url` — `{APP_URL}/screen/{token}?idv_status=complete&idv_provider=stripe`
   - **Response:** `{ id, client_secret, url, status }`

2. **Applicant completes on Stripe-hosted page** (document upload + selfie)

3. **Webhook fires:** `POST /api/webhooks/stripe` (existing route)
   - Events: `identity.verification_session.verified`, `identity.verification_session.requires_input`
   - Already have Stripe webhook signature verification

4. **Retrieve results:** `stripe.identity.verificationSessions.retrieve(sessionId)`
   - `verified_outputs`: first_name, last_name, date_of_birth, id_number, address
   - `last_error`: code + reason if failed

### Pricing
- $1.50/verification (vs Didit free tier)
- Only charged on successful verification

---

## 4. New Files

### `src/lib/screening/idv-provider.ts` — Provider Abstraction

```typescript
// ── Types ─────────────────────────────────────────────────────

export type IdvProviderType = "didit" | "stripe";

export type IdvSessionStatus =
  | "created"      // Session created, waiting for user
  | "in_progress"  // User started verification
  | "approved"     // Passed all checks
  | "declined"     // Failed verification
  | "in_review"    // Manual review needed
  | "abandoned"    // User left without completing
  | "expired";     // Session timed out

export interface IdvSessionInput {
  applicationId: string;
  applicantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;  // YYYY-MM-DD
  callbackUrl: string;   // Where to redirect after verification
}

export interface IdvSessionResult {
  provider: IdvProviderType;
  sessionId: string;       // Provider's session ID
  sessionUrl: string;      // URL to redirect applicant to
  sessionToken?: string;   // For SDK-based flows (future)
}

export interface IdvVerificationResult {
  provider: IdvProviderType;
  sessionId: string;
  status: IdvSessionStatus;

  // Document data (if approved)
  documentType?: string;          // passport, drivers_license, id_card
  documentNumber?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nationality?: string;
  expirationDate?: string;
  issuingCountry?: string;

  // Scores
  livenessScore?: number;         // 0-100
  faceMatchScore?: number;        // 0-100
  documentQualityScore?: number;  // 0-100

  // Flags
  warnings: string[];             // Any risk warnings from provider
  rawResponse?: unknown;          // Full provider response (encrypted at rest)

  // Timing
  completedAt?: Date;
}

export interface IdvWebhookResult {
  provider: IdvProviderType;
  sessionId: string;
  status: IdvSessionStatus;
  vendorData?: string;  // applicationId:applicantId
}

// ── Provider Interface ────────────────────────────────────────

export interface IdvProvider {
  readonly name: IdvProviderType;
  createSession(input: IdvSessionInput): Promise<IdvSessionResult>;
  getResult(sessionId: string): Promise<IdvVerificationResult>;
  parseWebhook(headers: Headers, body: string): Promise<IdvWebhookResult>;
}
```

### `src/lib/screening/idv-didit.ts` — Didit Implementation

Implements `IdvProvider`:
- `createSession()` → `POST /v3/session/` with workflow_id, vendor_data, callback, expected_details, contact_details
- `getResult()` → `GET /v3/session/{id}/decision/` → maps id_verifications[0], liveness_checks[0], face_matches[0] to IdvVerificationResult
- `parseWebhook()` → HMAC-SHA256 signature verification (X-Signature-V2 + X-Timestamp), extracts session_id + status from payload
- Status mapping: `Approved` → `approved`, `Declined` → `declined`, `In Review` → `in_review`, `Abandoned` → `abandoned`

### `src/lib/screening/idv-stripe.ts` — Stripe Identity Implementation

Implements `IdvProvider`:
- `createSession()` → `stripe.identity.verificationSessions.create({ type: "document", metadata, return_url, provided_details })`
- `getResult()` → `stripe.identity.verificationSessions.retrieve(id)` → maps verified_outputs to IdvVerificationResult
- `parseWebhook()` → Already handled by existing Stripe webhook route; this method extracts session ID + maps status
- Status mapping: `verified` → `approved`, `requires_input` → `declined`, `processing` → `in_progress`, `canceled` → `expired`

### `src/lib/screening/idv-factory.ts` — Provider Factory

```typescript
import type { IdvProvider, IdvProviderType } from "./idv-provider";

const IDV_PROVIDER = (process.env.IDV_PROVIDER || "didit") as IdvProviderType;

export function getIdvProvider(override?: IdvProviderType): IdvProvider {
  const provider = override || IDV_PROVIDER;

  switch (provider) {
    case "didit": {
      const { DiditProvider } = require("./idv-didit");
      return new DiditProvider();
    }
    case "stripe": {
      const { StripeIdentityProvider } = require("./idv-stripe");
      return new StripeIdentityProvider();
    }
    default:
      throw new Error(`Unknown IDV provider: ${provider}`);
  }
}

/**
 * Try primary provider, fall back to secondary on 5xx/timeout.
 */
export async function createIdvSessionWithFallback(
  input: Parameters<IdvProvider["createSession"]>[0]
) {
  const primary = getIdvProvider();
  try {
    return await primary.createSession(input);
  } catch (err) {
    const is5xx = err instanceof Error && "status" in err && (err as any).status >= 500;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (!is5xx && !isTimeout) throw err;

    console.warn(`IDV primary (${primary.name}) failed, falling back...`, err);
    const fallback = getIdvProvider(primary.name === "didit" ? "stripe" : "didit");
    return fallback.createSession(input);
  }
}
```

### `src/app/api/screen/[token]/idv-start/route.ts` — Start IDV Session

```
POST /api/screen/[token]/idv-start
Body: { applicantId: string }
Response: { sessionUrl: string, sessionId: string, provider: string }
```

- Validates session cookie + application status (must be in_progress)
- Validates applicant belongs to this application
- Checks if IDV already completed for this applicant (idempotent)
- Calls `createIdvSessionWithFallback()` with applicant data
- Creates `IdentityVerification` record in DB (status: "created")
- Logs ScreeningEvent (type: "idv_session_created")
- Returns session URL for redirect

### `src/app/api/webhooks/idv/didit/route.ts` — Didit Webhook

```
POST /api/webhooks/idv/didit
```

- Rate limited (idv_webhook: 30/min)
- HMAC-SHA256 signature verification (X-Signature-V2)
- Timestamp replay protection (300s)
- Idempotency via `isWebhookProcessed("didit", sessionId + status)`
- Looks up `IdentityVerification` by `providerSessionId`
- On `approved`: fetches full results via `getResult()`, updates record with scores + document data
- On `declined`/`abandoned`: updates status, stores warnings
- Logs ScreeningEvent
- Returns 200 immediately

### `src/app/api/webhooks/stripe/route.ts` — Addition to Existing

Add handler for `identity.verification_session.*` events inside the existing Stripe webhook:
- `identity.verification_session.verified` → update IdentityVerification status to "approved", fetch results
- `identity.verification_session.requires_input` → update to "declined"
- Keyed by `metadata.applicationId` + `metadata.applicantId`

### `src/components/screening/wizard/IdvStep.tsx` — New Wizard Component

- Shows explanation: "We need to verify your identity with a government-issued photo ID"
- Lists what they'll need (valid ID + camera)
- "Start Verification" button → calls `/api/screen/[token]/idv-start`
- On success: redirects to `sessionUrl` (Didit/Stripe hosted page)
- On return (callback URL): checks `idv_status` query param
  - `Approved` → auto-advances to Plaid step
  - `Declined` → shows error with retry option
  - `In Review` → shows "verification under review" message with option to continue (Plaid step, payment deferred)
- Polling fallback: if no callback, polls `/api/screen/[token]/idv-status` every 5s

### `src/app/api/screen/[token]/idv-status/route.ts` — Poll IDV Status

```
GET /api/screen/[token]/idv-status?applicantId=xxx
Response: { status: IdvSessionStatus, canProceed: boolean }
```

- Reads latest `IdentityVerification` record for the applicant
- `canProceed = status === "approved" || status === "in_review"` (in_review still allows proceeding — agent reviews later)

---

## 5. Prisma Schema Addition

```prisma
model IdentityVerification {
  id                  String          @id @default(uuid())
  applicantId         String          @map("applicant_id")
  applicationId       String          @map("application_id")

  // Provider info
  provider            String          // "didit" or "stripe"
  providerSessionId   String          @unique @map("provider_session_id")
  providerWorkflowId  String?         @map("provider_workflow_id")

  // Status
  status              String          @default("created") // created, in_progress, approved, declined, in_review, abandoned, expired

  // Document data (populated on approval)
  documentType        String?         @map("document_type")     // passport, drivers_license, id_card
  documentNumber      String?         @map("document_number")   // Encrypted at rest
  firstName           String?         @map("first_name")
  lastName            String?         @map("last_name")
  dateOfBirth         DateTime?       @map("date_of_birth")
  nationality         String?
  expirationDate      DateTime?       @map("expiration_date")
  issuingCountry      String?         @map("issuing_country")

  // Verification scores
  livenessScore       Float?          @map("liveness_score")    // 0-100
  faceMatchScore      Float?          @map("face_match_score")  // 0-100
  documentQuality     Float?          @map("document_quality")  // 0-100

  // Warnings & raw data
  warnings            Json            @default("[]")
  rawResponseEncrypted String?        @map("raw_response_encrypted") @db.Text // AES-256-GCM encrypted

  // Audit
  ipAddress           String?         @map("ip_address")
  userAgent           String?         @map("user_agent")

  // Timestamps
  startedAt           DateTime?       @map("started_at")
  completedAt         DateTime?       @map("completed_at")
  createdAt           DateTime        @default(now()) @map("created_at")

  // Relations
  applicant           ScreeningApplicant    @relation(fields: [applicantId], references: [id], onDelete: Cascade)
  application         ScreeningApplication  @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicantId])
  @@index([applicationId])
  @@index([providerSessionId])
  @@index([status])
  @@map("identity_verifications")
}
```

Add to `ScreeningApplicant`:
```prisma
identityVerifications IdentityVerification[]
```

Add to `ScreeningApplication`:
```prisma
identityVerifications IdentityVerification[]
```

---

## 6. Risk Score Integration

In `src/lib/screening/scoring.ts`, add IDV as a scoring component:

```typescript
// New component in computeRiskScore()
const idvScore = computeIdvComponent(input.identityVerification);

function computeIdvComponent(idv?: {
  status: string;
  livenessScore?: number;
  faceMatchScore?: number;
  documentQuality?: number;
}): number {
  if (!idv) return 0;  // No IDV data = no bonus/penalty
  if (idv.status === "declined") return -15;  // Major red flag
  if (idv.status !== "approved") return 0;

  let score = 10;  // Base bonus for verified identity
  if (idv.livenessScore && idv.livenessScore >= 90) score += 3;
  if (idv.faceMatchScore && idv.faceMatchScore >= 85) score += 3;
  if (idv.documentQuality && idv.documentQuality >= 80) score += 2;
  return Math.min(score, 18);  // Cap IDV bonus at 18 points
}
```

Update the overall score weights to accommodate IDV (max score stays 100):
- Credit: 30 → 28
- Financial Wellness: 25 → 23
- Document Fraud Detection: 20 → 18
- Employment/Income: 15 → 13
- **Identity Verification: 0 → 18 (NEW)**
- Red Flags: -10 to -30 (unchanged, penalty-only)

---

## 7. Pipeline Integration

In `src/lib/screening/pipeline.ts`, add Step 0.5 (before credit pull):

```typescript
// ── Step 0.5: Check Identity Verification ─────────────────
// IDV runs during the wizard (before payment), so by pipeline time
// we just need to fetch the result and factor it into scoring.

const idvRecord = await prisma.identityVerification.findFirst({
  where: { applicationId, status: "approved" },
  orderBy: { createdAt: "desc" },
});

// If IDV was declined but applicant somehow paid (edge case), flag it
if (!idvRecord) {
  const declinedIdv = await prisma.identityVerification.findFirst({
    where: { applicationId, status: "declined" },
  });
  if (declinedIdv) {
    errors.push("Identity verification was declined");
  }
}
```

Pass `idvRecord` data to `computeRiskScore()` in Step 5.

---

## 8. PDF Report Integration

In `src/lib/screening/pdf-report.ts`, add Identity Verification section:

- Shows: provider name, document type, verification status
- Liveness score, face match score, document quality
- Warnings (if any)
- "Verified Name" vs "Self-Reported Name" comparison
- Date of birth cross-reference with personal info

---

## 9. Dashboard Changes

### Detail Page (`screening/[id]/page.tsx`)

Add "Identity" sub-section to Overview tab:
- Verification status badge (green approved / red declined / yellow in review)
- Provider name (Didit / Stripe)
- Document type + issuing country
- Liveness / Face Match / Quality scores with visual bars
- Warnings list
- Name/DOB cross-reference with personal info (highlight mismatches in red)

### List Page

Add IDV status icon to the table row (shield-check for verified, shield-x for declined, shield-question for pending).

---

## 10. Environment Variables

```bash
# Identity Verification
IDV_PROVIDER=didit                      # "didit" or "stripe"
DIDIT_API_KEY=                          # Didit Business Console → API & Webhooks
DIDIT_WEBHOOK_SECRET=                   # Didit Business Console → API & Webhooks
DIDIT_WORKFLOW_ID=                      # Didit workflow with ID Verify + Liveness + Face Match

# Stripe Identity uses existing STRIPE_SECRET_KEY — no new vars needed
# Stripe webhook already configured — just add identity.verification_session.* events
```

Add to `cloudbuild.yaml`:
```yaml
# Runtime secrets
--set-secrets=DIDIT_API_KEY=DIDIT_API_KEY:latest,DIDIT_WEBHOOK_SECRET=DIDIT_WEBHOOK_SECRET:latest,DIDIT_WORKFLOW_ID=DIDIT_WORKFLOW_ID:latest,IDV_PROVIDER=IDV_PROVIDER:latest
```

Add to middleware.ts public routes:
```typescript
"/api/webhooks/idv",  // Didit webhook
```

---

## 11. New Files Summary

| File | Type | Description |
|------|------|-------------|
| `src/lib/screening/idv-provider.ts` | Types | Provider interface + shared types |
| `src/lib/screening/idv-didit.ts` | Provider | Didit API implementation |
| `src/lib/screening/idv-stripe.ts` | Provider | Stripe Identity implementation |
| `src/lib/screening/idv-factory.ts` | Factory | Provider selection + fallback logic |
| `src/app/api/screen/[token]/idv-start/route.ts` | API | Start IDV session |
| `src/app/api/screen/[token]/idv-status/route.ts` | API | Poll IDV status |
| `src/app/api/webhooks/idv/didit/route.ts` | Webhook | Didit status callbacks |
| `src/components/screening/wizard/IdvStep.tsx` | UI | Wizard step component |

## 12. Modified Files Summary

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `IdentityVerification` model + relations |
| `src/lib/screening/constants.ts` | Update `WIZARD_STEPS` (insert IDV at position 3, bump others) |
| `src/lib/screening/scoring.ts` | Add IDV scoring component, adjust weights |
| `src/lib/screening/pipeline.ts` | Add Step 0.5 (IDV check), pass to scoring |
| `src/lib/screening/pdf-report.ts` | Add IDV section to report |
| `src/app/screen/[token]/client.tsx` | Add `idv` step to state machine, handle callback params |
| `src/app/(dashboard)/screening/[id]/page.tsx` | Add IDV section to detail view |
| `src/app/(dashboard)/screening/page.tsx` | Add IDV status icon to list |
| `src/app/api/webhooks/stripe/route.ts` | Add identity.verification_session.* handlers |
| `src/lib/supabase/middleware.ts` | Whitelist `/api/webhooks/idv` |
| `cloudbuild.yaml` | Add DIDIT env vars to secrets |

---

## 13. Build Order

1. **Schema + Types** — Add Prisma model, run migration, create `idv-provider.ts`
2. **Providers** — Implement `idv-didit.ts`, `idv-stripe.ts`, `idv-factory.ts`
3. **API Routes** — Create `idv-start`, `idv-status`, Didit webhook
4. **Wizard** — Create `IdvStep.tsx`, update `client.tsx` state machine, update `constants.ts`
5. **Pipeline** — Add IDV check to pipeline, update scoring weights
6. **Dashboard** — Add IDV section to detail page, icon to list
7. **PDF** — Add IDV section to report
8. **Stripe Webhook** — Add identity event handlers to existing route
9. **Deploy** — Env vars, middleware whitelist, cloudbuild secrets
10. **Test** — End-to-end with Didit sandbox, verify fallback to Stripe

---

## 14. Testing Strategy

### Didit Sandbox
- Didit provides test API keys in the Business Console
- Use test document images from their documentation
- Webhook testing via "Try Webhook" button in console

### Stripe Identity Test Mode
- Stripe test mode already available via existing test keys
- Test verification sessions with Stripe's test documents
- Webhook events available in Stripe Dashboard event log

### Mock Mode
- Add `IDV_USE_MOCKS=true` env var for local dev
- Mock provider returns `approved` with fake scores after 2s delay
- Allows wizard development without external API calls
- Pattern matches existing `SCREENING_USE_MOCKS` approach

---

## 15. Risk Considerations

| Risk | Mitigation |
|------|-----------|
| Didit is early-stage (YC W26) | Stripe Identity as fully tested fallback; provider abstraction makes switching instant |
| Free tier limit (500/mo) | Monitor usage; Didit paid plans available; Stripe fallback unlimited at $1.50/ea |
| Webhook delivery failures | Polling fallback in wizard; Didit retries 2x; Stripe retries for 72 hours |
| IDV adds friction to wizard | Place after consent (committed users); skip for org-configured "trust" mode |
| Document number storage | Encrypt with AES-256-GCM (same as SSN); auto-redact in logs |
| BIPA/biometric liability | No biometric data stored by VettdRE — all processing on Didit/Stripe servers |
