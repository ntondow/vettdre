# Client Onboarding — Claude Code Prompts

Run these prompts sequentially in Claude Code. Each prompt is scoped to a single deliverable and builds on the previous one. Wait for each to complete and verify before moving to the next.

**Estimated total:** 10 prompts across ~8 implementation sessions.

**Pre-requisite:** Copy `CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md` into your repo root so Claude Code can reference it.

---

## Prompt 1: Prisma Schema + Migration

**What it does:** Adds the 3 new models, 3 new enums, and relation updates to the existing schema. Generates and runs the Prisma migration.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for full context on this feature.

Add the Client Onboarding data model to the Prisma schema (prisma/schema.prisma). This is Phase 1 of the implementation plan.

Add these 3 new enums:
- OnboardingStatus (draft, pending, partially_signed, completed, expired, voided)
- OnboardingDocType (tenant_rep_agreement, nys_disclosure, fair_housing_notice)
- SigningStatus (pending, viewed, signed)

Add these 3 new models exactly as specified in the implementation plan:
- ClientOnboarding
- OnboardingDocument
- SigningAuditLog

Add the reverse relations to the existing models:
- Organization: add clientOnboardings ClientOnboarding[]
- BrokerAgent: add clientOnboardings ClientOnboarding[]
- Contact: add clientOnboarding ClientOnboarding? (one-to-one via contactId)

Follow the existing codebase conventions:
- Use @map("snake_case") for all field names
- Use @@map("table_name") for table names
- Add appropriate @@index directives matching the plan
- Use @db.Decimal(12, 2) for money fields
- Use @default(uuid()) for IDs

After updating the schema, run: npx prisma generate
Do NOT run prisma migrate — I will handle that separately.

Do not modify any other files in this prompt.
```

---

## Prompt 2: Type Definitions + Permissions

**What it does:** Creates the TypeScript types and adds permissions to the BMS permission matrix.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for full context.

Create src/lib/onboarding-types.ts with TypeScript type definitions for the Client Onboarding feature. Follow the exact patterns in src/lib/bms-types.ts.

Include:
1. Type aliases for all new enum values (OnboardingStatusType, OnboardingDocTypeValue, SigningStatusType)
2. Input interfaces:
   - ClientOnboardingInput (what the agent fills in the create form: clientFirstName, clientLastName, clientEmail, clientPhone, commissionAmount, commissionType, termDays, deliveryMethod, personalNote)
   - SignDocumentInput (what the signing endpoint receives: documentId, signatureImage as base64 string, signerName, signerEmail)
3. Record interfaces:
   - ClientOnboardingRecord (full record with all fields + nested documents + agent info)
   - OnboardingDocumentRecord (doc record with status + audit trail)
   - SigningAuditLogRecord
4. Display helpers:
   - ONBOARDING_STATUS_LABELS: Record<OnboardingStatusType, string> with display names
   - ONBOARDING_STATUS_COLORS: Record<OnboardingStatusType, string> with Tailwind color classes (match the badge color patterns used in bms-types.ts)
   - DOC_TYPE_LABELS: Record<OnboardingDocTypeValue, string> with human-readable document names

Then update src/lib/bms-permissions.ts — add these permissions to the BMS_PERMISSIONS object:
- client_onboarding_create: ["brokerage_admin", "broker", "manager", "agent"]
- client_onboarding_view_all: ["brokerage_admin", "broker", "manager"]
- client_onboarding_view_own: ["brokerage_admin", "broker", "manager", "agent"]
- client_onboarding_void: ["brokerage_admin", "broker", "manager", "agent"]
- client_onboarding_resend: ["brokerage_admin", "broker", "manager", "agent"]

Also update the BmsPermission type alias if it's manually defined (it should pick up automatically from the `as const satisfies` pattern).

Do not create any UI components or routes yet.
```

---

## Prompt 3: PDF Generation Library

**What it does:** Creates the server-side logic for generating the Tenant Rep Agreement PDF and the signing/embedding logic.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for full context.

First, install the required npm packages:
npm install pdf-lib signature_pad

Create two new library files:

### File 1: src/lib/onboarding-pdf.ts
Server-side PDF generation for the Tenant Representation Agreement template.

This should export an async function `generateTenantRepAgreementPdf` that:
- Takes parameters: { brokerageName, agentFullName, agentLicense, clientFirstName, clientLastName, commissionAmount, commissionType, termDays }
- Uses pdf-lib to CREATE a new PDF from scratch (do NOT use reportlab — this must be Node.js/TypeScript)
- Generates a 2-page document matching this structure:

PAGE 1:
- Title: "TENANT REPRESENTATION AGREEMENT"
- "This agreement is made between:"
- Brokerage Firm: [pre-filled]
- Licensed Agent: [pre-filled], License #[pre-filled]
- Tenant (Client): [pre-filled from client name]
- Date: _________________ (left blank for signing)
- Section 1: PURPOSE OF AGREEMENT (use generic "above-named Brokerage Firm and its Licensed Agent" language)
- Section 2: EXCLUSIVE TENANT REPRESENTATION
- Section 3: BROKER FEE — commission amount pre-filled (format as "$X,XXX" for flat or "X%" for percentage)

PAGE 2:
- Section 4: COMPLIANCE WITH FARE ACT (with the 3 tenant affirmation bullet points)
- Section 5: TERM OF AGREEMENT — term days pre-filled
- Section 6: TERMINATION
- Section 7: SIGNATURES — blank lines for Tenant Name, Tenant Signature, Tenant Date, Agent Signature, Agent Date

Use pdf-lib's PDFDocument.create(), embed Helvetica font, draw text with proper layout. Keep it clean and professional — no colors, standard letter size (612x792).

Return the PDF as a Uint8Array (Buffer).

### File 2: src/lib/onboarding-signing.ts
Server-side logic for embedding signatures into PDFs.

Export an async function `embedSignatureInPdf` that:
- Takes: { pdfBytes: Uint8Array, signatureImageBase64: string, signerName: string, signDate: string, signatureType: 'tenant' | 'agent' }
- Loads the PDF with pdf-lib
- Decodes the base64 signature PNG and embeds it as an image
- Places the signature image in the appropriate location based on signatureType:
  - 'tenant': on page 2, in the Tenant Signature area
  - 'agent': on page 2, in the Agent Signature area
- Draws the signer name as text next to/below the signature
- Draws the date
- Returns the modified PDF as Uint8Array

Also export a helper function `addAuditFooter` that:
- Takes: { pdfBytes: Uint8Array, auditText: string }
- Adds a small footer on the last page with the audit text (e.g., "Signed electronically on [date] at [IP] — Audit ID: [uuid]")
- Returns modified PDF as Uint8Array

Use proper error handling. Follow the existing patterns in the codebase (see src/lib/deal-pdf.ts or src/lib/pdf-utils.ts for reference).
```

---

## Prompt 4: Server Actions (Agent-Side CRUD)

**What it does:** Creates the server actions for creating, listing, voiding, and resending onboarding invites.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for full context. Also read src/lib/onboarding-types.ts and src/lib/onboarding-pdf.ts that were created in previous prompts.

Create src/app/(dashboard)/brokerage/client-onboarding/actions.ts with "use server" directive.

Reference the patterns in src/app/(dashboard)/brokerage/deal-submissions/actions.ts and src/app/(dashboard)/brokerage/invoices/actions.ts for how existing BMS server actions work (auth checks, permission checks, error handling, prisma queries).

Implement these server actions:

1. `getOnboardings(filters?)` — List all onboardings for the org
   - Auth: requireBmsAgent() pattern
   - Permission: client_onboarding_view_all sees all, client_onboarding_view_own sees only own
   - Support filtering by status
   - Include agent info and document count/status summary
   - Order by createdAt desc

2. `getOnboarding(id)` — Get single onboarding with all documents and audit trail
   - Auth + permission check
   - Include nested documents with their audit logs
   - Include agent info

3. `createOnboarding(input: ClientOnboardingInput)` — Create new onboarding
   - Auth: requireBmsAgent()
   - Permission: client_onboarding_create
   - Auto-populate brokerage/agent fields from the authenticated BrokerAgent record + Organization
   - Generate the Tenant Rep Agreement PDF using generateTenantRepAgreementPdf()
   - Upload template PDF to Supabase Storage (use supabase client from src/lib/supabase/server.ts)
   - Create ClientOnboarding record + 3 OnboardingDocument records
   - For nys_disclosure and fair_housing_notice docs: check if static template PDFs exist in storage, reference them
   - Set expiresAt = now + termDays
   - Set status to "pending" and sentAt to now
   - TODO comment for email/SMS sending (will be implemented in a later prompt)
   - Return the created onboarding

4. `voidOnboarding(id, reason?)` — Cancel an onboarding
   - Auth + permission: client_onboarding_void
   - Only allow voiding if status is draft, pending, or partially_signed
   - Set status to "voided", voidedAt, voidReason

5. `resendOnboarding(id)` — Resend the invite
   - Auth + permission: client_onboarding_resend
   - Only if status is pending or partially_signed
   - Update lastReminderAt, increment reminderCount
   - TODO comment for email/SMS sending

6. `getOnboardingPublic(token)` — Public endpoint (NO auth required)
   - Lookup by token
   - Validate not expired, not voided, not completed
   - Return onboarding data + document list (without sensitive internal fields)
   - Do NOT expose orgId, agentId, storage paths

7. `generateInvoiceFromOnboarding(onboardingId, additionalData)` — Create invoice from completed onboarding
   - Auth + permission: create_invoice
   - Only if onboarding status is "completed"
   - additionalData includes: propertyAddress, unit, leaseStartDate, leaseEndDate, monthlyRent, closingDate
   - Create DealSubmission (auto-approved) + Invoice + Transaction
   - Follow the exact patterns from the existing invoice creation flow
   - Attach signed Tenant Rep Agreement PDF as FileAttachment on the Transaction
   - Return the created invoice

Follow all existing conventions: JSON.parse(JSON.stringify()) for serialization, Array.isArray() checks, proper error messages, try/catch blocks.
```

---

## Prompt 5: Signing API Routes

**What it does:** Creates the public API endpoints that the signing wizard calls.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for context. Also read src/lib/onboarding-signing.ts and src/lib/onboarding-types.ts.

Create 3 API route files for the public signing flow. These routes do NOT require authentication (similar to /api/book/route.ts pattern).

### File 1: src/app/api/onboarding/[token]/verify/route.ts
GET endpoint that validates a token and returns onboarding data for the signing wizard.

- Lookup ClientOnboarding by token (include documents ordered by docOrder)
- Return 404 if not found
- Return 410 (Gone) if status is voided or completed
- Return 410 if expired (also update status to "expired" in DB)
- Return 200 with: clientFirstName, clientLastName, clientEmail, brokerageName, agentFullName, commissionAmount, commissionType, termDays, documents (id, docType, docTitle, status, docOrder), onboardingStatus

### File 2: src/app/api/onboarding/[token]/sign/route.ts
POST endpoint that processes a document signature.

Request body: { documentId, signatureImage (base64), signerName, signerEmail }

- Validate token (same checks as verify)
- Validate documentId belongs to this onboarding
- Validate document status is not already "signed" (prevent re-signing)
- Validate previous documents in order are signed (enforce sequential signing)
- Get IP from headers: x-forwarded-for || x-real-ip || 'unknown'
- Get User-Agent from headers
- Load the template PDF from Supabase Storage
- Call embedSignatureInPdf() to embed the signature
- Call addAuditFooter() to add audit text
- Upload signed PDF to Supabase Storage at onboarding/{onboardingId}/signed/{docType}.pdf
- Create SigningAuditLog record (action: "signed", all metadata)
- Update OnboardingDocument: status = "signed", signedAt, signedStoragePath
- Check if ALL documents for this onboarding are now signed
  - If yes: update ClientOnboarding status to "completed", set completedAt
  - If partially: update to "partially_signed"
  - Trigger post-completion workflow (import and call a function from actions.ts or create inline)
- Return 200 with { success: true, documentId, allComplete: boolean }

### File 3: src/app/api/onboarding/[token]/download/route.ts
GET endpoint that returns signed documents for download.

- Validate token, must be status "completed"
- Query parameter: ?docType=tenant_rep_agreement (optional, downloads single doc)
- If no docType: return a JSON response with download URLs for all 3 signed docs
- If docType specified: redirect to the signed PDF URL or stream the file
- Create SigningAuditLog entry (action: "downloaded")

Include proper error handling, appropriate HTTP status codes, and Content-Type headers.
For all routes, use NextResponse from 'next/server'.
```

---

## Prompt 6: Signature Pad Component + PDF Viewer

**What it does:** Creates the reusable React components for signature capture and PDF display.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for context.

Create these React components in src/components/onboarding/:

### File 1: src/components/onboarding/signature-pad.tsx
"use client" component wrapping the signature_pad library.

Props:
- onSignature: (dataUrl: string) => void — called with base64 PNG when user confirms
- onClear: () => void
- width?: number (default 400)
- height?: number (default 200)
- label?: string (default "Draw your signature below")
- disabled?: boolean

Implementation:
- Use useRef for the canvas element
- Initialize SignaturePad from 'signature_pad' in useEffect (clean up on unmount)
- Handle window resize to keep canvas responsive
- Provide a "Clear" button and a "Confirm Signature" button
- Also provide a "Type Instead" toggle that switches to a text input where the user types their name, rendered in a cursive-style font (use a script-looking system font or Google Font — keep it simple)
- When typing mode is active, render the typed name onto a hidden canvas to generate the same base64 PNG output
- Style with Tailwind matching the existing UI patterns (rounded borders, blue-600 primary buttons, gray-100 backgrounds)
- Show a subtle border/background for the signing area
- Include a small "✕ Clear" link above the canvas

### File 2: src/components/onboarding/pdf-viewer.tsx
"use client" component for rendering a PDF inline.

Props:
- pdfUrl: string (URL to the PDF to display)
- title: string
- onViewed?: () => void — called when user has scrolled through / spent sufficient time viewing

Implementation:
- Use an <iframe> or <object> tag to embed the PDF
- Set a reasonable height (600px-700px, scrollable)
- Include a "Download PDF" link
- Track whether user has scrolled / interacted (simple: enable the sign button after 3 seconds of the PDF being visible, or after user scrolls to bottom)
- Style: rounded border, subtle shadow, full width

### File 3: src/components/onboarding/signing-complete.tsx
"use client" component for the confirmation step.

Props:
- onboardingData: { clientFirstName, agentFullName, brokerageName, documents: { docTitle, signedAt }[] }
- downloadUrl: string

Implementation:
- Green checkmark icon (CheckCircle from lucide-react)
- "All documents signed successfully!" heading
- List of signed documents with timestamps
- "Download Your Copies" button
- "Your agent [Name] at [Brokerage] has been notified."
- Clean, centered layout

All components should follow existing component conventions in the codebase (lucide-react icons, Tailwind, clsx for conditional classes).
```

---

## Prompt 7: Public Signing Page (Multi-Step Wizard)

**What it does:** Creates the public /sign/[token] page with the full multi-step signing flow.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for context. Also read the components created in previous prompts: src/components/onboarding/signature-pad.tsx, pdf-viewer.tsx, signing-complete.tsx.

Create the public signing page at src/app/sign/[token]/:

### File 1: src/app/sign/[token]/page.tsx
Server component (similar pattern to src/app/submit-deal/[token]/page.tsx):
- Accept params.token
- Set metadata: title "Sign Documents | VettdRE"
- Render the client component with the token

### File 2: src/app/sign/[token]/client.tsx
"use client" — the main signing wizard.

State machine with these steps:
- "loading" — fetching onboarding data
- "welcome" — confirmation screen before signing begins
- "signing" — active document signing (sub-state tracks which doc index)
- "complete" — all signed
- "error" — invalid/expired/voided token
- "already_complete" — onboarding was already completed

On mount:
- Fetch GET /api/onboarding/[token]/verify
- Handle error states (404, 410, expired)
- If valid, show welcome step

Welcome step:
- Brokerage logo area (or brokerage name in bold)
- "Welcome, [Client First Name]"
- "[Agent Name] at [Brokerage Name] has invited you to review and sign your tenant representation documents."
- Summary: Commission amount, term length
- "You'll be signing [X] documents:"
  - List document titles with order numbers
- "Get Started" button
- Small print: "By proceeding, you confirm your identity as [full name] ([email])."

Signing step (repeats for each document):
- Progress bar showing "Document X of Y"
- Document title as heading
- PdfViewer component showing the document
- Below the PDF: SignaturePad component
- "Sign & Continue" button (disabled until signature is captured AND PDF has been viewed)
- On submit:
  - POST /api/onboarding/[token]/sign with { documentId, signatureImage, signerName, signerEmail }
  - Show loading spinner during request
  - On success: advance to next document (or complete step if last)
  - On error: show error message, allow retry

Complete step:
- Render SigningComplete component
- Pass download URL

Error/expired states:
- "This invitation has expired" / "This invitation is no longer valid" / "Documents already signed"
- Contact agent message

Styling:
- Clean, minimal, professional
- White background, max-width container (max-w-2xl mx-auto)
- Match the visual style of /submit-deal/[token] and /book/[slug] pages
- Mobile responsive (signing on phones is common)
- Use the modal-in animation from globals.css for step transitions
```

---

## Prompt 8: Agent-Side UI Pages

**What it does:** Creates the BMS dashboard pages for managing client onboardings.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for context. Also read src/app/(dashboard)/brokerage/client-onboarding/actions.ts for the server actions.

Reference the UI patterns in src/app/(dashboard)/brokerage/deal-submissions/ and src/app/(dashboard)/brokerage/invoices/ for layout, table structure, and component patterns.

Create 3 page files:

### File 1: src/app/(dashboard)/brokerage/client-onboarding/page.tsx
List page showing all onboarding invites.

- Server component that calls getOnboardings()
- Renders OnboardingList component (create inline or in components/onboarding/)
- Status filter tabs at top: All, Pending, Partially Signed, Completed, Expired, Voided
- Table with columns: Client Name, Agent, Commission, Status (badge), Sent Date, Expires, Actions
- Actions dropdown per row: View Details, Copy Link, Resend, Void
- "New Client Onboarding" button (top right, blue-600, links to /brokerage/client-onboarding/new)
- Empty state: "No client onboardings yet. Invite your first client to get started."
- Use the existing table/card patterns from the BMS pages

### File 2: src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx
Create form for initiating a new onboarding.

- Server component wrapping a client form component
- Form fields:
  - Client First Name, Last Name (required)
  - Client Email (required), Client Phone (optional)
  - Commission Amount (required, number input with $ prefix)
  - Commission Type: toggle between "Flat Fee" and "Percentage" (default flat)
  - Term Days (number input, default 30)
  - Delivery Method: radio group — Email, SMS, Both (default Email)
  - Personal Note (optional textarea, "Include a personal note in the invite email")
- Auto-populated read-only fields shown at top:
  - Brokerage: [org name]
  - Agent: [your name]
  - License: [your license #]
- "Send Invite" primary button + "Save as Draft" secondary button
- On submit: call createOnboarding(), redirect to detail page on success
- Form validation: required fields, valid email, commission > 0

### File 3: src/app/(dashboard)/brokerage/client-onboarding/[id]/page.tsx
Detail page for a single onboarding.

- Server component that calls getOnboarding(id)
- Top section: client info card (name, email, phone, commission, term, status badge)
- Document checklist section:
  - 3 rows, one per document
  - Each shows: document title, status icon (pending=clock, viewed=eye, signed=checkmark), signed timestamp if signed
  - "View Signed PDF" link if signed
- Signing audit trail section:
  - Timeline of events (viewed, signed) with timestamps, IP addresses
  - Styled as a simple vertical timeline
- Actions section:
  - "Copy Signing Link" button (copies /sign/[token] URL to clipboard)
  - "Resend Invite" button (if pending/partially_signed)
  - "Void" button with confirmation modal (if not completed)
  - "Generate Invoice" button (if completed, links to invoice generation flow)
  - "View Contact" link (if contactId exists, links to /contacts/[id])
- Handle status-specific displays:
  - Voided: show void reason, grey out actions
  - Expired: show "This onboarding has expired" banner
  - Completed: show green success banner, show "Generate Invoice" prominently

Add the "Client Onboarding" link to the BMS sidebar navigation in src/components/layout/sidebar.tsx — add it in the Brokerage section, using the UserPlus icon from lucide-react. Also add it to mobile-nav.tsx if there's a brokerage section there.
```

---

## Prompt 9: Post-Completion Workflow + Notifications

**What it does:** Implements the CRM contact creation, document attachment, and notification logic.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for the post-completion workflow spec.

### File 1: Create src/lib/onboarding-notifications.ts

Export these functions:

1. `sendOnboardingInviteEmail(params)` — Send the initial invite email to the client
   - params: { clientEmail, clientFirstName, agentFullName, brokerageName, signingUrl, personalNote? }
   - Use the existing Gmail send pattern from src/lib/gmail-send.ts if the agent has Gmail connected
   - Fallback: log a TODO/console.warn for now (email provider TBD)
   - HTML email template: professional, clean, includes CTA button to signing URL
   - Subject: "[Agent Name] at [Brokerage] — Please sign your tenant representation documents"

2. `sendOnboardingCompleteNotification(params)` — Notify agent when client finishes signing
   - params: { agentEmail, agentFirstName, clientFullName, onboardingId }
   - Email to the agent
   - Subject: "[Client Name] has signed all onboarding documents"

3. `sendOnboardingReminder(params)` — Reminder to client
   - params: { clientEmail, clientFirstName, agentFullName, brokerageName, signingUrl, daysRemaining }
   - Subject: "Reminder: Please sign your documents — [X] days remaining"

### File 2: Update the sign API route (src/app/api/onboarding/[token]/sign/route.ts)

Add the post-completion workflow after detecting all documents are signed:

1. Create a CRM Contact:
   - Use prisma to create in the contacts table
   - firstName, lastName from onboarding
   - email, phone from onboarding
   - contactType: "renter"
   - status: "lead"
   - source: "client_onboarding"
   - sourceDetail: onboarding ID
   - assignedTo: the agent's userId (from BrokerAgent.userId)
   - orgId from the onboarding
   - tags: ["onboarded", "tenant-rep-signed"]

2. Create FileAttachment records for each signed document:
   - entityType: "contact"
   - entityId: new contact's ID
   - fileName: document title + ".pdf"
   - fileType: "application/pdf"
   - storagePath: the signedStoragePath from OnboardingDocument
   - orgId from onboarding

3. Create an Activity record on the contact:
   - type: "note"
   - subject: "Client onboarding completed"
   - body: "Signed tenant representation agreement, NY State disclosure, and fair housing notice."
   - isAiGenerated: false

4. Update the ClientOnboarding record:
   - contactId: new contact ID
   - completedAt: now

5. Call sendOnboardingCompleteNotification() to notify the agent

6. Call dispatchAutomationSafe("new_lead", { contact data }) to trigger any automations
   - Import from src/lib/automation-dispatcher.ts

### File 3: Update createOnboarding in actions.ts

Wire up sendOnboardingInviteEmail() call after creating the onboarding (replace the TODO comment).

### File 4: Update resendOnboarding in actions.ts

Wire up sendOnboardingReminder() call (replace the TODO comment).
```

---

## Prompt 10: Cron Job + Expiration + Final Wiring

**What it does:** Adds expiration/reminder logic to the cron system and does final integration.

```
Read CLIENT_ONBOARDING_IMPLEMENTATION_PLAN.md for the expiration and reminder spec.

### Task 1: Add onboarding checks to the automations cron

Update src/app/api/automations/cron/route.ts to add two new checks (append to the existing cron logic, don't replace anything):

1. Expire stale onboardings:
   - Query: ClientOnboarding WHERE status IN ('pending', 'partially_signed') AND expiresAt < now()
   - Update each to status = 'expired'
   - Log the count

2. Send reminders for onboardings approaching expiration:
   - Query: ClientOnboarding WHERE status IN ('pending', 'partially_signed') AND expiresAt > now()
   - For each, calculate days remaining
   - Send reminder if: (reminderCount === 0 AND days remaining <= termDays * 0.5) OR (reminderCount === 1 AND days remaining <= termDays * 0.2) OR (reminderCount === 2 AND days remaining <= 1)
   - Call sendOnboardingReminder() from onboarding-notifications.ts
   - Update lastReminderAt and increment reminderCount
   - Limit: process max 50 per cron run

### Task 2: Add public route exclusion to middleware

Update src/middleware.ts to ensure /sign/* routes are treated as public (no auth required).
Check the existing public route patterns (like /book/*, /submit-deal/*, /chat/*) and add /sign/* to that list.

Also add /api/onboarding/* to the public API routes list.

### Task 3: Add "Generate Invoice" integration

In src/app/(dashboard)/brokerage/client-onboarding/[id]/page.tsx (or its client component), add a "Generate Invoice" modal/flow that:
- Only shows when onboarding status === "completed"
- Opens a modal with a form for the missing deal details:
  - Property Address (required)
  - Unit # (optional)
  - Monthly Rent (required)
  - Lease Start Date (required)
  - Lease End Date (required)
  - Move-in Date (optional)
  - Closing Date (optional)
- Pre-fills: commission amount, client name, agent info from the onboarding
- On submit: calls generateInvoiceFromOnboarding() from actions.ts
- On success: redirects to /brokerage/invoices with a success toast

### Task 4: Verify all imports and connections

Do a quick check:
- All imports resolve correctly across the new files
- The sidebar link is properly added
- The /sign/[token] page renders without errors
- The API routes export the correct HTTP method handlers (GET/POST)
- Prisma client is imported correctly in all server files
```

---

## Post-Implementation Checklist

After all 10 prompts are complete, manually verify:

- [ ] `npx prisma generate` runs clean
- [ ] `npx prisma migrate dev --name add_client_onboarding` creates migration
- [ ] `npm run build` compiles without errors
- [ ] Create a test onboarding via the BMS UI
- [ ] Visit the /sign/[token] URL and walk through all 3 steps
- [ ] Verify signed PDFs are stored in Supabase Storage
- [ ] Verify CRM contact is created after all docs signed
- [ ] Verify FileAttachments link the signed docs to the contact
- [ ] Test the "Generate Invoice" flow on a completed onboarding
- [ ] Test voiding an onboarding (should show "cancelled" page on public URL)
- [ ] Test an expired onboarding (should show "expired" page)
- [ ] Upload the NY State Disclosure and Fair Housing PDFs to Supabase Storage

## Future Enhancements (Not in v1)

- [ ] SMS delivery via Twilio (infrastructure exists, just need to wire)
- [ ] Bulk onboarding (CSV upload of multiple clients)
- [ ] Agent pre-signing (agent signs their side before sending to client)
- [ ] Template customization per brokerage (custom clauses, different commission structures)
- [ ] Onboarding analytics dashboard (conversion rate, average time to sign, etc.)
- [ ] Agreement renewal flow (when term expires, one-click resend with updated dates)
- [ ] Integration with the Leasing Agent (auto-trigger onboarding when AI qualifies a lead)
