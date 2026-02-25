# VettdRE — Brokerage Management System (BMS) Spec

## Vision
The BMS is a standalone toolset inside VettdRE that gives brokers everything they need to operate a brokerage — from deal intake to commission payouts. Designed to eventually be extracted as a white-label BaaS product.

Flow: SUBMIT → APPROVE → INVOICE → PAY → REPORT

## Navigation
New top-level sidebar item "Brokerage" with sub-nav tabs:
- Deal Submissions (agent intake queue)
- Invoices (generate, batch, track)
- Agents (roster, splits — Phase 2)

## Phase 1A: Agent Deal Submission Portal

### Access Models
1. Authenticated agent — logs into VettdRE with role=agent, submits from dashboard
2. Public submission link — broker generates a unique URL (/submit-deal/[orgToken]), agents submit without login. If email matches a BrokerAgent record, auto-links.

### Deal Submission info: firstName, lastName, email (required), phone, license#
Property: address (required), unit, city, state (default NY)
Transaction: dealType (sale/lease/rental), transactionValue (required), closingDate
Commission: type (percentage or flat), commissionPct or commissionFlat, totalCommission (auto-calc), agentSplitPct, houseSplitPct (auto-calc), agentPayout (auto-calc), housePayout (auto-calc)
Client: name, email, phone, representedSide (buyer/seller/landlord/tenant)
Co-broke: agent name, brokerage name (collapsible)
Notes: textarea

### Status Flow
Submitted → Under Review → Approved → Invoiced → Paid
                              ↓
                          Rejected (with reason)

### Broker Approval Queue
- Filter tabs by status with counts
- Search across address, agent, client
- Expandable cards with full details
- Actions: Approve, Reject (with reason), Generate Invoice, Delete

## Phase 1B: Invoice Generator

### Invoice Creation Methods
1. From approved deal submission (one-click, pre-filing)
2. Manual creation (blank form — Phase 2)
3. Excel upload → parse → preview → bulk create PDFs

### Invoice PDF Template
Professional layout with: brokerage letterhead/logo, invoice # (INV-YYYY-NNNN), issue/due dates, agent info, transaction details, commission breakdown (agent split vs house split), highlighted "Amount Due to Agent" box, signature lines, footer.

### Invoice List
Table view with: checkbox select, invoice #, agent, property, agent payout, house payout, status badge, due date, action icons (download PDF, print, mark paid, void, delete). Bulk actions: download batch PDF, mark paid.

### Excel Upload Flow
Upload .xlsx/.csv → parse with SheetJS → flexible column mapping via aliases → server-side validation → preview table with error highlighting → select valid rows → bulk create invoices. Includes CSV template download.

## Database Models

### BrokerAgent
Linked to Organization (orgId) and optionally to User (userId). Fields: firstName, lastName, email, phone, licenseN, defaultSplitPct, status. Table: broker_agents.

### DealSubmission
Linked to Organization and optionally BrokerAgent. Stores all form fields as snapshots. Uses BmsDealType enum (sale/lease/rental). Status is a string: submitted, under_review, approved, invoiced, paid, rejected. Has optional one-to-one Invoice relation. Table: deal_submissions.

### Invoice
Linked to Organization, optionally to DealSubmission (one-to-one) and BrokerAgent. All brokerage, agent, and deal info snapshotted at creation time. Uses InvoiceStatus enum (draft/sent/paid/void). Auto-generated invoiceNumber (INV-YYYY-NNNN). Table: invoices.

### Organization additions
- submissionToken: unique string for public submission links

## File Structure

src/app/(dashboard)/brokerage/
  layout.tsx                    — sub-nav (Submissions, Invoices, Agents)
  page.tsx                      — redirects to deal-submissions
  deal-submissions/
    page.tsx                    — approval queue UI
    actions.ts                  — server actions (CRUD, appject, public link)
    submission-form.tsx         — reusable form component
  invoices/
    page.tsx                    — invoice list + management
    actions.ts                  — server actions (create, batch, mark paid, excel validation)
    excel-upload.tsx            — upload + parse + preview component

src/app/submit-deal/
  [token]/
    page.tsx                    — public submission (server component)
    client.tsx                  — public submission (client component, no auth)

src/lib/
  bms-types.ts                  — shared types, enums, labels, colors, excel column aliases
  invoice-pdf.ts                — jsPDF invoice generator (single + batch)

## Server Action Patterns
- Auth: getCurrentOrg() via authProviderId → orgId (same as all other actions)
- Public submission: looks up org by submissionToken, no auth
- All queries scoped to orgId
- JSON.parse(JSON.stringify()) for serialization
- Graceful error handling, never crash
- BrokerAgent matched by email on submission creation

## Feature Gating
- bms_submissions, bms_invoices: pro+
- bms_bulk_upload: team+
- bms_agents: team+

## Future Phases
Phase 2: Agent roster, commission plan templates, manual invoice form
Phase 3: Compliance tracking (licenses, E&O), reporting (production, P&L, 1099 prep)
Phase 4: White-label BaaS configuration
