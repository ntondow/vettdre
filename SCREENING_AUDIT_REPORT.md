# Screening Module Audit Report
Generated: 2026-04-04

## Summary
- CRITICAL: 2
- HIGH: 7
- MEDIUM: 8
- LOW: 5

---

## CRITICAL Issues

### [C1] Session validation bypassed when rate limiting is disabled
- **Files:** All 14 POST routes under `src/app/api/screen/[token]/` (personal-info, signature, submit-ssn, plaid-link, plaid-exchange, plaid-skip, documents, payment, idv-start, idv-status, otp-verify, and the GET handler in `route.ts`)
- **Issue:** `validateApplicantSession()` is called INSIDE the `if (isRateLimitEnabled())` block. When Upstash Redis is not configured (e.g., dev environment or misconfigured production), `isRateLimitEnabled()` returns false and session validation is skipped entirely. Any request with a valid token can access/modify applicant data without a session cookie.
- **Impact:** Complete authentication bypass. An attacker who knows or guesses a screening token can submit personal info, SSN, signatures, and make payments for any applicant.
- **Fix:** Move `validateApplicantSession()` outside the `isRateLimitEnabled()` guard. Session validation must be mandatory regardless of rate limiting config. Rate limiting and session validation are independent concerns.

### [C2] Status endpoint has no session validation or rate limiting
- **File:** `src/app/api/screen/[token]/status/route.ts` lines 4-62
- **Issue:** The GET endpoint returns application status, risk scores, and applicant names/emails with no session validation and no rate limiting. Only requires a valid token.
- **Impact:** Token enumeration — an attacker can probe tokens to discover applicant data. Returns PII (names, emails) and screening results.
- **Fix:** Add `validateApplicantSession()` and rate limiting to this endpoint.

---

## HIGH Issues

### [H1] Plaid token exchange has no mock guard
- **File:** `src/app/api/screen/[token]/plaid-exchange/route.ts` line 108
- **Issue:** When `SCREENING_USE_MOCKS=true`, the plaid-link route returns a fake token (`link-sandbox-mock-token-xxx`) and PlaidStep sends `public-sandbox-mock-token` to plaid-exchange. But plaid-exchange calls `exchangePublicToken()` which hits the real Plaid API — there's no mock check. The fake token will fail at Plaid's API.
- **Impact:** Mock-mode wizard breaks at the Plaid exchange step. Full E2E testing in mock mode is impossible without skipping Plaid.
- **Fix:** Add mock guard at top of plaid-exchange: when `SCREENING_USE_MOCKS=true`, return a fake access token and skip the real API call. Store a mock PlaidConnection record.

### [H2] Document analysis has no mock guard
- **File:** `src/lib/screening/document-analysis.ts`
- **Issue:** No `SCREENING_USE_MOCKS` check. In mock mode, the pipeline will call the real Anthropic Claude API for document analysis, consuming API credits and potentially failing if no API key is configured.
- **Impact:** Mock-mode pipeline makes real AI calls. Cost and reliability issue.
- **Fix:** Add mock guard returning synthetic analysis results when `SCREENING_USE_MOCKS=true`.

### [H3] Didit webhook signature verification silently skipped when secret is missing
- **File:** `src/lib/screening/idv-didit.ts` lines 154-190
- **Issue:** If `DIDIT_WEBHOOK_SECRET` env var is empty/unset, the entire signature verification block is skipped (`if (webhookSecret) { ... }`). The webhook body is parsed and processed without any authentication.
- **Impact:** In production without the secret configured, anyone can send fake IDV webhook events to approve identity verification for any applicant.
- **Fix:** Require `DIDIT_WEBHOOK_SECRET` — throw or reject if not configured (outside mock mode).

### [H4] File upload has no MIME type validation
- **File:** `src/app/api/screen/[token]/documents/route.ts` lines 125-143
- **Issue:** Only file size is validated (20MB max). No check on MIME type or file extension. The `file.type` from the client is passed directly to Supabase Storage as `contentType` with no server-side validation.
- **Impact:** Attackers can upload arbitrary files (executables, HTML with JS, etc.) to Supabase Storage. If storage serves files directly, this enables hosting malicious content.
- **Fix:** Validate `file.type` against `ALLOWED_FILE_TYPES` from constants.ts (`application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`). Optionally validate magic bytes.

### [H5] Personal info input not validated server-side
- **File:** `src/app/api/screen/[token]/personal-info/route.ts` lines 43-54
- **Issue:** The `formData` JSON object is accepted and stored as `personalInfo` without any field validation. No email format, phone format, date format, or field length checks.
- **Impact:** Malformed data flows downstream to credit pulls (wrong SSN format, bad dates), notifications (invalid emails), and PDF reports. Could cause pipeline failures.
- **Fix:** Validate required fields match expected formats (email RFC 5322, phone E.164, date YYYY-MM-DD, SSN 9 digits, zip 5 digits).

### [H6] PaymentStep always shows base tier fee
- **File:** `src/app/screen/[token]/client.tsx` line 491
- **Issue:** `<PaymentStep amount={BASE_SCREENING_FEE_CENTS} .../>` — always passes `$20.00` even for enhanced tier screenings where the applicant pays `$20.00` but the org pays `$49.00`. While the applicant fee is technically correct (base fee for applicant, enhanced surcharge to org), the messaging may be confusing since the `application.screeningTier` is "enhanced".
- **Impact:** Low-impact since the applicant fee IS base regardless of tier per constants.ts. But if fee structures change, this hardcoding will break.
- **Fix:** Pass `SCREENING_TIERS[application.screeningTier].applicantFee` to be future-proof.

### [H7] Double-submit race condition in wizard step handlers
- **File:** `src/app/screen/[token]/client.tsx` lines 178-190, 193-214, 227-254
- **Issue:** `setSaving(true)` is set AFTER the `applicantId` null check but BEFORE the async API call. React state updates are batched, so there's a brief window where a fast double-click can invoke the handler twice before `saving=true` takes effect and disables the button.
- **Impact:** Duplicate API calls. For personal-info and signature this is idempotent (upsert behavior). For payment, could potentially create duplicate Stripe sessions.
- **Fix:** Use a ref-based guard (`if (submittingRef.current) return; submittingRef.current = true;`) in addition to `setSaving`.

---

## MEDIUM Issues

### [M1] OTP send endpoint has no session validation
- **File:** `src/app/api/screen/[token]/otp-send/route.ts` lines 19-39
- **Issue:** Only IP-based rate limiting via `tokenAccessLimiter()`. No session validation. An attacker can trigger OTP emails to any applicant's email address by knowing the token.
- **Impact:** OTP spam to applicant inboxes. Limited by rate limiter (30 req/min per IP) but IPs are rotatable.
- **Fix:** Note: OTP-send is the first authenticated step (creates the session), so session validation can't be required here. Instead, add tighter rate limiting (3 OTP sends per token per 15 min) and CAPTCHA consideration.

### [M2] SSN Redis reference stored unencrypted in database
- **File:** `src/app/api/screen/[token]/submit-ssn/route.ts` lines 100-111
- **Issue:** The `ssnEncrypted` field stores `ref:{redisRefId}` — the reference ID is in plaintext. While the actual SSN is only in Redis (30-min TTL), a database breach reveals all active reference IDs.
- **Impact:** If both database AND Redis are compromised within the 30-min window, SSNs can be retrieved using the reference IDs.
- **Fix:** Encrypt the reference string before storing: `ssnEncrypted: encryptToken("ref:" + ssnRefId)`. Pipeline already handles decryptToken() on this field.

### [M3] HMAC signature length not validated before timingSafeEqual
- **File:** `src/lib/screening/idv-didit.ts` line 186
- **Issue:** `crypto.timingSafeEqual()` throws `TypeError` if buffers have different lengths. If the attacker sends a signature of different length than expected, the error is caught by the outer try-catch and returns `null` (treated as failed), but the TypeError could leak timing information through different error paths.
- **Impact:** Minor timing side-channel. Mitigated by the catch block returning null uniformly.
- **Fix:** Add length check before `timingSafeEqual`: `if (Buffer.from(signature).length !== Buffer.from(expected).length) return null;`

### [M4] SSN passthrough uses non-atomic fallback
- **File:** `src/lib/screening/ssn-passthrough.ts` lines 68-75
- **Issue:** When `redis.getdel()` fails, falls back to separate `get()` + `del()` calls. This creates a race window where two concurrent requests could both read the same SSN before either deletes it.
- **Impact:** In the fallback path only. Could allow duplicate credit pulls with the same SSN in extremely rare race conditions.
- **Fix:** Remove the non-atomic fallback. If `getdel()` fails, return an error rather than degrading to a racy path.

### [M5] Rate limiting keyed by token, not applicant
- **File:** All routes under `src/app/api/screen/[token]/` using `checkRateLimit(screeningApiLimiter(), token)`
- **Issue:** Multiple applicants in the same screening application share the same token and thus the same rate limit bucket. One applicant's rapid requests can exhaust the quota for another.
- **Impact:** Co-applicant/guarantor denied service due to primary applicant's request volume.
- **Fix:** Key rate limits by `${token}:${applicantId}` or by IP + token combination.

### [M6] OTP code logged to console in development
- **File:** `src/app/api/screen/[token]/otp-send/route.ts` lines 105-108
- **Issue:** When Resend is not configured, the actual OTP code and applicant email are logged: `console.log(\`[OTP] Code for ${email}: ${code}\`)`. If logs are aggregated or shared, OTP codes are exposed.
- **Impact:** Development/staging PII exposure. Not a production issue if Resend is configured.
- **Fix:** Log only that an OTP was sent, not the code itself: `console.log("[OTP] Code sent to", maskEmail(email))`.

### [M7] IP address stored in session but never validated
- **File:** `src/lib/screening/session.ts` lines 48-69, 97-139
- **Issue:** IP is captured when the session is created but `validateApplicantSession()` never checks if the requesting IP matches. A stolen session cookie can be used from any IP.
- **Impact:** Session hijacking is easier since there's no IP pinning. Mitigated by httpOnly + secure cookie flags.
- **Fix:** Optional: add soft IP validation (warn on mismatch, don't hard-block — mobile users change IPs frequently).

### [M8] Signature data not size-validated
- **File:** `src/app/api/screen/[token]/signature/route.ts` lines 44-53
- **Issue:** `signatureData` (base64 image data) is accepted without size validation. An attacker could submit a very large base64 string (e.g., 100MB), consuming storage and memory.
- **Impact:** Storage abuse and potential OOM on the server during processing.
- **Fix:** Validate that base64-decoded signature data is under a reasonable limit (e.g., 500KB).

---

## LOW Issues

### [L1] `as any` casts in screening code
- **Files:** 22 instances across screening code (pipeline.ts, actions.ts, page.tsx, webhook routes)
- **Issue:** Most casts are on Prisma JSON fields (`personalInfo as Record<string, any>`, `riskFactors as any`, `eventData as any`) and Prisma relation types. These hide potential type mismatches.
- **Impact:** Type safety reduced. Refactoring could introduce silent bugs.
- **Fix:** Create typed interfaces for JSON fields and use Prisma's `JsonValue` type assertions.

### [L2] Confirmation step polls indefinitely while status is "processing"
- **File:** `src/components/screening/wizard/ConfirmationStep.tsx` lines 18-26
- **Issue:** Polling interval runs every 5 seconds with no maximum duration. If the pipeline hangs or crashes without updating status, the client polls forever.
- **Impact:** Unnecessary API calls. Minor resource waste.
- **Fix:** Add a maximum poll count (e.g., 120 polls = 10 minutes) then show a "still processing" message with manual refresh option.

### [L3] PlaidStep loses link token on browser refresh
- **File:** `src/components/screening/wizard/PlaidStep.tsx` lines 24-35
- **Issue:** The link token is stored in sessionStorage but on browser refresh, the parent component remounts with `plaidLinkToken=null` (state reset). PlaidStep sees null and shows loading spinner. The sessionStorage value exists but isn't read back.
- **Impact:** User stuck on loading spinner after refresh on Plaid step. They can work around by going back.
- **Fix:** On mount, check sessionStorage for existing link token if prop is null.

### [L4] IdvStep timeout error message is vague
- **File:** `src/components/screening/wizard/IdvStep.tsx` lines 90-91
- **Issue:** After 3 minutes of polling with no result, shows "Verification is taking longer than expected." Doesn't suggest specific next steps.
- **Impact:** Minor UX confusion.
- **Fix:** Add actionable message: "The verification provider is taking longer than usual. You can try again or skip this step."

### [L5] Missing env vars in cloudbuild.yaml (hardcoded defaults exist)
- **Files:** `cloudbuild.yaml`, `src/lib/screening/constants.ts`, `src/lib/screening/credit-factory.ts`
- **Issue:** `BASE_SCREENING_FEE_CENTS`, `ENHANCED_SCREENING_FEE_CENTS`, and `CREDIT_PROVIDER` are not in cloudbuild.yaml runtime secrets. All three have hardcoded defaults in code (2000, 4900, "crs").
- **Impact:** Low — defaults are correct. But if fees need to change in production, there's no way to override without a code deploy.
- **Fix:** Add to cloudbuild.yaml for operational flexibility, or accept the defaults as permanent.

---

## Verification Notes

### Confirmed Working Correctly
- **Schema ↔ Code consistency:** All Prisma field names, enum values, and relation names match schema exactly. No mismatches found.
- **Pipeline idempotency:** Duplicate checks on credit reports (by bureau), transactions (by plaidTransactionId), document analyses (by documentId), and wellness profile (upsert by applicationId). Pipeline entry guard checks for "processing"/"complete" status.
- **Scoring weights:** Credit 30% + Financial Health 30% + Income 20% + Document Integrity 10% + Rent History 10% = 100%. IDV is a bonus modifier (-10 to +15), not redistributed. Final score clamped 0-100.
- **`latestIdv` scoping:** Correctly hoisted before step 5 try block with its own try/catch. Accessible in both step 5 (scoring) and step 6 (PDF generation).
- **SSN lifecycle:** SSN stored in Redis with 30-min TTL via `storeSSN()`. Retrieved and atomically deleted in pipeline via `retrieveAndDeleteSSN()`. Never persisted in database as plaintext.
- **FCRA adverse action:** All Section 615(a) required disclosures present — bureau names/addresses/phones, "bureau did not make the decision" statement, right to free report in 60 days, right to dispute, credit scores used.
- **CRM duplicate handling:** `linkOrCreateContact` checks by email first, then phone, only creates if no match.
- **Notification fire-and-forget:** All notification calls use `.catch()` — failures are logged but never crash the caller.
- **Plaid JWT verification:** Complete — algorithm check (ES256), body hash verification, 5-minute timestamp window, JWK fetch with 24h cache, ECDSA P-256 signature verification.
- **CSP headers:** Plaid (`cdn.plaid.com`, `*.plaid.com`), Stripe (`js.stripe.com`, `api.stripe.com`), Didit (`verification.didit.me`), Supabase all properly whitelisted in connect-src, frame-src, and script-src.
- **Middleware whitelisting:** `/screen/`, `/api/screen/`, `/api/webhooks/` all properly excluded from auth middleware.
- **TypeScript:** Only 1 error — pre-existing `eslint 2` type definition issue. Zero screening-related type errors.
- **Wizard step count:** 7 steps in WIZARD_STEPS. Landing, OTP, and Confirmation render outside WizardShell (no progress bar). Steps 1-6 show progress bar correctly. This is intentional design.
