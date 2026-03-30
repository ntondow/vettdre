# Client Onboarding V2 — Claude Code Build Prompts

Run these prompts sequentially in Claude Code. Each prompt is self-contained with full context. Wait for each to complete and verify before running the next.

---

## Prompt 1: Resend Integration for Transactional Email

```
CONTEXT:
The VettdRE client onboarding system needs reliable email delivery. Currently, invite/reminder/notification emails only send if the agent has Gmail OAuth connected (src/lib/onboarding-notifications.ts). The Gmail lookup is also buggy — it searches by first name substring instead of by userId. Most agents won't have Gmail connected, so emails silently fail to send (just logs a warning).

The email templates (invite, reminder, completion notification) are already built as HTML strings in onboarding-notifications.ts. They look good — don't change them.

TASK:
1. Install Resend: `npm install resend`

2. Add environment variable support:
   - Add `RESEND_API_KEY` to:
     - `.env.example` (or wherever env vars are documented)
     - `cloudbuild.yaml` in the `--set-secrets` section (format: `RESEND_API_KEY=RESEND_API_KEY:latest`)
   - The API key value will be added to GCP Secret Manager separately

3. Create `src/lib/resend.ts`:
   - Initialize Resend client with RESEND_API_KEY
   - Export a `sendTransactionalEmail({ to, subject, html, from?, replyTo? })` function
   - Default `from` should be `"VettdRE <noreply@vettdre.com>"` (configurable)
   - Include error handling that never throws (log and return { success: false, error })

4. Refactor `src/lib/onboarding-notifications.ts`:
   - KEEP all existing HTML template functions unchanged
   - Change `sendOnboardingInviteEmail()`:
     - FIRST try Resend (if RESEND_API_KEY exists)
     - If Resend not configured, fall back to Gmail send (fix the agent lookup — use the orgId from the onboarding record to find the agent's userId, then look up their GmailAccount by userId directly)
     - Log success/failure either way
   - Change `sendOnboardingCompleteNotification()`:
     - Actually send the email via Resend (currently just console.log)
     - Use the existing completeEmailHtml template
   - Change `sendOnboardingReminder()`:
     - Actually send the email via Resend (currently just console.warn)
     - Use the existing reminderEmailHtml template

5. Update `sendOnboardingInviteEmail` signature to also accept `orgId: string` so it can look up Gmail accounts properly. Update the caller in `src/app/(dashboard)/brokerage/client-onboarding/actions.ts` createOnboarding() to pass orgId.

DO NOT change the HTML email templates. DO NOT change any other onboarding files. Only touch: resend.ts (new), onboarding-notifications.ts, actions.ts (just the function call), cloudbuild.yaml.
```

---

## Prompt 2: Document Vault — Schema, Storage, and Management UI

```
CONTEXT:
VettdRE's client onboarding currently hard-codes 3 document types (tenant_rep_agreement, nys_disclosure, fair_housing_notice). We need a "Document Vault" where agents can upload their own PDF templates and define fillable field positions on them. These templates are org-scoped — every agent in the brokerage shares the same vault.

Currently, OnboardingDocument has a `docType` enum limited to 3 values. We need to support unlimited custom documents while keeping the standard ones as defaults.

EXISTING SCHEMA CONTEXT (prisma/schema.prisma):
- OnboardingDocType enum: tenant_rep_agreement, nys_disclosure, fair_housing_notice
- OnboardingDocument model links to ClientOnboarding with docType, title, pdfUrl, templateHtml, status, sortOrder
- Supabase Storage is already used for PDF uploads (bucket pattern: onboarding/{orgId}/...)

TASK:

1. Add a new Prisma model `DocumentTemplate` to schema.prisma:
   ```
   model DocumentTemplate {
     id            String   @id @default(cuid())
     orgId         String   @map("org_id")
     name          String                          // "Tenant Rep Agreement", "Pet Addendum", etc.
     description   String?
     category      String   @default("custom")     // "standard" | "custom"
     templatePdfUrl String  @map("template_pdf_url") // Supabase Storage URL of the blank PDF

     // Fillable field definitions (JSON array)
     // Each field: { id, label, type: "text"|"date"|"signature"|"initials"|"checkbox", page, x, y, width, height, prefillKey?, required }
     fields        Json     @default("[]")

     isActive      Boolean  @default(true) @map("is_active")
     isDefault     Boolean  @default(false) @map("is_default") // System defaults can't be deleted
     sortOrder     Int      @default(0)    @map("sort_order")

     createdAt     DateTime @default(now()) @map("created_at")
     updatedAt     DateTime @updatedAt     @map("updated_at")

     organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

     @@index([orgId])
     @@index([orgId, category])
     @@map("document_templates")
   }
   ```

   Add the `documentTemplates DocumentTemplate[]` relation to the Organization model.

2. Create migration file `prisma/migrations/20260330100000_add_document_templates/migration.sql` with the CREATE TABLE, indexes, and foreign key. Follow the exact pattern of the existing migration at `prisma/migrations/20260330000000_add_client_onboarding/migration.sql`.

3. Update `OnboardingDocument` model — add an optional relation to DocumentTemplate:
   - Add `templateId String? @map("template_id")` field
   - Add `template DocumentTemplate? @relation(fields: [templateId], references: [id])` relation
   - Add `documentTemplates OnboardingDocument[]` to DocumentTemplate
   - Add this column to the migration SQL as ALTER TABLE

4. Create server actions `src/app/(dashboard)/brokerage/client-onboarding/vault-actions.ts`:
   - `getDocumentTemplates(orgId)` — list all active templates for org, sorted by sortOrder
   - `createDocumentTemplate({ orgId, name, description, category, file: FormData })`:
     - Upload PDF to Supabase Storage: `document-templates/{orgId}/{cuid}.pdf`
     - Create DocumentTemplate record with empty fields array
     - Return the created template
   - `updateDocumentTemplate(id, { name, description, fields, sortOrder, isActive })` — update template metadata and field definitions
   - `deleteDocumentTemplate(id)` — soft delete (set isActive=false). Block deletion of isDefault templates.
   - `updateTemplateFields(templateId, fields: FieldDefinition[])` — save the field layout

5. Define the field type in `src/lib/onboarding-types.ts`:
   ```typescript
   export interface TemplateFieldDefinition {
     id: string;           // cuid
     label: string;        // "Client Signature", "Move-in Date", etc.
     type: "text" | "date" | "signature" | "initials" | "checkbox";
     page: number;         // 0-indexed page number
     x: number;            // percentage from left (0-100)
     y: number;            // percentage from top (0-100)
     width: number;        // percentage width
     height: number;       // percentage height
     prefillKey?: string;  // maps to onboarding data: "clientName", "propertyAddress", "rent", "commissionPct", "moveInDate", "agentName", "brokerageName"
     required: boolean;
   }
   ```

6. Create the Document Vault page `src/app/(dashboard)/brokerage/client-onboarding/vault/page.tsx`:
   - Header: "Document Vault" with "Upload Template" button
   - Grid/list of document templates showing: name, category badge (standard/custom), field count, created date, active toggle
   - Click a template → opens template detail/editor page
   - Upload flow: file input (PDF only, max 10MB), name field, optional description
   - Standard templates (isDefault=true) show a lock icon — can edit fields but not delete

7. Create the Template Field Editor page `src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx`:
   - Left panel: PDF preview rendered page-by-page using <canvas> or <iframe> pointing to the PDF URL
   - Right panel: List of defined fields with name, type, page number
   - Click "Add Field" → select type → click on the PDF preview to place it → field appears as a draggable/resizable overlay
   - Each field overlay shows its label and has a small config popover (label, type, prefillKey dropdown, required toggle)
   - "Save Fields" button persists the field array via updateTemplateFields()
   - For the PDF rendering on the client side, use `react-pdf` (install: `npm install react-pdf`). It renders PDFs to canvas which we can overlay div-based fields on top of.

IMPORTANT: Do NOT modify any existing onboarding files yet (actions.ts, new/page.tsx, etc.). This prompt only builds the vault infrastructure. The next prompt will wire it into the onboarding creation flow.
```

---

## Prompt 3: Wire Document Vault into Onboarding Creation Flow

```
CONTEXT:
We just built a Document Vault (DocumentTemplate model + vault UI + field editor). Now we need to wire it into the onboarding creation flow so agents can:
1. Select which documents to include from their vault
2. Pre-fill deal details (address, rent, commission, move-in date) that auto-populate into template fields
3. Have the PDF generated with pre-filled values before sending to the client

EXISTING FILES TO MODIFY:
- `src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx` — creation form
- `src/app/(dashboard)/brokerage/client-onboarding/actions.ts` — createOnboarding server action
- `src/lib/onboarding-types.ts` — type definitions
- `src/lib/onboarding-pdf.ts` — PDF generation

EXISTING CREATION FORM has these sections:
- Client Info: firstName, lastName, email, phone
- Agreement Terms: commissionPct, termDays
- Delivery Method: email/sms/link
- Personal Note

TASK:

1. Update the creation form (`new/page.tsx`) to add these new sections:

   a. **Document Selection** (new section between Client Info and Agreement Terms):
      - Fetch available templates via getDocumentTemplates(orgId)
      - Show each template as a toggleable card with checkbox, name, description, field count
      - Default templates (isDefault=true) are pre-checked but can be unchecked
      - At least 1 document must be selected
      - Show selected count: "3 documents selected"

   b. **Deal Details** (new section after Agreement Terms):
      - Apartment Address (text input)
      - Unit Number (text input)
      - Monthly Rent (currency input)
      - Move-in Date (date picker)
      - These map to prefillKey values: "propertyAddress", "unitNumber", "rent", "moveInDate"
      - Commission % and Agent/Brokerage name are already captured elsewhere and auto-mapped

2. Update `ClientOnboardingInput` in `onboarding-types.ts`:
   - Add `selectedTemplateIds: string[]`
   - Add `unitNumber?: string`
   - Add `moveInDate?: string` (ISO date string)
   - Keep existing fields (propertyAddress, monthlyRent, commissionPct already exist)

3. Update `createOnboarding()` in `actions.ts`:
   - Accept the new fields from the form
   - For each selected template:
     a. Fetch the DocumentTemplate record (with fields JSON)
     b. Fetch the template PDF from Supabase Storage
     c. Use pdf-lib to fill in any fields that have a `prefillKey`:
        - "clientName" → `${clientFirstName} ${clientLastName}`
        - "clientEmail" → clientEmail
        - "propertyAddress" → propertyAddress
        - "unitNumber" → unitNumber
        - "rent" → monthlyRent (formatted as currency)
        - "commissionPct" → commissionPct + "%"
        - "moveInDate" → formatted date
        - "agentName" → agent's full name
        - "brokerageName" → org name
        - "agreementTerm" → termDays + " days"
        - "date" → today's date
     d. For "signature" and "initials" type fields — leave blank (client fills these)
     e. Upload the pre-filled PDF to Supabase Storage
     f. Create OnboardingDocument record linked to both the onboarding AND the template
   - Remove the old hard-coded 3-document creation logic
   - Keep the email sending logic as-is

4. Create a new utility `src/lib/onboarding-prefill.ts`:
   - `prefillPdfFields(pdfBytes: Uint8Array, fields: TemplateFieldDefinition[], values: Record<string, string>): Promise<Uint8Array>`
   - For each field with a prefillKey, if values[prefillKey] exists:
     - "text" fields: draw the text at the field's (x, y) position on the correct page using pdf-lib
     - "date" fields: draw the formatted date
     - "checkbox" fields: draw a checkmark if value is truthy
     - "signature" and "initials" fields: skip (client fills these)
   - The x/y are stored as percentages — convert to absolute coordinates based on page dimensions
   - Use Helvetica font, size 11, black color

5. Update the signing flow (`src/app/sign/[token]/client.tsx`):
   - Currently shows documents with hardcoded 3 types. Update to use the dynamic document list from the onboarding record.
   - The document title should come from the OnboardingDocument record, not from a hardcoded DOC_TYPE_LABELS map.
   - The signing experience (view PDF → draw signature → submit) stays the same.

IMPORTANT: The Tenant Rep Agreement PDF generation (onboarding-pdf.ts) should still work as a fallback if someone creates an onboarding with the standard tenant_rep_agreement template that doesn't have a DocumentTemplate record yet. Keep backward compatibility.
```

---

## Prompt 4: Interactive Client Signing Experience — Form Fields + Live PDF Preview

```
CONTEXT:
The client signing page is at `src/app/sign/[token]/page.tsx` (server wrapper) and `src/app/sign/[token]/client.tsx` (client component). Currently, clients just view a PDF, wait 3 seconds, draw a signature on a canvas, and submit.

We need to upgrade this so clients can FILL IN fields (not just sign). The approach: show a form on the left with the fields that need filling, and a live PDF preview on the right that updates as they type. Signature fields use a signature pad. When they submit, the filled values + signature are embedded into the PDF.

EXISTING SIGNING FLOW:
1. GET /api/onboarding/[token]/verify → returns onboarding data + documents
2. Client sees welcome screen with document list
3. For each document: view PDF → draw signature → POST /api/onboarding/[token]/sign
4. Sign endpoint embeds signature in PDF, uploads to storage, updates status

The OnboardingDocument now has a `templateId` linking to DocumentTemplate which has a `fields` JSON array of TemplateFieldDefinition objects (see onboarding-types.ts).

TASK:

1. Refactor `src/app/sign/[token]/client.tsx` signing step:

   CURRENT: Full-screen PDF viewer + signature canvas below
   NEW LAYOUT (for each document):

   **Desktop (md+):** Two-column layout
   - LEFT (40% width): Scrollable form with all fillable fields for this document
     - Group fields by page number ("Page 1", "Page 2")
     - Text fields → standard text input
     - Date fields → date picker input
     - Checkbox fields → checkbox input
     - Signature fields → embedded signature canvas (same as current, but inline in the form)
     - Initials fields → smaller signature canvas
     - Fields with `prefillKey` that were already filled show as read-only with the pre-filled value and a lock icon
     - Required fields show asterisk, validate before allowing submit
   - RIGHT (60% width): PDF preview (react-pdf) with field overlays
     - Render the document's PDF
     - Show colored overlay rectangles where each field is positioned
     - As the user types in the left form, show the value in real-time on the PDF overlay
     - Signature fields show the drawn signature image on the PDF overlay
     - Pre-filled fields show with a subtle green background
     - Empty required fields show with a subtle red border

   **Mobile (<md):** Single column
   - PDF preview collapsed to a thumbnail/accordion
   - Form fields shown full-width
   - "Preview Document" button opens PDF in a modal

2. Update the sign API endpoint `src/app/api/onboarding/[token]/sign/route.ts`:
   - Currently accepts: { documentId, signatureImage, signerName, signerEmail }
   - NEW: Also accept `fieldValues: Record<string, string>` — the filled field values keyed by field.id
   - After receiving:
     a. Fetch the DocumentTemplate's fields definition
     b. Fetch the current PDF (may already have pre-filled values from agent)
     c. For each field in fieldValues:
        - If it's a text/date/checkbox field: embed the text value at the field position using pdf-lib
        - If it's a signature/initials field: embed the base64 image at the field position
     d. Add audit footer (existing logic)
     e. Upload the completed PDF
     f. Update signing status (existing logic)

3. Update `src/lib/onboarding-signing.ts`:
   - Add new function `embedFieldValues(pdfBytes, fields: TemplateFieldDefinition[], values: Record<string, string>): Promise<Uint8Array>`
   - Similar to prefillPdfFields but handles signature/initials images too
   - For signature fields: decode base64 → embed as PNG image at the field position
   - For text fields: draw text with Helvetica 11pt
   - For date fields: format and draw
   - For checkbox fields: draw a checkmark symbol
   - Keep existing `embedSignatureInPdf()` as backward-compatible fallback for old-format onboardings (no templateId)

4. Update the verify API `src/app/api/onboarding/[token]/verify/route.ts`:
   - Include the template's field definitions in the response for each document
   - Add `template: { fields: [...] }` to each document object
   - Only include fields, not the full template record

5. Install react-pdf: `npm install react-pdf`
   - Configure it for Next.js (may need worker setup)
   - Create a reusable `PdfFieldViewer` component at `src/components/onboarding/pdf-field-viewer.tsx`:
     - Props: pdfUrl, fields, fieldValues (reactive), onFieldClick
     - Renders PDF pages with react-pdf
     - Overlays positioned divs for each field showing current values
     - Handles zoom/scroll

IMPORTANT: Keep backward compatibility. If a document has no templateId (old-style onboarding), fall back to the current signing experience (view PDF + signature canvas only).
```

---

## Prompt 5: Seed Default Document Templates + NYS Disclosure & Fair Housing PDFs

```
CONTEXT:
The Document Vault and interactive signing are built. Now we need to:
1. Generate the actual PDF templates for NYS Disclosure (DOS 1736) and Fair Housing Notice
2. Create a seed script that provisions the 3 default document templates for an organization
3. These currently have no PDF content (pdfUrl is null in the DB)

TASK:

1. Create `src/lib/onboarding-pdf-nys-disclosure.ts`:
   - Generate a proper NYS Agency Disclosure Form (DOS 1736) using pdf-lib
   - This is a standard New York State form that real estate agents must provide
   - Content should include:
     - Title: "New York State Disclosure Form for Buyer and Seller (DOS 1736)"
     - Explanation of agency relationships (seller's agent, buyer's agent, broker's agent, dual agent)
     - The required statutory language about agency disclosure
     - Acknowledgment section with signature lines for client and agent
   - Export: `generateNysDisclosurePdf(params: { brokerageName, agentFullName, agentLicense, clientFirstName, clientLastName }): Promise<Uint8Array>`
   - Use same pdf-lib patterns as onboarding-pdf.ts (page dimensions, fonts, margins, drawWrappedText helper)

2. Create `src/lib/onboarding-pdf-fair-housing.ts`:
   - Generate a Fair Housing Notice PDF using pdf-lib
   - Content should include:
     - Title: "Fair Housing Notice"
     - Equal Opportunity Housing statement
     - Protected classes under federal, NYS, and NYC fair housing laws
     - Agent/brokerage commitment statement
     - Acknowledgment signature line
   - Export: `generateFairHousingPdf(params: { brokerageName, agentFullName }): Promise<Uint8Array>`

3. Create `src/lib/onboarding-seed-templates.ts`:
   - Export `seedDefaultTemplates(orgId: string): Promise<void>`
   - Checks if org already has default templates (isDefault=true). If yes, skip.
   - For each of the 3 standard documents:
     a. Generate the PDF using the respective generator (pass generic placeholders for agent/client names since these are templates)
     b. Upload to Supabase Storage: `document-templates/{orgId}/default-{docType}.pdf`
     c. Create DocumentTemplate record with:
        - category: "standard"
        - isDefault: true
        - Pre-defined field positions for signature/initials/date fields on each document
        - Appropriate prefillKeys mapped to client/agent data
     d. Field definitions for Tenant Rep Agreement:
        - Page 2: tenant signature (type: "signature", prefillKey: null, required: true)
        - Page 2: tenant printed name (type: "text", prefillKey: "clientName", required: true)
        - Page 2: tenant date (type: "date", prefillKey: "date", required: true)
     e. Field definitions for NYS Disclosure:
        - Last page: client signature (type: "signature", required: true)
        - Last page: client printed name (type: "text", prefillKey: "clientName", required: true)
        - Last page: date (type: "date", prefillKey: "date", required: true)
     f. Field definitions for Fair Housing Notice:
        - Last page: client signature (type: "signature", required: true)
        - Last page: acknowledgment date (type: "date", prefillKey: "date", required: true)

4. Wire up seed on org creation:
   - In `src/lib/supabase/middleware.ts`, in the auto-provisioning block where new orgs are created, call `seedDefaultTemplates(org.id)` after org creation
   - Make it fire-and-forget (don't block the request): `seedDefaultTemplates(org.id).catch(console.error)`
   - Also add a manual trigger: create API route `src/app/api/onboarding/seed-templates/route.ts` (POST, auth required) that calls seedDefaultTemplates for the current user's org. This lets existing orgs get the defaults.

5. Update `createOnboarding()` in actions.ts:
   - If no selectedTemplateIds provided (backward compat), auto-select the org's default templates
   - When generating PDFs for default templates, use the existing generators (onboarding-pdf.ts for tenant rep, new files for NYS and fair housing) with actual client/agent data, then upload as the document's PDF

IMPORTANT: The generated PDFs should look professional — proper formatting, clear sections, readable fonts. Use the same visual style as the existing Tenant Rep Agreement (Helvetica, 11pt body, 14pt headers, blue section headers).
```

---

## Prompt 6: Fix Remaining Issues + Polish

```
CONTEXT:
The onboarding V2 system is now built. This prompt handles remaining bugs, edge cases, and polish.

EXISTING ISSUES TO FIX:

1. **Email delivery test**: The invite email to ntondow@gmail.com didn't arrive previously because:
   - The Gmail lookup in onboarding-notifications.ts was broken (searched by first name substring instead of userId)
   - If Prompt 1 (Resend) is implemented, test that flow
   - If Resend isn't configured yet, ensure the Gmail fallback path works:
     - In `sendOnboardingInviteEmail`, accept `agentUserId: string` parameter instead of trying to find the agent by name
     - Look up GmailAccount directly: `prisma.gmailAccount.findFirst({ where: { userId: agentUserId } })`
     - Update callers to pass the agent's userId

2. **SMS delivery**: The create form shows SMS as a delivery option but it's not implemented.
   - Either implement it using the existing Twilio integration (src/lib/twilio.ts):
     - Send an SMS with the signing link text: "[BrokerageName]: Hi {firstName}, please review and sign your documents: {signingUrl}"
     - Requires client phone number (already in the form)
   - OR remove SMS from the delivery method options and add it back later

3. **Signing link in middleware**: Verify that `/sign/[token]` is in the public routes list in `src/lib/supabase/middleware.ts`. The signing page must be accessible without authentication. Check that the matcher pattern or public routes array includes `/sign/*`.

4. **OnboardingDocType enum**: If we're now supporting custom document types via DocumentTemplate, the enum constraint on OnboardingDocument.docType may be too restrictive.
   - Change the `docType` field on OnboardingDocument from the enum to a plain `String` type
   - This allows custom template names like "pet_addendum", "guarantor_agreement", etc.
   - Update the migration to ALTER the column type
   - Keep the OnboardingDocType enum in the schema for reference/constants but don't enforce it on the column
   - Update any TypeScript code that references the enum type to accept `string`

5. **Void/expire cleanup**: When an onboarding is voided or expires, the pre-filled PDFs in Supabase Storage should be cleaned up to save space. Add a cleanup step in `voidOnboarding()` and in the cron expiration check that deletes the storage files.

6. **Loading state**: Add `src/app/(dashboard)/brokerage/client-onboarding/loading.tsx` with a skeleton matching the onboarding list page layout.

7. **Mobile signing**: Test and fix the signing experience on mobile:
   - The signature canvas should work with touch events
   - The form + PDF preview layout should stack vertically on mobile
   - The PDF preview should be optional/collapsible on mobile to save space
   - Ensure the "Sign" button is always visible (sticky bottom on mobile)

8. **Audit trail enhancement**: Add the filled field values to the signing audit log metadata:
   ```
   metadata: {
     fieldValues: { [fieldId]: value },
     documentTitle: doc.title,
     templateId: doc.templateId
   }
   ```

Run through each issue, implement the fix, and verify. For #3, just check and confirm — if it's already there, skip.
```

---

## Execution Order

1. **Prompt 1** (Resend email) — Fixes the immediate email delivery problem. ~15 min
2. **Prompt 2** (Document Vault schema + UI) — New infrastructure. ~30 min
3. **Prompt 3** (Wire vault into creation flow) — Connects vault to onboarding. ~30 min
4. **Prompt 4** (Interactive signing UX) — Client-facing upgrade. ~45 min
5. **Prompt 5** (Seed templates + NYS/FH PDFs) — Content + defaults. ~20 min
6. **Prompt 6** (Bug fixes + polish) — Cleanup. ~20 min

**After each prompt, verify:**
- `npx prisma validate` (schema is valid)
- `npm run build` (TypeScript compiles)
- Test the specific feature in the browser

**Database migrations:**
After Prompts 2 and 6, you'll need to apply migrations to Supabase. Either:
- Use the Supabase MCP `apply_migration` tool in Cowork
- Or run `npx prisma migrate deploy` locally
