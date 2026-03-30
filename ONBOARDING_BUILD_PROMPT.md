# Client Onboarding & E-Signature — Full Build Prompt

Paste everything below this line into Claude Code:

---

Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for the full feature spec. You are building the entire Client Onboarding & E-Signature feature for the BMS. This is a digital workflow where agents invite tenants to sign documents (Tenant Rep Agreement, NY State Disclosure, Fair Housing Notice) via a public link, after which the client is auto-created in the CRM with signed docs attached.

IMPORTANT: Before writing ANY code, read these files to understand the existing patterns:
- prisma/schema.prisma (models, enums, relations, naming conventions)
- src/lib/bms-types.ts (type definitions, permission matrix, record interfaces)
- src/lib/bms-auth.ts (auth helpers)
- src/lib/bms-permissions.ts (RBAC permission checking)
- src/app/(dashboard)/brokerage/deal-submissions/actions.ts (server action patterns: auth, prisma queries, error handling)
- src/app/submit-deal/[token]/page.tsx and client.tsx (public token-based page pattern)
- src/components/layout/sidebar.tsx (sidebar nav structure)
- src/app/(dashboard)/brokerage/invoices/ (invoice creation patterns)

Build ALL of the following. Do not skip any file. Commit when done.

---

## PHASE 1: Prisma Schema

Update prisma/schema.prisma — add these 3 enums and 3 models:

```prisma
enum OnboardingStatus {
  draft
  pending
  partially_signed
  completed
  expired
  voided
}

enum OnboardingDocType {
  tenant_rep_agreement
  nys_disclosure
  fair_housing_notice
}

enum SigningStatus {
  pending
  viewed
  signed
}

model ClientOnboarding {
  id                String             @id @default(uuid())
  orgId             String             @map("org_id")
  agentId           String             @map("agent_id")
  token             String             @unique @default(uuid())
  clientFirstName   String             @map("client_first_name")
  clientLastName    String             @map("client_last_name")
  clientEmail       String             @map("client_email")
  clientPhone       String?            @map("client_phone")
  commissionAmount  Decimal            @map("commission_amount") @db.Decimal(12, 2)
  commissionType    String             @default("flat") @map("commission_type")
  termDays          Int                @default(30) @map("term_days")
  brokerageName     String             @map("brokerage_name")
  agentFullName     String             @map("agent_full_name")
  agentLicense      String?            @map("agent_license")
  agentEmail        String             @map("agent_email_snapshot")
  status            OnboardingStatus   @default(draft)
  sentAt            DateTime?          @map("sent_at")
  completedAt       DateTime?          @map("completed_at")
  expiresAt         DateTime?          @map("expires_at")
  voidedAt          DateTime?          @map("voided_at")
  voidReason        String?            @map("void_reason")
  contactId         String?            @map("contact_id")
  dealId            String?            @map("deal_id")
  lastReminderAt    DateTime?          @map("last_reminder_at")
  reminderCount     Int                @default(0) @map("reminder_count")
  deliveryMethod    String             @default("email") @map("delivery_method")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  organization      Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  agent             BrokerAgent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  contact           Contact?           @relation(fields: [contactId], references: [id], onDelete: SetNull)
  documents         OnboardingDocument[]

  @@index([orgId, status])
  @@index([agentId])
  @@index([token])
  @@index([expiresAt])
  @@map("client_onboardings")
}

model OnboardingDocument {
  id                  String             @id @default(uuid())
  onboardingId        String             @map("onboarding_id")
  docType             OnboardingDocType  @map("doc_type")
  docTitle            String             @map("doc_title")
  docOrder            Int                @default(0) @map("doc_order")
  templateStoragePath String?            @map("template_storage_path")
  signedStoragePath   String?            @map("signed_storage_path")
  signedPublicUrl     String?            @map("signed_public_url")
  status              SigningStatus      @default(pending)
  viewedAt            DateTime?          @map("viewed_at")
  signedAt            DateTime?          @map("signed_at")
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")

  onboarding          ClientOnboarding   @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  auditTrail          SigningAuditLog[]

  @@unique([onboardingId, docType])
  @@index([onboardingId])
  @@map("onboarding_documents")
}

model SigningAuditLog {
  id                 String             @id @default(uuid())
  documentId         String             @map("document_id")
  action             String
  signerName         String             @map("signer_name")
  signerEmail        String             @map("signer_email")
  ipAddress          String             @map("ip_address")
  userAgent          String             @map("user_agent")
  timestamp          DateTime           @default(now())
  signatureImagePath String?            @map("signature_image_path")

  document           OnboardingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@map("signing_audit_logs")
}
```

Add reverse relations to existing models:
- Organization: `clientOnboardings ClientOnboarding[]`
- BrokerAgent: `clientOnboardings ClientOnboarding[]`
- Contact: `clientOnboarding ClientOnboarding?`

Run `npx prisma generate` after updating the schema. Do NOT run prisma migrate.

---

## PHASE 2: Types + Permissions

Create src/lib/onboarding-types.ts following the exact patterns in src/lib/bms-types.ts:
- Type aliases: OnboardingStatusType, OnboardingDocTypeValue, SigningStatusType, CommissionTypeValue ("flat" | "percentage"), DeliveryMethodType ("email" | "sms" | "both")
- ClientOnboardingInput interface (agent form: clientFirstName, clientLastName, clientEmail, clientPhone?, commissionAmount, commissionType, termDays, deliveryMethod, personalNote?)
- SignDocumentInput interface (documentId, signatureImage base64, signerName, signerEmail)
- ClientOnboardingRecord interface (full record with nested documents, agent info)
- OnboardingDocumentRecord, SigningAuditLogRecord interfaces
- ONBOARDING_STATUS_LABELS and ONBOARDING_STATUS_COLORS (use same Tailwind badge color patterns as STAGE_LABELS/STAGE_COLORS in bms-types.ts: green for completed, yellow for pending, blue for partially_signed, gray for expired/voided, slate for draft)
- DOC_TYPE_LABELS: { tenant_rep_agreement: "Tenant Representation Agreement", nys_disclosure: "NY State Agency Disclosure", fair_housing_notice: "Fair Housing Notice" }

Update src/lib/bms-permissions.ts — add to BMS_PERMISSIONS:
```
client_onboarding_create: ["brokerage_admin", "broker", "manager", "agent"],
client_onboarding_view_all: ["brokerage_admin", "broker", "manager"],
client_onboarding_view_own: ["brokerage_admin", "broker", "manager", "agent"],
client_onboarding_void: ["brokerage_admin", "broker", "manager", "agent"],
client_onboarding_resend: ["brokerage_admin", "broker", "manager", "agent"],
```

---

## PHASE 3: PDF Generation + Signing Libraries

Install: `npm install pdf-lib signature_pad`

Create src/lib/onboarding-pdf.ts:
- Export `generateTenantRepAgreementPdf(params)` that uses pdf-lib (PDFDocument.create()) to build a 2-page Tenant Representation Agreement PDF
- Parameters: { brokerageName, agentFullName, agentLicense, clientFirstName, clientLastName, commissionAmount, commissionType, termDays }
- Page 1: Title, parties (brokerage/agent pre-filled, client pre-filled), Sections 1-3 (purpose, exclusive representation, broker fee with commission amount)
- Page 2: Sections 4-7 (FARE Act compliance with 3 bullet points, term with days, termination, signatures area with blank lines)
- Use embedded Helvetica font, standard letter size (612x792), clean professional layout
- Return Uint8Array

Create src/lib/onboarding-signing.ts:
- Export `embedSignatureInPdf(params)` — takes pdfBytes (Uint8Array), signatureImageBase64 (string), signerName, signDate, signaturePosition ('tenant' | 'agent')
- Loads PDF with PDFDocument.load(), decodes base64 PNG, embeds signature image at the appropriate position on page 2, draws name and date text
- Returns modified Uint8Array
- Export `addAuditFooter(pdfBytes, auditText)` — adds small gray footer text on last page with audit info
- Returns modified Uint8Array

---

## PHASE 4: Server Actions

Create src/app/(dashboard)/brokerage/client-onboarding/actions.ts with "use server":

Follow the EXACT patterns from deal-submissions/actions.ts for auth, prisma, error handling, serialization.

1. `getOnboardings(statusFilter?)` — list onboardings for org, permission-gated (view_all vs view_own), include agent name + document status summary, order by createdAt desc
2. `getOnboarding(id)` — single record with nested documents + audit logs, permission check
3. `createOnboarding(input: ClientOnboardingInput)` — auth as BMS agent, auto-populate brokerage/agent info from BrokerAgent + Organization records, generate Tenant Rep PDF via generateTenantRepAgreementPdf(), store in Supabase Storage bucket "onboarding-docs" at path `{onboardingId}/templates/tenant_rep_agreement.pdf`, create ClientOnboarding + 3 OnboardingDocument records (order: 0,1,2), set status=pending, sentAt=now, expiresAt=now+termDays
4. `voidOnboarding(id, reason?)` — only if pending/partially_signed/draft, set voided status
5. `resendOnboarding(id)` — only if pending/partially_signed, increment reminderCount, update lastReminderAt
6. `getOnboardingPublic(token)` — NO auth, lookup by token, validate not expired/voided/completed, return safe public data (no orgId, no storage paths)
7. `generateInvoiceFromOnboarding(onboardingId, data)` — only if completed, data = { propertyAddress, unit?, monthlyRent, leaseStartDate, leaseEndDate, closingDate? }, create DealSubmission (auto-approved) + Invoice + Transaction following existing invoice creation patterns exactly

---

## PHASE 5: Public Signing API Routes

Create src/app/api/onboarding/[token]/verify/route.ts:
- GET handler, no auth
- Lookup by token, return onboarding data + documents for the signing wizard
- Return 404 if not found, 410 if voided/completed/expired

Create src/app/api/onboarding/[token]/sign/route.ts:
- POST handler, no auth
- Body: { documentId, signatureImage, signerName, signerEmail }
- Validate token, check expiration, validate doc belongs to onboarding, check not already signed
- Enforce sequential signing (doc N can only be signed if docs 0..N-1 are signed)
- Capture IP (x-forwarded-for header), User-Agent
- Load template PDF from Supabase Storage
- Call embedSignatureInPdf() + addAuditFooter()
- Upload signed PDF to Supabase Storage at `{onboardingId}/signed/{docType}.pdf`
- Create SigningAuditLog record
- Update document status to "signed"
- If ALL 3 docs signed: update onboarding to "completed", create CRM Contact (contactType: "renter", status: "lead", source: "client_onboarding", assignedTo: agent's userId, tags: ["onboarded", "tenant-rep-signed"]), create FileAttachment records linking signed PDFs to the contact, create Activity record, update onboarding.contactId
- Return { success, documentId, allComplete }

Create src/app/api/onboarding/[token]/download/route.ts:
- GET handler, no auth
- Only if status=completed
- Optional ?docType= query param
- Return download URLs for signed PDFs

---

## PHASE 6: React Components

Create src/components/onboarding/signature-pad.tsx ("use client"):
- Wrapper around signature_pad library
- Props: onSignature(dataUrl), onClear, width?, height?, label?, disabled?
- Canvas-based signature drawing with touch support
- "Clear" button and "Confirm Signature" button
- "Type Instead" toggle: text input with cursive-style rendering, converts to canvas PNG for same output format
- Tailwind styling matching existing UI (rounded-lg borders, blue-600 buttons, gray-50 backgrounds)

Create src/components/onboarding/pdf-viewer.tsx ("use client"):
- Props: pdfUrl, title, onViewed?
- Embed PDF via <iframe> or <object> tag, height ~600px, scrollable
- "Download PDF" link
- Enable sign button after 3 seconds (simple timer-based "viewed" check)
- Tailwind: rounded border, subtle shadow, full width

Create src/components/onboarding/signing-complete.tsx ("use client"):
- Props: clientFirstName, agentFullName, brokerageName, documents (title + signedAt)[], downloadUrl
- Green CheckCircle icon, success message, doc list with timestamps, download button
- Clean centered layout

---

## PHASE 7: Public Signing Page

Create src/app/sign/[token]/page.tsx (server component):
- Accept params.token, metadata title "Sign Documents | VettdRE"
- Render client component

Create src/app/sign/[token]/client.tsx ("use client"):
- Multi-step wizard: loading → welcome → signing (per doc) → complete → error states
- On mount: GET /api/onboarding/[token]/verify
- Welcome step: brokerage name, agent name, "You've been invited to sign X documents", commission summary, "Get Started" button
- Signing step (repeats per document): progress bar "Document X of Y", PdfViewer showing the doc, SignaturePad below, "Sign & Continue" button (disabled until signature captured + 3sec view timer). On submit: POST to sign endpoint, advance to next doc
- Complete step: SigningComplete component
- Error states: expired, voided, already complete, not found — each with appropriate messaging
- Styling: clean white background, max-w-2xl mx-auto, mobile responsive, professional

---

## PHASE 8: Agent-Side BMS Pages

Create src/app/(dashboard)/brokerage/client-onboarding/page.tsx:
- List view with status filter tabs (All, Pending, Partially Signed, Completed, Expired, Voided)
- Table: Client Name, Agent, Commission, Status badge, Sent date, Expires, Actions dropdown (View, Copy Link, Resend, Void)
- "New Client Onboarding" button top-right (blue-600)
- Empty state message
- Follow existing BMS page patterns (deal-submissions/page.tsx is the reference)

Create src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx:
- Create form: client name/email/phone, commission amount + type toggle (flat/percentage), term days, delivery method radio
- Auto-populated read-only fields at top: brokerage name, agent name, license #
- "Send Invite" primary button + "Save as Draft" secondary
- On submit: call createOnboarding(), redirect to detail page
- Validation: required fields, valid email, commission > 0

Create src/app/(dashboard)/brokerage/client-onboarding/[id]/page.tsx:
- Detail view: client info card, document checklist with status icons (Clock/Eye/CheckCircle), audit trail timeline
- Actions: Copy Link, Resend (if pending/partial), Void with confirmation (if not completed), Generate Invoice (if completed — opens modal with property address, rent, lease dates, then calls generateInvoiceFromOnboarding)
- Post-completion: links to CRM contact and invoice

Update src/components/layout/sidebar.tsx:
- Add "Client Onboarding" link in the Brokerage nav section
- Use UserPlus icon from lucide-react
- Link to /brokerage/client-onboarding
- Place it between existing brokerage nav items (near Agents or Deal Submissions)

---

## PHASE 9: Middleware + Public Route

Update src/middleware.ts:
- Add /sign/* to the public routes list (same pattern as /book/*, /submit-deal/*, /chat/*)
- Add /api/onboarding/* to the public API routes list

---

## FINAL STEPS

1. Run `npx prisma generate` and verify no errors
2. Run `npm run build` and fix ANY errors
3. If build has errors, fix them and rebuild until clean
4. Commit all changes with message: "feat: Client Onboarding & E-Signature system — agent invites, public signing flow, CRM integration, invoice generation"

Do NOT push — I will push manually.
Do NOT run prisma migrate — I will run prisma db push manually.
