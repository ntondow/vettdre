# VettdRE — Brokerage Management System (BMS) Spec

## Vision
The BMS is a standalone toolset inside VettdRE that gives brokers everything they need to operate a brokerage — from deal intake to commission payouts. Designed to eventually be extracted as a white-label BaaS product.

Flow: SUBMIT → APPROVE → INVOICE → PAY → REPORT

## Navigation
Top-level sidebar item "Brokerage" (owner/admin) with sub-nav tabs:
- Deal Submissions (agent intake queue)
- Invoices (generate, batch, track)
- Plans (commission plan templates)
- Agents (roster, splits, detail pages)

Separate sidebar item "My Deals" (agent role) → `/brokerage/my-deals`

## Phase 1A: Agent Deal Submission Portal ✅

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

## Phase 1B: Invoice Generator ✅

### Invoice Creation Methods
1. From approved deal submission (one-click, pre-filling)
2. Manual creation (blank form at `/brokerage/invoices/new` via `invoice-form.tsx`)
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

### CommissionPlan
Linked to Organization. Fields: name, type (CommissionPlanType: flat/volume_based/value_based), isDefault, isActive. Has many CommissionTier and many BrokerAgent. Table: commission_plans.

### CommissionTier
Linked to CommissionPlan. Fields: tierOrder, minValue, maxValue (nullable for open-ended), agentSplitPct, houseSplitPct. Table: commission_tiers.

### Organization additions
- submissionToken: unique string for public submission links

## File Structure

src/app/(dashboard)/brokerage/
  layout.tsx                    — sub-nav (Submissions, Invoices, Plans, Agents)
  page.tsx                      — redirects to deal-submissions
  deal-submissions/
    page.tsx                    — approval queue UI
    actions.ts                  — server actions (CRUD, approve/reject, public link)
    submission-form.tsx         — reusable form component
  invoices/
    page.tsx                    — invoice list + management
    actions.ts                  — server actions (create, batch, mark paid, excel validation)
    excel-upload.tsx            — upload + parse + preview component
    invoice-form.tsx            — manual invoice creation form
    new/
      page.tsx                  — standalone manual invoice page
  commission-plans/
    page.tsx                    — plan list + CRUD (card grid)
    actions.ts                  — server actions (CRUD, assign to agents, effective split calc)
    plan-builder.tsx            — dynamic tier builder + preview (flat/volume/value)
  agents/
    page.tsx                    — agent roster table + inline form + import
    actions.ts                  — server actions (CRUD, bulk create, stats, user linking)
    agent-import.tsx            — Excel/CSV upload + preview + bulk create
    [id]/
      page.tsx                  — agent detail: stats, plan tiers, deals, invoices
  my-deals/
    page.tsx                    — agent self-service: own submissions + invoices + submit
    actions.ts                  — server actions (my agent, my submissions, my invoices, my stats)

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
- bms_agent_portal: pro+
- bms_bulk_upload: team+
- bms_agents: team+
- bms_commission_plans: team+

---

## Phase 2: Agent Management & Commission Plans ✅

### 2A: Commission Plan Templates
- 3 plan types: flat, volume_based (by deal count), value_based (by transaction value)
- Dynamic tier builder with add/remove rows, auto-calc house split
- Flat preview (split bar) and tiered preview (stepped bar chart)
- Tier validation with gap/overlap warnings
- Assign plans to agents, set default plan per org
- Archive plans (soft-delete to inactive)

### 2B: Agent Roster
- Full CRUD: create, update, deactivate, reactivate, delete (guarded: no delete if has deals/invoices)
- Table layout with 8 columns: name+email, phone, license, split, plan, deals, status, actions
- Inline add/edit form with commission plan dropdown
- Status tabs with counts: All, Active, Inactive, Terminated
- Search by name, email, license
- Excel/CSV bulk import with column alias resolution, duplicate detection, validation preview

### 2C: Agent Detail Page
- Header card with initials avatar, contact info, status, plan
- 4 stats cards: Total Deals, Total Volume, Total Earnings, Avg Deal Size
- Commission plan tier table with "CURRENT" badge highlighting
- Two-column recent deals + invoices lists with PDF download
- Inline edit mode, deactivate/reactivate

### 2D: Agent Self-Service Portal (/brokerage/my-deals)
- Accessible to users with role=agent via "My Deals" sidebar nav
- Server actions independently verify agent identity via User→BrokerAgent link
- 4 stats cards: My Deals, My Volume, Earnings (Paid), Pending Payouts
- Two tabs: My Submissions (read-only status tracking) and My Invoices (read-only + PDF download)
- Collapsible deal submission form with agent info pre-filled and read-only
- No admin actions (no approve/reject/mark paid/void)
- Unlinked users see "Contact your broker for setup" message

### 2E: Navigation & Role Gating
- Brokerage sub-nav tabs: Deal Submissions, Invoices, Plans, Agents
- Sidebar: "Brokerage" visible to owner/admin, "My Deals" visible to agent role
- User role exposed via UserPlanProvider context for sidebar role-gating

## Phase 3: Reporting, Compliance & Payments ✅

### 3A: Brokerage Dashboard
- Stats cards: Total Volume, House Revenue, Agent Payouts, Pending Payouts
- Secondary stats: Avg Deal Size, Avg Commission Rate, Approved/Total Deals
- Deal Status breakdown (CSS bar chart with percentages per status)
- Deal Types distribution (stacked bar + legend)
- Invoice Status grid (draft, sent, paid, void counts)
- Period selector (month/quarter/year)
- Quick links to Deal Submissions, Invoices, Reports
- Brokerage page.tsx redirects to /brokerage/dashboard

### 3B: Reporting (4 reports + CSV export)
- **Reports sub-nav layout** with 4 tabs: P&L, Agent Production, 1099 Prep, Pipeline
- **P&L Report**: Revenue vs payouts vs net income per period, period chart (CSS bars), totals summary, date range selector, group by month/week, CSV export
- **Agent Production Report**: Leaderboard with trophy rankings (gold/silver/bronze), top agent highlight card, org totals, date range filtering, sort by (volume/deals/earnings), CSV export
- **1099-NEC Tax Prep Report**: Tax year selector, 3 summary cards (total agents, agents above $600, total paid), IRS $600 threshold highlighting, agent earnings table, CSV export, tax disclaimer
- **Deal Pipeline Report**: CSS funnel visualization (Submitted → Approved → Invoiced → Paid), conversion rate cards, speed metrics (avg days to approval/payment), source & deal type breakdowns, recent rejections list
- All reports powered by `reports/actions.ts`: getDashboardSummary, getPnlReport, getAgentProductionReport, get1099PrepData, getDealPipelineReport, exportReportCSV

### 3C: Compliance Tracking
- **ComplianceDocument model**: docType (license/eo_insurance/continuing_education/background_check/other), title, description, issueDate, expiryDate, fileUrl, fileName, fileSize, status, notes
- **ComplianceDocType enum** in Prisma schema
- BrokerAgent gets `eoInsuranceExpiry` field and `complianceDocuments[]` relation
- **Status computation**: null expiryDate → active, past date → expired, within 30 days → expiring_soon, else → active
- **Compliance page**: 4 status overview cards (total, compliant, expired, expiring), expandable "expiring soon" banner grouped by agent, agent compliance table with color-coded dates, side panel with document list and add/edit form
- **Server actions**: getComplianceOverview, getAgentComplianceDocs, createComplianceDoc, updateComplianceDoc, deleteComplianceDoc, getExpiringItems (grouped by agent), refreshComplianceStatuses (batch update)
- Feature gate: bms_compliance (team+)

### 3D: Payment Recording & Tracking
- **Payment model**: invoiceId, agentId?, amount (Decimal 12,2), paymentMethod (PaymentMethod enum), paymentDate, referenceNumber, stripePaymentId (@unique), stripeTransferId (@unique), notes
- **PaymentMethod enum**: check, ach, wire, cash, stripe, other (stripe reserved for future integration)
- **Payments page**: 4 summary cards (Total Paid, Pending Payouts, Payment Count, Top Method), filter bar (date range, method, search), record payment slide-over panel with invoice search/select, payment history table with delete confirmation, pagination, CSV export
- **Inline payment on invoices page**: DollarSign icon button on draft/sent invoices, inline form row (amount pre-filled with balance, method select, reference #), partial payment progress bar, "Partial" badge, paid date display
- **Auto-status cascading**: recording payment auto-marks invoice as "paid" when fully paid (0.5% tolerance), cascades to deal submission; deleting payment reverts invoice status (paid → sent, sent → draft)
- **Server actions**: recordPayment (with balance validation), getInvoicePayments, getPaymentHistory (paginated with filters), deletePayment (with status reversal), getPaymentSummary, exportPaymentHistory (CSV)
- Feature gate: bms_payments (team+)

### 3E: Navigation Update
- Brokerage sub-nav expanded to 8 tabs: Dashboard, Deal Submissions, Invoices, Plans, Reports, Compliance, Payments, Agents
- Reports has its own sub-nav with 4 report tabs
- page.tsx redirects to /brokerage/dashboard (was deal-submissions)

### Database Additions (Phase 3)
- **ComplianceDocType** enum: license, eo_insurance, continuing_education, background_check, other
- **PaymentMethod** enum: check, ach, wire, cash, stripe, other
- **ComplianceDocument** model: org + agent relations, doc metadata, expiry tracking, file storage fields
- **Payment** model: org + invoice + agent relations, Decimal(12,2) amount, Stripe ID fields for future integration
- **BrokerAgent** additions: eoInsuranceExpiry DateTime?, complianceDocuments[] relation, payments[] relation
- **Invoice** addition: payments[] relation
- **Organization** additions: complianceDocuments[] relation, payments[] relation

## Phase 3.5: Roles, Permissions, Onboarding & Audit ✅

### 3.5A: Role-Based Access Control
- **BMS_PERMISSIONS** constant: 24 permission keys across 4 roles (brokerage_admin, broker, manager, agent)
- Permission categories: submissions (view/manage/approve), invoices (view/manage/create), agents (view/manage), commission plans (view/manage), compliance (view/manage), payments (view/manage), reports (view), settings (manage)
- `bms-auth.ts`: `getCurrentBmsUser()` — returns user with brokerageRole, orgId, agentId; `requireBmsPermission()` — throws if user lacks permission
- `bms-permissions.ts`: `BMS_ROLES` array, `BMS_PERMISSIONS` map, `hasPermission(role, permission)` helper, `getRoleLabel()` display helper
- Role hierarchy: brokerage_admin (all), broker (all except settings), manager (view + manage submissions/compliance), agent (view own only)
- BrokerAgent model gets `brokerageRole` field (string, defaults to "agent")

### 3.5B: Brokerage Settings Page
- New route: `/brokerage/settings` — admin-only settings page with 3 tabs
- **Roles & Permissions tab**: role matrix grid, assign roles to agents, role descriptions
- **Settings tab**: company info (name, address, phone), brand settings (company name, logo URL, primary/accent color), BMS defaults (default split %, payment terms, invoice footer, license number, company email)
- **Audit Log tab**: full audit log viewer with filters (see 3.5E)
- Settings persisted to Organization (bmsSettings JSON) and BrandSettings (upsert)
- Brokerage sub-nav expanded to 9 tabs: Dashboard, Deal Submissions, Invoices, Plans, Reports, Compliance, Payments, Agents, Settings

### 3.5C: Agent Onboarding (Invite Flow)
- BrokerAgent gets invite fields: `inviteToken` (@unique), `invitedAt`, `inviteEmail`
- **Invite action** (`onboarding-actions.ts`): `inviteAgent()` generates UUID token, stores on BrokerAgent, returns invite URL
- **Revoke action**: `revokeInvite()` clears invite fields
- **Accept flow** (`/join/agent/[token]`): public page, looks up agent by token, shows brokerage info
  - If logged in → auto-link User to BrokerAgent, clear token
  - If not logged in → show signup/login prompt, then link on `/join/agent/[token]/accept`
- `resolve-user.ts`: server action that links authenticated user to BrokerAgent record
- Audit logging on invite, revoke, and accept

### 3.5D: File Upload Infrastructure
- **FileAttachment model**: orgId, entityType, entityId, fileName, fileType, fileSize, storagePath, publicUrl?, uploadedBy?
- `bms-files.ts`: generic file attachment CRUD — `uploadFile()`, `getFileAttachments()`, `deleteFileAttachment()`
- Indexed by `[orgId, entityType, entityId]` for efficient lookups
- Designed for compliance documents, deal attachments, etc.
- Feature gate: bms_file_upload (team+)

### 3.5E: Audit Logging
- **AuditLog model** (existing): orgId, userId?, actorName?, actorRole?, action, entityType, entityId?, details JSON, previousValue JSON, newValue JSON, createdAt
- `bms-audit.ts`: fire-and-forget logging (never await, `.catch()` on promise)
  - `logAction()`: core logger
  - Convenience functions: `logSubmissionAction`, `logInvoiceAction`, `logPaymentAction`, `logAgentAction`, `logComplianceAction`, `logSettingsAction`
- Wired into all 7 BMS action files: deal-submissions, invoices, agents, onboarding, commission-plans, compliance, settings
- 24 distinct actions tracked: CRUD, status changes, bulk operations, invites, role updates
- **Audit Log Viewer** (`settings/audit-log.tsx`): filter bar (entity type, action search, date range), log table with relative timestamps, color-coded actions, expandable JSON details, pagination (50/page)
- Feature gate: bms_audit_log (team+)

### 3.5F: Feature Gates
- New gates: `bms_agent_onboarding` (pro+), `bms_audit_log` (team+), `bms_file_upload` (team+)
- Total BMS feature gates: 11

### Database Additions (Phase 3.5)
- **FileAttachment** model: generic file storage with entity polymorphism
- **BrokerAgent** additions: `brokerageRole` (string), `inviteToken` (@unique), `invitedAt`, `inviteEmail`
- **AuditLog** additions: `actorName`, `actorRole`, `previousValue` JSON, `newValue` JSON (fields may have existed but now actively used)
- **Organization** additions: `fileAttachments[]` relation

### File Additions (Phase 3.5)
```
src/app/(dashboard)/brokerage/
  settings/
    page.tsx          — 3-tab settings: Roles & Permissions, Settings, Audit Log
    actions.ts        — getBrokerageSettings, updateBrokerageSettings, getAuditLogs
    audit-log.tsx     — audit log viewer component (filters, table, pagination)
  agents/
    onboarding-actions.ts  — inviteAgent, revokeInvite, acceptInvite

src/app/join/agent/[token]/
  page.tsx            — public invite landing (server component)
  client.tsx          — invite landing (client component)
  accept/
    page.tsx          — accept invite (authenticated)
    accept-client.tsx — accept invite (client component)
    resolve-user.ts   — link user to BrokerAgent server action

src/lib/
  bms-auth.ts         — getCurrentBmsUser, requireBmsPermission
  bms-permissions.ts  — BMS_ROLES, BMS_PERMISSIONS, hasPermission, getRoleLabel
  bms-files.ts        — FileAttachment CRUD (upload, list, delete)
  bms-audit.ts        — fire-and-forget audit logging (7 convenience functions)
```

## Future Phases
Phase 4: Stripe payment integration (payouts to agents via Stripe Connect), white-label BaaS configuration, multi-brokerage support
