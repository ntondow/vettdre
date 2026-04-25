# VettdRE — Plaid Production Access: Complete Security Package (v3)

**Company:** VettdRE, Inc.
**Product:** VettdRE Screening — Tenant Screening Platform
**Prepared by:** Nathan (Director of Innovation / Founder)
**Date:** April 2026
**Version:** 3.0 — Verified against deployed codebase (April 3, 2026)

---

# PART A: SECURITY QUESTIONNAIRE ANSWERS (v6)

---

## PART ONE

### Question 1: Hosting (inf_sec_hosting)
**What is your organization's strategy for hosting the server-side components of your application?**

**Select:** Cloud hosting - We host all server-side components of our application using off-premise cloud infrastructure

**Comment field:**
VettdRE's server-side infrastructure runs entirely on Google Cloud Platform. Application containers are deployed via Google Cloud Run (fully managed serverless with gVisor sandboxing), the database is hosted on Supabase (managed PostgreSQL on AWS with Point-in-Time Recovery enabled), file storage uses Supabase Storage with server-side AES-256 encryption, ephemeral data (sessions, OTP codes, rate limiting) is managed via Upstash Redis (serverless, encrypted at rest and in transit), and nightly backups are stored in Google Cloud Storage with 90-day lifecycle policies and versioning. No on-premise infrastructure is used.

---

### Question 2: Governance (inf_sec_governance)
**Does your organization have a documented information security policy and procedures that have been operationalized to identify, mitigate, and monitor information security risks relevant to your business?**

**Select:** Yes - We have a documented policy, procedures, and an operational information security program that is continuously matured

**Attach:** Document 1 — Information Security Policy (see Part B)

---

### Question 3: Asset Management (inf_sec_endpoint_visibility)
**Does your organization have a mechanism for discovering and maintaining visibility into all network endpoints connected to your corporate and production networks?**

**Select:** Yes - We have tools and processes that enable us to discover and maintain continuous visibility into all of our network endpoints

**Comment field:**
VettdRE uses Google Cloud Console for full visibility into all cloud production assets (Cloud Run services, service accounts, IAM bindings, Cloud Build triggers, Artifact Registry images). Supabase Dashboard provides visibility into database connections, API usage, and active sessions. Upstash Console provides visibility into Redis connections and usage patterns. All developer machines are company-owned Apple Silicon MacBooks with macOS system integrity protection enabled. As a small engineering team, the total endpoint inventory is minimal and fully tracked via a maintained asset register reviewed quarterly.

---

### Question 4: Vulnerability Management (inf_sec_vulnerability_management)
**Do you actively perform vulnerability scans against your employee and contractor machines and production assets to detect and patch vulnerabilities?**

**Select:** Yes - We actively perform vulnerability scans against all employee and contractor machines, production assets, and patch vulnerabilities using a defined SLA

**Comment field:**
Production containers are built from official Node.js base images and scanned via Google Artifact Registry's built-in vulnerability scanning on every deployment. npm audit is run as part of the CI/CD pipeline, and builds fail if critical vulnerabilities are detected. Dependency updates are monitored via GitHub Dependabot. macOS automatic security updates are enabled on all developer machines. Patching SLA: critical vulnerabilities within 48 hours, high within 7 days, medium within 30 days.

---

### Question 5: Malicious Code Protection (inf_sec_malicious_code)
**Do you use endpoint security tools and agents to protect employee and contractor machines and production assets against malicious code?**

**Select:** Yes - We protect all employee and contractor machines, and all production assets (e.g. mutable server instances) against malicious code (e.g. viruses and malware)

**Comment field:**
Developer machines run macOS with built-in XProtect, Gatekeeper, and System Integrity Protection (SIP) enabled. Production assets run on Google Cloud Run, which uses gVisor container sandboxing — containers are ephemeral, use read-only filesystems, and are isolated from each other. No persistent mutable server instances exist in the production environment. All uploaded documents from applicants are processed in isolated serverless function invocations and scanned for malicious content before AI analysis.

---

### Question 6: Personal Devices / BYOD (inf_sec_personal_devices)
**Does your organization allow employees and contractors to use their personal devices (BYOD) for carrying out their job responsibilities?**

**Select:** No - We do NOT allow employee or contractor personal devices to be used for carrying out their job responsibilities

**Comment field:**
All development is performed on company-owned Apple Silicon MacBooks. No personal devices have access to production environments, source code repositories, or any API credentials (Plaid, CRS, Stripe, Supabase, Upstash).

---

### Question 7: Access Controls (inf_sec_access_governance)
**Does your organization have a defined process for controlling access to production assets and data?**

**Select:** Yes - We have defined processes for requesting, granting, reviewing, approving, and revoking access to production assets and data

**Attach:** Document 5 — Access Control Policy (see Part B)

**Comment field:**
VettdRE enforces least-privilege access at the infrastructure and application layers. The application uses two distinct database clients: an authenticated client (Supabase anon key with user JWT) for agent-facing routes where Row-Level Security policies are enforced at the database level, and a service role client used only for server-to-server internal processing routes and webhook handlers. This architectural separation ensures that even a compromised user session cannot escalate beyond the user's RLS-permitted data scope. All API keys and secrets are stored in Google Cloud Secret Manager or Cloud Run environment variables — never in source code or version control.

---

### Question 8: Authentication (inf_sec_access_authentication)
**Has your organization deployed strong factors of authentication (e.g. 2-factor authentication) for all critical assets?**

**Select:** Yes - We have deployed strong factors of authentication (e.g. 2-factor authentication) for all production assets

**Comment field:**
2FA/MFA is enforced on all critical systems: Google Cloud Platform (hardware key or Google Authenticator), Supabase Dashboard (TOTP), GitHub (hardware key or authenticator app), Stripe Dashboard (TOTP), Plaid Dashboard (TOTP), Twilio Console (TOTP), Anthropic Console, and Upstash Console. SSH access to production infrastructure is not applicable — Cloud Run is fully managed with no SSH access. All production API keys are injected as Cloud Run environment variables and are not accessible to any interactive user session.

---

## PART TWO

### Question 9: Change Controls (inf_sec_change_governance)
**Does your organization have a defined process for building and releasing code changes to production assets?**

**Select:** Yes - We have a defined process for building and releasing code changes to production assets

**Attach:** Document 4 — Change Management Process (see Part B)

---

### Question 10: Testing (inf_sec_change_testing)
**Does your organization enforce the testing of code changes before they're deployed to production assets?**

**Select:** Yes - We logically enforce the testing of code changes before they're deployed to production assets

**Comment field:**
All code changes are tested in Plaid's Sandbox environment before any production deployment. The CI/CD pipeline (Google Cloud Build) runs automated tests, TypeScript type checking (tsc --noEmit), and ESLint security rules before building the production container. Plaid Link integration testing follows Plaid's recommended OAuth test cases. Stripe webhooks are tested via Stripe CLI's local webhook forwarding before production deployment. Database migrations are tested against a Supabase staging project before production application. Builds fail automatically if any test, type check, or lint step fails.

---

### Question 11: Code Reviews (inf_sec_change_code_reviews)
**Does your organization logically enforce the review and approval of code changes before they are deployed to production assets?**

**Select:** Yes - We logically enforce the review and approval of code changes before they are deployed to production assets

**Comment field:**
All production deployments are initiated via the main branch of the Git repository. Code changes go through review before merging. The production deployment pipeline only executes from the main branch — direct pushes to main are not permitted. Deployment requires explicit confirmation via the Cloud Build trigger. Security-sensitive changes (authentication, encryption, API integrations, PII handling, database migrations) receive additional scrutiny with specific attention to data exposure risks.

---

### Question 12: Encryption in Transit (inf_sec_encrypt_in_transit)
**Does your organization encrypt data-in-transit between clients and servers using TLS 1.2 or better?**

**Select:** Yes - We use TLS 1.2 or better for all client-server communications

**Comment field:**
All client-server communications use TLS 1.3. Google Cloud Run enforces HTTPS for all inbound traffic with Google-managed TLS certificates and HSTS headers (Strict-Transport-Security: max-age=63072000; includeSubDomains; preload). Supabase connections use TLS 1.2+ for all database and API communications. Upstash Redis connections are encrypted in transit via TLS. All third-party API calls (Plaid, CRS, Stripe, Twilio, Anthropic) are made over HTTPS/TLS 1.2+. The application sets Referrer-Policy: no-referrer to prevent sensitive URL tokens from leaking to third-party domains via HTTP referrer headers.

---

### Question 13: Encryption at Rest (inf_sec_encrypt_at_rest)
**Does your organization encrypt consumer data you receive from the Plaid API data-at-rest?**

**Select:** Yes - We encrypt consumer data retrieved from the Plaid API using object/column level encryption, and volume-level encryption

**Comment field:**
Consumer data from Plaid is protected at multiple levels. Volume-level: Supabase encrypts all data at rest using AES-256 on the underlying AWS infrastructure. Column-level: Plaid access tokens are additionally encrypted at the application layer using AES-256-GCM with scrypt key derivation (via a dedicated TOKEN_ENCRYPTION_KEY stored in Google Secret Manager) and are deleted from the database immediately after the transaction sync is complete and the Plaid Item is removed. Raw transaction data is stored in encrypted Supabase tables with Row-Level Security policies enforcing access controls at the database level. Critically, Social Security Numbers are NEVER stored at rest in any database — SSNs are held only in ephemeral server-side memory (Upstash Redis with a 30-minute automatic TTL) during the credit bureau API call and are deleted from Redis immediately after the call completes. Only the last 4 digits of the SSN are persisted for applicant identification on the screening report.

---

### Question 14: Audit Trails (inf_sec_audit_trail)
**Does your organization maintain a robust audit trail and logs for all material events that occur in your production assets?**

**Select:** Yes - We maintain robust audit trails and logs for all material events that occur in our production assets

**Comment field:**
VettdRE maintains a dedicated application_events audit table that logs every material event with timestamps, actor identification, IP addresses, and event metadata. Logged events include: application creation, invite dispatch, applicant wizard step completion, Plaid bank connections and disconnections, document uploads, e-signature captures, payment events (initiated, succeeded, failed), credit pull initiation and completion, risk score computation, PDF generation, PDF downloads (with agent identity and IP), and all application status changes. A separate processed_webhooks table provides an idempotency-checked audit trail of all incoming webhook events from Stripe, Plaid, and CRS — preventing duplicate processing and providing a complete record of all external events received. Google Cloud Run provides infrastructure-level logging via Cloud Logging. Supabase provides database query audit logs. Rate limit violations are logged for security monitoring. All audit logs are retained for a minimum of 7 years per FCRA requirements and backed up nightly to Google Cloud Storage.

---

### Question 15: Monitoring & Alerting (inf_sec_monitoring_alerting)
**Does your organization have monitoring and alerting mechanisms for real-time detection and triage of events that may negatively impact the security of production assets?**

**Select:** Yes - We have monitoring and alerting mechanisms for real-time detection and triage of events that may negatively impact the security of production assets

**Comment field:**
Multiple layers of monitoring and alerting are deployed. Infrastructure: Google Cloud Monitoring provides real-time alerting on Cloud Run service health, error rates, latency, and resource utilization. Database: Supabase Dashboard provides real-time monitoring for connection limits, query performance, and storage thresholds. Application: Custom alerting is configured for failed credit pulls, Plaid connection errors, Stripe payment failures, webhook signature verification failures, and unusual screening volume patterns. Security: Rate limit violations across all sensitive endpoints (OTP, authentication, document upload, payment) are logged and trigger alerts when thresholds indicate potential brute-force or abuse attacks. Session validation failures and invalid access token attempts are monitored for unauthorized access patterns. All alerts are delivered via email and, for critical (P1) events, via SMS through Twilio.

---

## PART THREE

### Question 16: Incident Management (inf_sec_incident_management)
**Does your organization have a defined process for detecting, triaging, and resolving security impacting incidents?**

**Select:** Yes - We have a defined process for detecting, triaging, and resolving security impacting incidents

**Attach:** Document 3 — Incident Response Plan (see Part B)

---

### Question 17: Network Segmentation (inf_sec_network_segmentation)
**Are your organization's cloud and on-prem production networks segmented based on the sensitivity of assets in those networks, and their needed exposure to the open internet?**

**Select:** Yes - Our cloud and on-prem production networks are segmented based on the sensitivity of assets in each sub-network, and their needed exposure to the open internet

**Comment field:**
VettdRE's architecture enforces network segmentation by design across multiple tiers. Public tier: The Next.js application on Cloud Run accepts HTTPS traffic with strict Content Security Policy headers whitelisting only Plaid, Stripe, Supabase, and VettdRE domains. Application tier: API routes are separated into authenticated agent routes (RLS-enforced via user JWT), token-gated applicant routes (session-validated via httpOnly cookies), and internal processing routes (server-side only, not publicly routable). Data tier: The Supabase database is not directly accessible from the public internet — it is accessed only through Supabase's managed API layer with Row-Level Security and service role authentication. Sensitive data tier: Plaid access tokens are encrypted at the application layer using AES-256-GCM with a dedicated encryption key managed in Google Secret Manager, and ephemeral SSN data is isolated in Upstash Redis, both with separate key management from the primary database. Webhook endpoints are signature-verified and reject unsigned requests. Rate limiting is enforced at the middleware level before any request reaches the application logic.

---

### Question 18: Security Awareness Training (inf_sec_awareness_training)
**Does your organization train all employees and contractors on security awareness?**

**Select:** Yes - We train all employees and contractors on security awareness during on-boarding and on an ongoing basis

**Comment field:**
All team members complete security awareness onboarding covering: secure coding practices (with emphasis on PII handling, encryption, and injection prevention), credential management (no secrets in code, mandatory use of secret managers), social engineering awareness, incident reporting procedures, FCRA compliance requirements for handling consumer credit data, and Plaid's Developer Policy and data handling requirements. Ongoing training includes quarterly review of the information security policy, updates to the threat landscape, and review of any security incidents or near-misses. The security hardening posture is documented and maintained as a living engineering reference.

---

### Question 19: Vendor Management (inf_sec_vendor_management)
**Does your organization have a defined vendor intake and monitoring process that is communicated to the company, and is enforced by technical and administrative controls?**

**Select:** Yes - We have a defined vendor intake and monitoring process that is communicated to the company, and is enforced by technical and administrative controls

**Attach:** Document 6 — Vendor Management Policy (see Part B)

---

### Question 20: Independent Testing (inf_sec_independent_testing)
**Does your organization test the overall effectiveness of your information security program using independent auditors, and perform pen-testing using independent pen-testers?**

**Select:** Other - Please see comments

**Comment field:**
VettdRE leverages the independent audits and certifications of its infrastructure and data providers. Google Cloud Platform maintains SOC 2 Type II, ISO 27001, and undergoes continuous independent security auditing. Supabase maintains SOC 2 Type II certification. Plaid maintains SOC 2 Type II and ISO 27001 certifications. Stripe is PCI DSS Level 1 certified. Upstash maintains SOC 2 Type II certification. VettdRE plans to engage independent penetration testers prior to production launch and annually thereafter. Application-level security testing is performed continuously using automated vulnerability scanning (Google Artifact Registry container scanning, npm audit, Dependabot) and Content Security Policy enforcement in the CI/CD pipeline.

---

### Question 21: HR Screening (inf_sec_hr_screening)
**Does your organization perform background checks on all employees and contractors?**

**Select:** Yes - Background checks are performed on all employees and contractors prior to being offered employment

**Comment field:**
Background checks are performed on all employees and contractors who will have access to production systems, consumer data, or API credentials (Plaid, CRS, Supabase, Stripe) prior to granting access. As VettdRE operates a tenant screening platform with direct access to credit bureau data and bank account data, all personnel with production access are screened for criminal history, identity verification, and employment history verification.

---

### Question 22: Consumer Consent (privacy_consumer_consent)
**Does your organization obtain consent from consumers for your organization's collection, processing, and storing of their data?**

**Select:** Yes - We obtain consent directly from consumers

**Comment field:**
VettdRE obtains explicit, affirmative consent from consumers (rental applicants) at multiple points during the application process. Before any data collection begins, applicants review and e-sign the following documents: Credit Pull Consent (authorizing VettdRE to access their credit report), FCRA Disclosure (informing applicants of their rights under the Fair Credit Reporting Act), Privacy Disclosure (detailing what data is collected, how it is used, retention periods, and how it is deleted), Screening Terms (full terms of service), and Fair Housing Notice. Each e-signature is captured with a tamper-proof SHA-256 hash combining the signature image bytes, document text, and ISO timestamp, along with the signer's IP address and user agent for audit purposes. Before connecting their bank account via Plaid, applicants provide additional consent through Plaid Link's built-in consent flow. The full text of each signed document at the time of signing is preserved in the database for 7 years, ensuring an immutable record of exactly what the consumer agreed to. No consumer data is collected, processed, or stored without explicit prior consent.

---

### Question 23: Data Minimization (privacy_data_minimization)
**Does your organization have a defined and enforced data deletion and retention policy that is in-compliance with applicable data privacy laws?**

**Select:** Yes - We have a defined and enforced data deletion and retention policy that is in-compliance with applicable data privacy laws (document attached)

**Attach:** Document 2 — Data Retention & Deletion Policy (see Part B)

---

### Question 24: Data Usage (privacy_data_usage)
**Does your organization sell consumer data accessed through the Plaid API?**

**Select:** No - We do NOT sell consumer data retrieved from the Plaid API

**Comment field:**
VettdRE does not sell, rent, share, or otherwise distribute consumer financial data obtained through the Plaid API to any third party for marketing, advertising, or any purpose other than the specific tenant screening service for which the consumer provided explicit consent. Consumer data is used solely to generate the applicant's screening report and is retained only for the period specified in our Data Retention and Deletion Policy. When consumer documents are sent to Anthropic's Claude API for AI-powered analysis, personally identifiable information (SSNs, full account numbers, routing numbers) is redacted from the document content before transmission.

---

### Question 25: Client-Facing 2FA (client_2fa)
**Does your organization enforce 2FA on your client-facing mobile and/or web applications?**

**Select:** Yes - We enforce 2FA using SMS-based or Email-based push OTP

**Comment field:**
VettdRE's agent/broker dashboard enforces authentication via Supabase Auth with email and password. The applicant-facing wizard uses a multi-layered session security model: initial access is controlled via a cryptographically random URL token, which serves as a one-time entry point that immediately establishes a server-side session backed by an httpOnly, Secure, SameSite=Lax cookie. The URL token alone is not sufficient for subsequent requests — all API calls after the initial load require the valid session cookie. Session resumption (returning to a partially completed application) is authenticated via SMS or email-based one-time passcodes (OTP) delivered through Twilio, generated using cryptographically secure randomness (crypto.randomInt), verified using timing-safe comparison (crypto.timingSafeEqual), limited to 5 verification attempts per code with automatic invalidation after the limit is reached, and subject to a 10-minute automatic expiry. Rate limiting is enforced on both OTP request and verification endpoints to prevent brute-force attacks.

---
---

# PART B: SUPPORTING POLICY DOCUMENTS

---

## Document 1: Information Security Policy

**VettdRE, Inc. — Information Security Policy**
**Version:** 3.0
**Effective Date:** April 2026
**Last Reviewed:** April 2026
**Next Review:** October 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This policy establishes VettdRE's commitment to protecting the confidentiality, integrity, and availability of all information assets, with particular emphasis on consumer financial data including personally identifiable information (PII), bank account data, credit bureau data, and Social Security Numbers processed through the VettdRE Screening platform.

### 2. Scope

This policy applies to all VettdRE employees, contractors, and systems that access, process, store, or transmit consumer data or connect to VettdRE's production infrastructure, including but not limited to: the VettdRE Screening web application, Supabase database and storage, Google Cloud Run services, Upstash Redis, and all third-party API integrations (Plaid, CRS Credit API, Stripe, Twilio, Anthropic, Resend).

### 3. Information Security Principles

**3.1 Least Privilege:** All access to production systems, databases, and API credentials is granted on a need-to-know basis with the minimum permissions required to perform the function. The application enforces this at the code level through dual Supabase clients: authenticated routes use the anon key with user JWTs so Row-Level Security policies are enforced at the database level, while the service role key is restricted exclusively to internal processing and webhook routes.

**3.2 Defense in Depth:** Security controls are layered across the application, infrastructure, and organizational levels. No single control is relied upon exclusively. For example, applicant access is protected by three layers: cryptographic URL token, server-side session validation via httpOnly cookie, and per-endpoint rate limiting.

**3.3 Encryption by Default:** All consumer data is encrypted in transit (TLS 1.3) and at rest (AES-256). Plaid access tokens receive additional application-level AES-256-GCM encryption with scrypt key derivation. Social Security Numbers are never stored at rest in any database — they are held only in ephemeral server-side memory (Upstash Redis) with automatic TTL expiry and deleted immediately after use.

**3.4 Data Minimization:** VettdRE collects only the consumer data necessary to perform the tenant screening service for which consent was obtained, retains it only for the period required by law and business necessity, and proactively avoids persisting the most sensitive data (SSN) whenever possible. When transmitting consumer documents to third-party AI services for analysis, PII is redacted prior to transmission.

**3.5 Zero Trust Network:** No production system is trusted by default. All API calls are authenticated, all webhook payloads are signature-verified, all database access is governed by Row-Level Security policies, and all external-facing endpoints are rate-limited. Content Security Policy headers restrict which domains can execute scripts or load resources on VettdRE pages.

### 4. Roles and Responsibilities

**Founder / Director of Innovation:** Owns this policy, approves all access requests, conducts quarterly security reviews, serves as the primary incident response coordinator, and reviews all security-sensitive code changes.

**All Personnel:** Comply with this policy, report suspected security incidents immediately, complete security awareness training, protect credentials and access tokens, and never store API keys or secrets in source code.

### 5. Risk Management

VettdRE maintains a risk register that identifies, assesses, and tracks information security risks. Risks are evaluated based on likelihood and impact, with mitigation controls documented for each. The risk register is reviewed quarterly and updated when material changes occur to the technology stack, vendor relationships, or regulatory requirements.

Key risk areas and their mitigations:

| Risk | Mitigation |
|------|-----------|
| Unauthorized access to consumer financial data | RLS policies, session validation, rate limiting, audit logging |
| Plaid access token compromise | Application-level AES-256-GCM encryption, tokens deleted after sync completes |
| SSN exposure | SSN never persisted to database; ephemeral Redis storage with 30-min TTL, immediate deletion after credit pull |
| Credit bureau data exposure | AES-256 encryption, 90-day auto-deletion of raw reports, signed URL access for PDFs |
| Document fraud / manipulated uploads | 3-layer AI fraud detection with metadata forensics, data extraction, and cross-verification against Plaid |
| API key exposure in code repositories | All secrets in Google Secret Manager / Cloud Run env vars, .gitignore enforcement, no secrets in code |
| Third-party vendor security incident | Vendor management policy with SOC 2 requirement, security posture monitoring, incident notification provisions |
| Brute-force attacks on OTP or access tokens | Rate limiting on all sensitive endpoints, OTP attempt limiting (5 max), automatic invalidation, cryptographically secure generation |
| PDF report leakage | Agent watermarks, signed URLs with 5-minute expiry, SSN last-4 only, every download logged to audit trail |
| PII exposure via AI document analysis | Regex-based PII redaction (SSN, account numbers, routing numbers) before any document content is sent to Anthropic API |

### 6. Security Controls Summary

| Domain | Control |
|--------|---------|
| Hosting | Google Cloud Run (fully managed, gVisor sandboxing, auto-scaling, read-only filesystem) |
| Database | Supabase managed PostgreSQL with RLS, AES-256 at-rest encryption, Point-in-Time Recovery |
| Ephemeral Data Store | Upstash Redis (serverless, encrypted at rest and in transit) for sessions, OTPs, SSN pass-through, rate limiting |
| Secrets Management | Application-level AES-256-GCM encryption for Plaid tokens (TOKEN_ENCRYPTION_KEY via Secret Manager), Google Secret Manager for all API keys |
| Authentication | Supabase Auth with MFA (agents/brokers), OTP via Twilio (applicants), MFA on all admin consoles |
| Session Management | httpOnly, Secure, SameSite=Lax cookies backed by Redis server-side sessions with 24-hour TTL |
| Authorization | Row-Level Security policies enforced via dual Supabase client architecture (anon key for user routes, service role for internal only) |
| Rate Limiting | Upstash Ratelimit on all API endpoints: general (60/min), OTP request (3/15min), OTP verify (5/15min), app creation (10/hr), doc upload (20/hr), payment (5/hr), token access (30/min) |
| Encryption in Transit | TLS 1.3 enforced on all endpoints via Google Cloud Run managed certificates, HSTS preload, Referrer-Policy: no-referrer |
| Encryption at Rest | AES-256 volume-level (Supabase/AWS), AES-256 column-level (Vault) for Plaid tokens, SSN never stored |
| Content Security Policy | Strict CSP headers whitelisting only Plaid, Stripe, Supabase, and VettdRE domains; frame-ancestors 'none'; object-src 'none' |
| Audit Logging | application_events table (all user and system actions), processed_webhooks table (webhook idempotency), Cloud Logging (infrastructure) |
| PDF Security | Agent watermark on every page, Supabase signed URLs with 5-minute expiry, SSN last-4 only, all downloads logged |
| PII Protection | SSN pass-through via Redis (never stored in DB), PII redaction before AI analysis, document PII scrubbing |
| Monitoring & Alerting | Google Cloud Monitoring, Supabase monitoring, rate limit violation alerts, webhook failure alerts, payment failure alerts |
| Webhook Security | Signature verification (Stripe, Plaid, CRS), idempotency via processed_webhooks table preventing duplicate processing |
| Backup & DR | Supabase PITR enabled, nightly GCS backups of critical tables, 90-day retention with versioning, tested recovery procedures |
| Code Security | Automated vulnerability scanning (Artifact Registry, npm audit, Dependabot), TypeScript type safety, ESLint security rules |
| Incident Response | Defined 6-phase incident response plan with severity classification (P1-P4), notification procedures, and post-incident review |

### 7. Policy Review

This policy is reviewed semi-annually and updated as needed to reflect changes in VettdRE's technology stack, regulatory environment, threat landscape, or vendor relationships. Material changes are communicated to all personnel and documented in the policy version history.

### 8. Compliance

VettdRE's information security program is designed to support compliance with:
- Fair Credit Reporting Act (FCRA)
- Gramm-Leach-Bliley Act (GLBA) safeguards requirements
- New York SHIELD Act (data breach notification)
- NYC Fair Chance Act (criminal history restrictions in screening)
- Plaid's Developer Policy and data handling requirements
- PCI DSS requirements (delegated to Stripe for payment processing)

---

## Document 2: Data Retention & Deletion Policy

**VettdRE, Inc. — Data Retention & Deletion Policy**
**Version:** 3.0
**Effective Date:** April 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This policy defines how long VettdRE retains consumer data collected during the tenant screening process and the procedures for secure deletion when retention periods expire.

### 2. Data Minimization Principle

VettdRE is designed to avoid persisting the most sensitive data whenever possible. The most notable application of this principle is the SSN pass-through architecture: Social Security Numbers are never written to any database. They are held exclusively in ephemeral server-side memory (Upstash Redis) with a 30-minute automatic time-to-live (TTL) and are deleted from memory immediately after the credit bureau API call completes — typically within seconds. Only the last 4 digits of the SSN are retained for applicant identification on the screening report.

### 3. Retention Schedules

| Data Category | Storage Location | Retention Period | Deletion Method | Basis |
|---------------|-----------------|-----------------|-----------------|-------|
| Social Security Number (full) | Upstash Redis (ephemeral only) | Maximum 30 minutes (auto-TTL), deleted immediately after credit pull | Automatic TTL expiry + immediate programmatic deletion | Data minimization — SSN is never needed after credit bureau call |
| SSN last 4 digits | Supabase (applicants table) | 2 years from application date | Automated database cleanup job | Required for PDF report identification |
| Plaid access tokens | Supabase (AES-256-GCM encrypted column) | Deleted immediately after transaction sync completes | Programmatic deletion + Plaid /item/remove API call | Data minimization — tokens not needed after data pull |
| Plaid transaction data | Supabase (encrypted at rest) | 2 years from application date | Automated database cleanup job | Business necessity for dispute resolution |
| Credit reports (raw encrypted) | Supabase (encrypted column) | 90 days from pull date | Automated database cleanup job | FCRA — disposed securely after business purpose fulfilled |
| Credit report summary (scores, counts) | Supabase | 2 years from application date | Automated database cleanup job | Business record for screening decision support |
| Criminal/eviction records | Supabase | 2 years from application date | Automated database cleanup job | Business record for screening decision support |
| Uploaded documents (pay stubs, etc.) | Supabase Storage (encrypted bucket) | 1 year from application date | Automated storage cleanup job | Dispute resolution and fraud investigation |
| Document AI analysis results | Supabase | 2 years from application date | Automated database cleanup job | Business record |
| E-signature records | Supabase | 7 years from signature date | Manual deletion only (protected from automated cleanup) | Legal compliance — proof of consent for FCRA |
| Application events (audit log) | Supabase + GCS backup | 7 years from event date | Manual deletion only (protected from automated cleanup) | Legal compliance — FCRA dispute support |
| Processed webhooks (idempotency) | Supabase | 7 days from receipt | Automated database cleanup job | Only needed for short-term duplicate prevention |
| Applicant sessions | Upstash Redis | 24 hours (auto-TTL) | Automatic TTL expiry | Session not needed beyond applicant's active use |
| OTP codes | Upstash Redis | 10 minutes (auto-TTL) | Automatic TTL expiry + immediate deletion after successful verification | Single-use, not needed after verification |
| Financial wellness profiles | Supabase | 2 years from application date | Automated database cleanup job | Business record |
| Applicant personal info | Supabase | 2 years from application date | Automated database cleanup job | Business record |
| Generated PDF reports | Supabase Storage (encrypted) | 2 years from generation date | Automated storage cleanup job | Business record |
| GCS backup data | Google Cloud Storage | 90 days (lifecycle policy) | Automatic GCS lifecycle deletion | Backup retention |

### 4. Deletion Procedures

**Automated Deletion:** VettdRE implements scheduled database functions (via Supabase pg_cron or equivalent) that run nightly to identify and permanently delete records that have exceeded their retention period. Deletion is performed using PostgreSQL DELETE operations with CASCADE to remove all related child records.

**Ephemeral Data (Redis):** SSNs, OTP codes, and applicant sessions stored in Upstash Redis are automatically deleted by Redis TTL expiry. No manual cleanup is required. SSNs are additionally deleted programmatically via explicit DELETE command immediately after the credit bureau API call completes, before the TTL would expire naturally.

**Plaid Token Deletion:** Plaid access tokens are decrypted, used, and then permanently deleted from the database immediately after the transaction sync is complete and the financial wellness profile has been computed. The Plaid Item is also removed via the Plaid API (/item/remove) to revoke VettdRE's access to the consumer's bank data at Plaid's end.

**Credit Report Deletion:** Raw encrypted credit report data is permanently deleted 90 days after the pull date. The parsed summary data (credit score, account counts, flags) is retained separately for the standard 2-year business record period.

**Secure Deletion Method:** All database deletions are permanent (not soft-delete). Supabase's underlying AWS infrastructure handles secure media sanitization for decommissioned storage in accordance with NIST 800-88 guidelines. Google Cloud Storage objects are permanently deleted after lifecycle expiry with versioning providing protection only during the retention window.

### 5. Consumer Data Requests

Consumers may request a copy of their screening report and data by contacting VettdRE. Requests are fulfilled within 30 days in compliance with applicable state and federal privacy laws. Consumers may also request deletion of their data, subject to legal retention requirements (e.g., FCRA dispute records must be retained; e-signature audit trails are retained for 7 years). When deletion is requested and legally permissible, data is permanently removed within 30 days.

### 6. Policy Enforcement

Retention schedules are enforced programmatically through automated database jobs and Redis TTLs to minimize reliance on manual processes. Automated cleanup jobs log the number of records deleted per run. The nightly GCS backup process provides a safety net during the retention period while the GCS lifecycle policy ensures backups themselves are not retained indefinitely.

---

## Document 3: Incident Response Plan

**VettdRE, Inc. — Security Incident Response Plan**
**Version:** 3.0
**Effective Date:** April 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This plan establishes procedures for detecting, responding to, containing, and recovering from security incidents that may affect VettdRE's production systems or consumer data.

### 2. Incident Classification

| Severity | Definition | Response Time | Examples |
|----------|-----------|---------------|---------|
| Critical (P1) | Confirmed breach of consumer PII, SSN, or financial data | Immediate (within 1 hour) | Database breach, Plaid token compromise, credit report exposure, Redis instance compromise |
| High (P2) | Potential data exposure or system compromise | Within 4 hours | Unauthorized access attempt, API key exposure, suspicious admin login, rate limit evasion detected, CSP violation alerts |
| Medium (P3) | Security control failure with no confirmed data exposure | Within 24 hours | Failed webhook signature verification, MFA bypass attempt, unusual traffic patterns, OTP brute-force attempt blocked by rate limiter |
| Low (P4) | Minor security event, no data at risk | Within 72 hours | Failed login attempts below threshold, expired certificates, dependency vulnerability disclosure, blocked requests from CSP |

### 3. Detection Mechanisms

VettdRE employs multiple detection layers:

- **Infrastructure monitoring:** Google Cloud Monitoring alerts on Cloud Run error rates, latency spikes, and resource anomalies
- **Database monitoring:** Supabase alerts on unusual connection patterns, query volume, and storage thresholds
- **Application monitoring:** Custom alerts for failed credit pulls, Plaid errors, Stripe failures, and webhook signature verification failures
- **Rate limiting alerts:** Upstash rate limiter violations logged and alerted — sustained violations on OTP or token endpoints indicate potential attack
- **CSP violation reports:** Content Security Policy violation reports collected to detect XSS attempts
- **Audit log analysis:** Regular review of application_events and processed_webhooks for anomalous patterns
- **External reports:** Bug bounty submissions, customer reports, or vendor notifications

### 4. Incident Response Phases

**Phase 1: Detection & Triage**
- Confirm the event is a genuine security incident (not a false positive)
- Classify severity per the table above
- Assign incident owner (Founder for P1/P2; designated engineer for P3/P4)
- Create incident record with timestamp, classification, and initial assessment

**Phase 2: Containment**
- **P1 — SSN/PII breach:** SSNs are never stored at rest, so exposure is limited to a potential Redis compromise. Immediately rotate Upstash credentials, revoke and regenerate all Redis connection strings, and invalidate all active sessions.
- **P1 — Plaid token compromise:** Immediately invoke /item/remove on all affected Plaid Items to revoke API access. Rotate Plaid API credentials (client_id and secret). Notify Plaid security team.
- **P1 — Database breach:** Immediately rotate Supabase service role key and all API keys stored in environment variables. Revoke all active agent sessions. Take Cloud Run services offline if necessary.
- **P2 — API key exposure:** Immediately rotate the exposed key. Review Cloud Run deployment history and Git history to identify the exposure vector. Enable enhanced monitoring.
- **All severities:** Revoke access for any compromised accounts. Preserve forensic evidence (logs, screenshots, timestamps) before any remediation that might alter evidence.

**Phase 3: Eradication**
- Identify and remediate the root cause
- Patch vulnerabilities, update configurations, or revoke compromised credentials
- Verify the fix in staging before deploying to production

**Phase 4: Recovery**
- Restore services to normal operation
- Re-deploy from a known-good container image if the production image was compromised
- Verify data integrity through database checksums, audit log review, and backup comparison
- Monitor closely for recurrence for 72 hours post-recovery

**Phase 5: Notification**

| Stakeholder | When | How |
|-------------|------|-----|
| Plaid | Within 24 hours of confirmed P1/P2 involving Plaid data | Email to Plaid security team + support ticket |
| CRS Credit API | Within 24 hours of confirmed incident involving credit data | Per CRS notification procedures |
| Affected consumers | Per applicable state breach notification law (NY SHIELD Act: without unreasonable delay) | Written notice per applicable law |
| Stripe | Within 24 hours if payment data is involved | Stripe support |
| NY Attorney General | Per NY SHIELD Act if NY residents affected | Written notice |

**Phase 6: Post-Incident Review**
- Conduct post-incident review within 5 business days
- Document: root cause, timeline, impact, actions taken, and lessons learned
- Update security controls, monitoring rules, policies, or code as needed
- Update the risk register with any newly identified risks
- File incident record in the incident log (retained for 7 years)

### 5. Incident Log

All incidents are logged in a dedicated incident register with: incident ID, detection date/time, classification, description, personnel involved, actions taken, resolution date/time, root cause, consumer impact assessment, notification actions taken, and lessons learned.

---

## Document 4: Change Management Process

**VettdRE, Inc. — Change Management & Release Process**
**Version:** 3.0
**Effective Date:** April 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This document defines VettdRE's process for developing, testing, reviewing, and deploying code changes to production systems.

### 2. Development Workflow

**2.1 Branching Strategy**
- All development work is performed on feature branches created from the main branch
- Branch naming convention: `feature/description`, `fix/description`, `hotfix/description`
- Direct commits to the main branch are prohibited

**2.2 Code Review**
- All feature branches require review before merging to main
- Reviews verify: functionality, security implications (especially PII handling, encryption, authentication, authorization, and API key usage), TypeScript type safety, error handling, and rate limiting coverage for any new endpoints
- Security-sensitive changes receive additional scrutiny with a specific focus on:
  - Any route that handles SSN data (must use Redis pass-through, never database)
  - Any route that creates or validates sessions (must use httpOnly cookies)
  - Any route that accesses Supabase (must use correct client — anon vs service role)
  - Any new webhook handler (must implement signature verification and idempotency)
  - Any document processing (must apply PII redaction before external API calls)

**2.3 Testing Requirements**
- All code changes must pass: TypeScript compilation (tsc --noEmit), ESLint security rules, and automated tests
- Plaid integration changes are tested in Plaid Sandbox with test credentials
- Stripe payment flows are tested using Stripe test mode and Stripe CLI for local webhook simulation
- Database migrations are tested against a Supabase staging project before production deployment
- Rate limiting behavior is verified in staging to confirm limits are correctly applied
- Content Security Policy is tested in staging to verify Plaid Link and Stripe Elements function correctly
- Builds fail automatically if any test, type check, or lint step fails

### 3. Deployment Pipeline

```
Feature Branch → Code Review → Merge to Main → Cloud Build Trigger
  → npm install
  → npm run lint (ESLint with security rules)
  → npm run typecheck (tsc --noEmit)
  → npm run test (automated tests)
  → npm audit --audit-level=critical (fail on critical vulnerabilities)
  → Docker Build (from official Node.js base image)
  → Push to Artifact Registry (vulnerability scan on push)
  → Deploy to Cloud Run (health check verification)
  → Post-deploy smoke test
  → Deployment complete
```

**3.1 CI/CD Platform:** Google Cloud Build with cloudbuild.yaml configuration
**3.2 Container Registry:** Google Artifact Registry (us-east1) with automatic vulnerability scanning enabled on push
**3.3 Deployment Target:** Google Cloud Run (fully managed)
**3.4 Rollback:** Cloud Run maintains previous revisions. Rollback is performed by routing 100% of traffic to the previous healthy revision via `gcloud run services update-traffic`. Target rollback time: under 5 minutes.

### 4. Emergency Changes (Hotfixes)

For critical security patches or production-breaking bugs:
- Hotfix branches are created from main
- Expedited review is permitted (review may occur post-deployment for P1 incidents)
- Deployment follows the same CI/CD pipeline but with elevated priority
- All hotfixes are documented in the incident log with justification for expedited review
- API key rotation does not require a code deployment — keys are rotated via Cloud Run environment variable updates

### 5. Database Migration Process

- All schema changes are written as versioned SQL migration files in `/supabase/migrations/`
- Migrations are applied to a Supabase staging project first and validated
- Production migrations are applied via the Supabase CLI (supabase db push) or Dashboard
- Destructive migrations (DROP, ALTER removing columns) require explicit backup confirmation before execution
- All migrations are version-controlled in Git
- Post-migration verification confirms data integrity and RLS policy enforcement

---

## Document 5: Access Control Policy

**VettdRE, Inc. — Access Control Policy**
**Version:** 3.0
**Effective Date:** April 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This policy defines how access to VettdRE's production systems, databases, APIs, and consumer data is requested, granted, reviewed, and revoked.

### 2. Principle of Least Privilege

All access is granted based on the minimum permissions necessary to perform the assigned function. No user or system receives default administrative or broad access. This principle is enforced at both the infrastructure level (IAM roles, API key scoping) and the application level (dual Supabase client architecture, Row-Level Security).

### 3. Application-Level Access Architecture

VettdRE enforces access control at the application code level through two distinct database clients:

**Authenticated Client (anon key + user JWT):** Used for all agent/broker-facing API routes (`/api/applications/*`, `/api/org/*`). Row-Level Security policies are enforced at the database level — agents can only see their own applications, brokers can see their organization's applications. Even if an agent's session is compromised, the attacker cannot access data belonging to other organizations.

**Service Client (service role key):** Used exclusively for routes where no user session exists: webhook handlers (`/api/webhooks/*`), internal processing routes (`/api/internal/*`), and applicant token-gated routes (`/api/apply/[token]/*`) where session validation is performed via httpOnly cookies rather than Supabase Auth. The service role key is never exposed to client-side code and is accessible only as a Cloud Run environment variable.

### 4. Production Systems Access Matrix

| System | Who Has Access | Authentication | Access Level |
|--------|---------------|----------------|-------------|
| Google Cloud Platform | Founder + authorized engineers | Google Account + MFA (hardware key or authenticator) | Owner / Editor roles per IAM |
| Supabase Dashboard | Founder only | Email + TOTP MFA | Organization Owner |
| Supabase Service Role Key | Application runtime only | Cloud Run environment variable | Programmatic — not accessible to any human account |
| Supabase Anon Key | Application runtime (client-side) | Public (by design), gated by RLS | Read/write only within RLS policies |
| Plaid Dashboard | Founder only | Email + TOTP MFA | Admin |
| Plaid API Keys | Application runtime only | Cloud Run environment variable | Programmatic only |
| CRS Credit API | Application runtime only | Cloud Run environment variable | Programmatic only |
| Stripe Dashboard | Founder + authorized billing personnel | Email + TOTP MFA | Admin |
| Stripe API Keys | Application runtime only | Cloud Run environment variable | Programmatic only |
| Upstash Redis Console | Founder only | Email + MFA | Admin |
| Upstash Redis Connection | Application runtime only | Cloud Run environment variable | Programmatic only |
| GitHub Repository | Founder + authorized engineers | GitHub Account + MFA (hardware key or authenticator) | Write access |
| Twilio Console | Founder only | Email + TOTP MFA | Admin |
| Anthropic Console | Founder only | Email + MFA | Admin |
| Google Cloud Storage (backups) | Founder only (via GCP IAM) | Google Account + MFA | Storage Admin on backup bucket only |

### 5. Applicant Access Controls

Applicants (rental applicants completing the screening wizard) do not have VettdRE user accounts. Their access is controlled through:

1. **Access token:** Cryptographically random 32-character URL token, unique per application
2. **Session cookie:** httpOnly, Secure, SameSite=Lax cookie issued on first load, backed by Redis server-side session (24-hour TTL)
3. **OTP verification:** Required for session resumption (returning to a partially completed application)
4. **Rate limiting:** All applicant endpoints are rate-limited to prevent abuse
5. **Scope limitation:** Applicant sessions can only read/write data for their specific application — no access to other applications, agents, or organizations

### 6. Access Lifecycle

**Requesting Access:** All access requests are submitted to the Founder with justification for the access level requested.

**Granting Access:** The Founder reviews and approves or denies all access requests. Access is provisioned with the minimum required permissions.

**Reviewing Access:** Access is reviewed quarterly. All active accounts across all systems (GCP, Supabase, GitHub, Stripe, Plaid, Twilio, Upstash, Anthropic) are audited against current role requirements. Unused or excessive permissions are revoked.

**Revoking Access:** Access is revoked within 24 hours of: employment/contract termination, role change that no longer requires the access, or detection of a security incident involving the account. API keys are rotated if a departing individual had knowledge of them. All active sessions for the revoked user are invalidated.

### 7. API Key and Secret Management

- All API keys and secrets are stored in Google Cloud Secret Manager or as Cloud Run environment variables — never in source code, configuration files, or version control
- `.env` files containing secrets are listed in `.gitignore` and never committed
- Pre-commit hooks scan for accidental secret inclusion in staged files
- API keys are rotated annually or immediately upon suspicion of compromise
- Plaid access tokens (consumer-level) are encrypted via application-level AES-256-GCM and deleted after use
- SSN data uses ephemeral Redis storage with automatic TTL — no database persistence

---

## Document 6: Vendor Management Policy

**VettdRE, Inc. — Vendor Management Policy**
**Version:** 3.0
**Effective Date:** April 2026
**Owner:** Nathan, Director of Innovation / Founder

### 1. Purpose

This policy defines VettdRE's process for evaluating, onboarding, monitoring, and offboarding third-party vendors that process, store, or have access to consumer data or VettdRE's production infrastructure.

### 2. Current Vendor Inventory

| Vendor | Data Processed | Security Certifications | Data Handling Notes |
|--------|---------------|------------------------|---------------------|
| Plaid | Bank account data, transactions, identity | SOC 2 Type II, ISO 27001, ISO 27701 | Access tokens AES-256-GCM encrypted, deleted after sync; Item removed via API |
| CRS Credit API | SSN (real-time pass-through only), credit scores, criminal/eviction records | SOC 2 Type II, FCRA-registered CRA | SSN transmitted in real-time, never stored by VettdRE; raw reports auto-deleted at 90 days |
| Supabase | All application data (PII, financial data, tokens, documents) | SOC 2 Type II | AES-256 encryption at rest, RLS enforced, PITR enabled, application-level AES-256-GCM for sensitive columns |
| Google Cloud Platform | Application containers, logs, secrets, backups | SOC 2 Type II, ISO 27001, FedRAMP | Cloud Run (serverless, gVisor), Secret Manager for API keys, GCS for encrypted backups |
| Upstash | Ephemeral data: SSN (30-min TTL), sessions (24-hr TTL), OTP codes (10-min TTL), rate limit counters | SOC 2 Type II | All data encrypted at rest and in transit; all entries have automatic TTL expiry |
| Stripe | Payment card data (PCI scope), payment amounts, customer billing info | PCI DSS Level 1, SOC 2 Type II | VettdRE never handles raw card numbers — delegated entirely to Stripe |
| Twilio | Phone numbers, OTP codes (in transit only) | SOC 2 Type II, ISO 27001 | OTP codes are transient; phone numbers used only for SMS delivery |
| Anthropic | Document content (PII-redacted before transmission) | SOC 2 Type II | SSNs, account numbers, and routing numbers are redacted from document content before API transmission; Anthropic does not train on API inputs |
| Resend | Email addresses (for sending invites/notifications) | SOC 2 Type II | Email addresses used only for transactional delivery; no marketing use |

### 3. Vendor Evaluation Criteria

Before onboarding any new vendor that will process consumer data, VettdRE evaluates:

- **Security certifications:** SOC 2 Type II, ISO 27001, PCI DSS, or equivalent required for vendors processing PII or financial data
- **Data handling practices:** Encryption at rest and in transit, access controls, data retention/deletion capabilities
- **Regulatory compliance:** FCRA compliance (for credit data), GLBA safeguards, applicable state privacy laws
- **Data minimization:** Can VettdRE minimize what data is sent to the vendor? (e.g., PII redaction before Anthropic, SSN pass-through rather than storage for CRS)
- **Incident notification:** Vendor must commit to timely notification of security incidents
- **Business continuity:** Reasonable uptime commitments and disaster recovery capabilities
- **Contractual protections:** Data processing agreements, limitation of data use, indemnification provisions

### 4. Ongoing Monitoring

- Vendor security posture is reviewed annually by checking for updated SOC 2 reports, security certifications, and any disclosed security incidents
- Vendor status pages and security advisories are monitored for outages or breaches
- API usage and error rates are monitored through application logging to detect vendor performance degradation
- Webhook delivery reliability is tracked via the processed_webhooks table
- If a vendor discloses a material security incident, VettdRE assesses the impact on consumer data, follows the Incident Response Plan, and evaluates whether vendor relationship should continue

### 5. Vendor Offboarding

When a vendor relationship is terminated:
- All API keys and credentials for the vendor are immediately revoked or rotated
- Consumer data held by the vendor is deleted or confirmed deleted per the vendor's data deletion procedures and contractual obligations
- The vendor is removed from the active vendor inventory
- All integrations with the vendor are removed from the codebase, tested, and deployed to production
- The change is documented in the vendor management log

---

## Document 7: Privacy Policy & Terms of Service (Summary for Legal Counsel)

**Note:** The full consumer-facing Privacy Policy and Terms of Service should be drafted by legal counsel. The following outlines the key provisions that must be included, updated to reflect the security hardening implementations.

### Privacy Policy Key Provisions

1. **Data Collection:** VettdRE collects personal information (name, address, date of birth, employment details, income), financial data (bank transactions via Plaid, credit reports via CRS), and uploaded documents (pay stubs, tax returns, bank statements) as part of the tenant screening process. Social Security Numbers are collected solely for the purpose of the credit bureau inquiry and are never stored permanently — they are held only in temporary server memory for the duration of the credit check and deleted immediately afterward.

2. **Legal Basis:** Data is collected with the applicant's explicit consent, provided via e-signature prior to any data collection.

3. **Data Use:** Consumer data is used solely to generate a tenant screening report for the specific property and agent/management company identified in the application. Data is not sold, rented, or shared for marketing or advertising purposes.

4. **Third-Party Sharing:** Consumer data is shared only with the following third parties for the stated purposes: CRS Credit API (SSN transmitted in real-time for credit report generation — not stored by VettdRE), Plaid (bank account connection initiated by the consumer for financial verification), Anthropic (document content sent for AI-powered analysis with personally identifiable information redacted prior to transmission), and the requesting agent/management company (via the generated PDF screening report with SSN displayed as last 4 digits only).

5. **Data Retention:** Data is retained per the Data Retention and Deletion Policy. Key points for consumer disclosure: SSN is never stored (held temporarily for seconds during credit check only); credit reports are deleted after 90 days; Plaid bank access is revoked immediately after data analysis; uploaded documents are deleted after 1 year; consent records are retained for 7 years for legal compliance.

6. **Consumer Rights:** Consumers may request a copy of their screening report, dispute inaccurate information per FCRA, and request deletion of their data subject to legal retention requirements. Requests are fulfilled within 30 days.

7. **Security:** Consumer data is protected using AES-256 encryption at rest, TLS 1.3 in transit, ephemeral storage for the most sensitive data (SSN), rate-limited endpoints, and access controls as described in the Information Security Policy.

8. **AI Processing Disclosure:** Uploaded documents (pay stubs, bank statements, tax returns) are analyzed using artificial intelligence to verify authenticity and extract financial information. Before documents are sent for AI analysis, personally identifiable information such as Social Security Numbers, bank account numbers, and routing numbers are automatically redacted from the document content.

### Terms of Service Key Provisions

1. **Service Description:** VettdRE Screening is a tenant screening platform that collects applicant information, verifies financial data, and generates screening reports for landlords and property management companies.

2. **Fee Disclosure:** The applicant is charged a $20.00 screening fee (NYC regulatory cap) prior to the credit report being generated. This fee is non-refundable once the credit report has been pulled.

3. **FCRA Compliance:** VettdRE operates as a consumer reporting agency under FCRA. Applicants are informed of their rights under FCRA, including the right to dispute inaccurate information, the right to obtain a free copy of their report if adverse action is taken, and the right to know what information is in their file.

4. **Consent:** By completing the application and providing an e-signature, the applicant consents to the collection and processing of their data as described in the Privacy Policy, including the credit bureau inquiry, bank account verification via Plaid, and AI-powered document analysis.

---

# PART C: SUBMISSION CHECKLIST

Before submitting your Plaid production access application, confirm:

- [ ] Application Profile completed in Plaid Dashboard
- [ ] Company Profile completed in Plaid Dashboard
- [ ] Security Questionnaire (25 questions) answered per Part A
- [ ] Document 1 (Information Security Policy v2) attached to Question 2
- [ ] Document 2 (Data Retention & Deletion Policy v2) attached to Question 23
- [ ] Document 3 (Incident Response Plan v2) referenced in Question 16
- [ ] Document 4 (Change Management Process v2) referenced in Question 9
- [ ] Document 5 (Access Control Policy v2) attached to Question 7
- [ ] Document 6 (Vendor Management Policy v2) attached to Question 19
- [ ] OAuth redirect URI configured in Link Customization
- [ ] Sandbox integration fully tested with all OAuth test cases
- [ ] All production environment variables configured (including Upstash Redis)
- [ ] Consumer consent flow (e-signature) implemented and tested
- [ ] Rate limiting verified in staging across all sensitive endpoints
- [ ] CSP headers tested with Plaid Link and Stripe Elements
- [ ] SSN pass-through architecture confirmed working with CRS API
- [ ] PII redaction verified on sample documents before Anthropic API calls
