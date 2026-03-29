// BMS shared types, constants, labels, and Excel column aliases
// NO "use server" — safe for client component imports

// ── Type Aliases ──────────────────────────────────────────────

export type DealType = "sale" | "lease" | "rental" | "commercial_sale" | "commercial_lease" | "land" | "new_construction";
export type CommissionType = "percentage" | "flat";
export type RepresentedSide = "buyer" | "seller" | "landlord" | "tenant";
export type SubmissionStatus = "submitted" | "under_review" | "approved" | "invoiced" | "paid" | "rejected";
export type InvoiceStatusType = "draft" | "sent" | "paid" | "void";
export type SubmissionSource = "internal" | "external";
export type AgentStatus = "pending" | "active" | "inactive" | "terminated";
export type CommissionPlanType = "volume_based" | "value_based" | "flat";
export type CommissionPlanStatus = "active" | "inactive";
export type ExclusiveType = "brokerage" | "personal";

export interface RequiredDocs {
  signedLease?: string;       // file URL or upload key
  agencyDisclosure?: string;
  fairHousingNotice?: string;
  commissionAgreement?: string;
}

// ── Interfaces ────────────────────────────────────────────────

export interface DealSubmissionInput {
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone?: string;
  agentLicense?: string;

  exclusiveType?: ExclusiveType;
  bmsPropertyId?: string;

  propertyAddress: string;
  unit?: string;
  city?: string;
  state: string;

  // Landlord / billing (auto-filled for brokerage exclusives)
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  landlordAddress?: string;
  managementCo?: string;

  dealType: DealType;
  transactionValue: number;
  closingDate?: string;

  // Lease-specific
  leaseStartDate?: string;
  leaseEndDate?: string;
  monthlyRent?: number;

  // Tenant info (for leases)
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;

  commissionType: CommissionType;
  commissionPct?: number;
  commissionFlat?: number;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;

  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  representedSide?: RepresentedSide;

  coBrokeAgent?: string;
  coBrokeBrokerage?: string;

  coAgents?: CoAgentInput[];

  requiredDocs?: RequiredDocs;
  notes?: string;
}

export interface DealSubmissionRecord extends DealSubmissionInput {
  id: string;
  orgId: string;
  agentId?: string;
  status: SubmissionStatus;
  rejectionReason?: string;
  submissionSource: SubmissionSource;
  approvedBy?: string;
  approvedAt?: string;
  managerOverrideExclusiveType?: string;
  managerOverrideSplitPct?: number;
  bmsProperty?: BmsPropertyRecord;
  createdAt: string;
  updatedAt: string;
  invoice?: InvoiceRecord;
  agent?: AgentRecord;
}

export interface InvoiceInput {
  dealSubmissionId?: string;
  agentId?: string;

  brokerageName: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  brokerageLicense?: string;

  agentName: string;
  agentEmail?: string;
  agentLicense?: string;

  propertyAddress: string;
  propertyName?: string;
  unit?: string;
  moveInDate?: string;
  dealType: DealType;
  transactionValue: number;
  closingDate?: string;
  clientName?: string;
  representedSide?: RepresentedSide;

  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;

  paymentTerms: string;
  dueDate: string;
}

export interface InvoiceNumberInput {
  propertyName?: string;     // "Shore Haven"
  propertyAddress?: string;  // "1491 Shore Parkway" or "1491 Shore Parkway 4B"
  unit?: string;             // "4B" (may also be embedded in address)
  moveInDate?: string | Date | null;
  tenantName?: string;       // "John Smith"
  createdAt?: Date;          // fallback date
}

// ── Invoice Number Generator (pure function — safe for client + server) ──

const _SKIP_WORDS = new Set(["the", "at", "of", "and", "in", "on", "for", "by", "a", "an"]);
const _UNIT_PREFIXES = /^(apt\.?|unit\.?|suite\.?|ste\.?|#)\s*/i;

/**
 * Generate a descriptive invoice number from property/tenant/date data.
 * Format: {PropertyAbbrev}{AddressAbbrev}{DateMMDDYY}{TenantInitials}
 *
 * Examples:
 *   Shore Haven, 1491 Shore Parkway 4B, 1/1/2026, John Smith → SH14914B010126JS
 *   Ocean Towers, 2850 Ocean Ave 12C, 3/15/2026, Maria Garcia → OT285012C031526MG
 *   (no name), 500 Sterling Place 3A, 2/28/2026, Bob Lee → 500SP3A022826BL
 */
export function buildInvoiceNumber(input: InvoiceNumberInput): string {
  let parts = "";

  // 1. Property name abbreviation — first letter of each significant word
  if (input.propertyName?.trim()) {
    const words = input.propertyName.trim().split(/\s+/);
    const initials = words
      .filter((w) => !_SKIP_WORDS.has(w.toLowerCase()))
      .map((w) => w[0])
      .join("");
    parts += initials;
  }

  // 2. Address abbreviation — street number + unit
  if (input.propertyAddress?.trim()) {
    const addr = input.propertyAddress.trim();

    // Extract leading street number
    const streetNumMatch = addr.match(/^(\d+)/);
    const streetNum = streetNumMatch ? streetNumMatch[1] : "";

    // Extract unit — try explicit unit field first, then parse from address
    let unit = "";
    if (input.unit?.trim()) {
      unit = input.unit.trim().replace(_UNIT_PREFIXES, "");
    } else {
      // Look for unit at end of address: "1491 Shore Parkway 4B" or "1491 Shore Pkwy Apt 4B"
      const unitMatch = addr.match(/(?:apt\.?|unit\.?|suite\.?|ste\.?|#)\s*(.+)$/i);
      if (unitMatch) {
        unit = unitMatch[1].trim();
      } else {
        // Check for a trailing alphanumeric unit designator (e.g. "4B", "12C")
        const trailingUnit = addr.match(/\s(\d+[A-Za-z]+)\s*$/);
        if (trailingUnit) {
          unit = trailingUnit[1];
        }
      }
    }

    parts += streetNum + unit;
  }

  // 3. Date (MMDDYY) — prefer move-in date, fallback to createdAt, then today
  const dateObj = _parseDateInput(input.moveInDate) ?? input.createdAt ?? new Date();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const yy = String(dateObj.getFullYear()).slice(-2);
  parts += mm + dd + yy;

  // 4. Tenant initials — first letter of first word + first letter of last word
  if (input.tenantName?.trim()) {
    const words = input.tenantName.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      parts += words[0][0] + words[words.length - 1][0];
    } else if (words.length === 1) {
      parts += words[0][0];
    }
  }

  // Uppercase, strip anything that isn't alphanumeric
  return parts.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function _parseDateInput(val: string | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ── Configurable Invoice Number Format ─────────────────────────

export const INVOICE_NUMBER_TOKENS = [
  { token: "{SEQ}", label: "SEQ", description: "Sequential number (0059)", locked: true },
  { token: "{YEAR}", label: "YEAR", description: "4-digit year (2026)" },
  { token: "{PROP}", label: "PROP", description: "Property abbrev (SHO)" },
  { token: "{AGENT}", label: "AGENT", description: "Agent initials (DT)" },
  { token: "{ADDR}", label: "ADDR", description: "Street number (18230)" },
  { token: "{MONTH}", label: "MONTH", description: "2-digit month (03)" },
] as const;

export const DEFAULT_INVOICE_FORMAT = "INV-{YEAR}-{SEQ}";

export interface InvoiceFormatRowData {
  propertyName?: string;
  propertyAddress: string;
  agentName?: string;
}

/**
 * Resolve an invoice number format string with actual values.
 * Tokens: {SEQ}, {YEAR}, {PROP}, {AGENT}, {ADDR}, {MONTH}
 */
export function resolveInvoiceNumber(
  format: string,
  row: InvoiceFormatRowData,
  seq: number,
): string {
  const now = new Date();

  // {SEQ} — zero-padded 4 digits
  let result = format.replace(/\{SEQ\}/g, String(seq).padStart(4, "0"));

  // {YEAR} — 4-digit year
  result = result.replace(/\{YEAR\}/g, String(now.getFullYear()));

  // {MONTH} — 2-digit month
  result = result.replace(/\{MONTH\}/g, String(now.getMonth() + 1).padStart(2, "0"));

  // {PROP} — first 3 uppercase letters of property name (or address fallback)
  result = result.replace(/\{PROP\}/g, (() => {
    const src = (row.propertyName || row.propertyAddress || "").trim();
    return src.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase() || "UNK";
  })());

  // {AGENT} — initials of agent name
  result = result.replace(/\{AGENT\}/g, (() => {
    if (!row.agentName?.trim()) return "XX";
    const words = row.agentName.trim().split(/\s+/).filter(Boolean);
    return words.map(w => w[0]).join("").toUpperCase().substring(0, 3);
  })());

  // {ADDR} — leading digits from property address
  result = result.replace(/\{ADDR\}/g, (() => {
    const match = (row.propertyAddress || "").match(/^(\d+)/);
    return match ? match[1] : "0";
  })());

  return result;
}

export interface InvoiceRecord extends InvoiceInput {
  id: string;
  orgId: string;
  invoiceNumber: string;
  issueDate: string;
  paidDate?: string;
  status: InvoiceStatusType;
  createdAt: string;
  updatedAt: string;
  dealSubmission?: DealSubmissionRecord;
  agent?: AgentRecord;
}

export interface AgentRecord {
  id: string;
  orgId: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  dateOfBirth?: string | null;
  startDate?: string | null;
  teamOrOffice?: string | null;
  w9OnFile: boolean;
  photoUrl?: string | null;
  notes?: string | null;
  licenseNumber?: string;
  licenseExpiry?: string;
  defaultSplitPct: number;
  houseExclusiveSplitPct?: number | null;
  personalExclusiveSplitPct?: number | null;
  status: AgentStatus;
  brokerageRole?: string;
  // Invite fields (for UI display)
  inviteToken?: string | null;
  invitedAt?: string | null;
  inviteAcceptedAt?: string | null;
  inviteEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerageConfig {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  licenseInfo?: string;
  logoUrl?: string;
}

export interface BillToEntity {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
}

export type BillToMappings = Record<string, BillToEntity>;

export interface FromInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface InvoiceSettings {
  invoicePrefix: string;
  invoiceNotes: string;
  invoiceLineFormat: string;
  defaultPaymentTerms: string;
}

export interface PaymentInstructions {
  enabled: boolean;
  achBankName?: string;
  achAccountName?: string;
  achAccountNumber?: string;
  achRoutingNumber?: string;
  wireBankName?: string;
  wireAccountName?: string;
  wireAccountNumber?: string;
  wireRoutingNumber?: string;
  checkPayableTo?: string;
  otherInstructions?: string;
}

export interface SimpleInvoiceData {
  // Brokerage (From — top left letterhead)
  brokerageName: string;
  brokerageAddress?: string;
  brokerageCityStateZip?: string;
  brokerageEmail?: string;
  brokeragePhone?: string;
  brokerageLogo?: string;

  // Bill To (landlord/management)
  billToName: string;
  billToAddress?: string;
  billToPhone?: string;
  billToEmail?: string;

  // Invoice metadata
  invoiceNr: string;
  invoiceDate: string;
  dueDate?: string;

  // Deal details
  moveInDate?: string;
  propertyAddress: string;
  propertyName?: string;
  tenantName: string;
  rentalPrice?: number;
  commissionAmount: number;

  // Agent info
  agentName?: string;
  agentLicenseNumber?: string;

  // Payment instructions
  paymentInstructions?: PaymentInstructions;

  // Optional
  notes?: string;
  year?: string;
}

export interface BrokerageSettings {
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  companyName: string | null;
  defaultSplitPct: number;
  defaultPaymentTerms: string;
  invoiceFooterText: string;
  companyLicenseNumber: string;
  companyEmail: string;
  submissionToken: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  // Invoice settings
  invoicePrefix: string;
  invoiceNotes: string;
  invoiceLineFormat: string;
  billToMappings: BillToMappings;
  paymentInstructions: PaymentInstructions;
}

export interface CommissionTierInput {
  tierOrder: number;
  minThreshold: number;
  maxThreshold?: number;
  agentSplitPct: number;
  houseSplitPct: number;
  label?: string;
}

export interface CommissionTierRecord extends CommissionTierInput {
  id: string;
  planId: string;
}

export interface CommissionPlanInput {
  name: string;
  description?: string;
  planType: CommissionPlanType;
  isDefault?: boolean;
  tiers: CommissionTierInput[];
}

export interface CommissionPlanRecord extends Omit<CommissionPlanInput, "tiers"> {
  id: string;
  orgId: string;
  status: CommissionPlanStatus;
  tiers: CommissionTierRecord[];
  agentCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Report Types ─────────────────────────────────────────────

export type ReportPeriod = "month" | "quarter" | "year";
export type ReportGroupBy = "month" | "week";
export type ReportExportType = "1099" | "agent_production" | "pnl";

export interface DashboardSummary {
  totalDeals: number;
  approvedDeals: number;
  totalVolume: number;
  totalCommission: number;
  houseRevenue: number;
  agentPayouts: number;
  pendingPayouts: number;
  avgDealSize: number;
  avgCommissionRate: number;
  submissionsByStatus: Record<string, number>;
  invoicesByStatus: Record<string, number>;
  dealsByType: Record<string, number>;
  periodStart: string;
  periodEnd: string;
}

export interface PnlPeriod {
  period: string;
  revenue: number;
  payouts: number;
  netIncome: number;
  dealCount: number;
  volume: number;
}

export interface PnlReport {
  periods: PnlPeriod[];
  totals: {
    totalRevenue: number;
    totalPayouts: number;
    totalNetIncome: number;
    totalDeals: number;
    totalVolume: number;
  };
}

export interface AgentProductionRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  dealCount: number;
  totalVolume: number;
  totalCommission: number;
  agentEarnings: number;
  houseEarnings: number;
  avgDealSize: number;
  avgSplitPct: number;
  rank: number;
}

export interface AgentProductionReport {
  agents: AgentProductionRow[];
  orgTotals: {
    totalDeals: number;
    totalVolume: number;
    totalCommission: number;
    totalAgentPayouts: number;
    totalHouseRevenue: number;
  };
}

export interface Agent1099Row {
  agentId: string;
  agentName: string;
  agentEmail: string;
  agentLicense: string;
  totalEarnings: number;
  invoiceCount: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  isAbove600: boolean;
}

export interface Report1099Data {
  agents: Agent1099Row[];
  summary: {
    totalAgents: number;
    agentsAboveThreshold: number;
    totalPaid: number;
  };
}

export interface PipelineReport {
  statusCounts: Record<string, number>;
  conversionRates: {
    submittedToApproved: number;
    approvedToInvoiced: number;
    invoicedToPaid: number;
    overallConversion: number;
  };
  avgDaysToApproval: number;
  avgDaysToPayment: number;
  bySource: Record<string, { count: number; volume: number }>;
  byDealType: Record<string, { count: number; volume: number; avgValue: number }>;
  recentRejections: Array<{
    propertyAddress: string;
    agentName: string;
    reason: string;
    date: string;
  }>;
}

// ── Compliance Types ─────────────────────────────────────────

export type ComplianceDocType = "license" | "eo_insurance" | "continuing_education" | "background_check" | "other";
export type ComplianceDocStatus = "active" | "expired" | "expiring_soon";

export interface ComplianceDocInput {
  agentId: string;
  docType: ComplianceDocType;
  title: string;
  description?: string;
  issueDate?: string;
  expiryDate?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  notes?: string;
}

export interface ComplianceDocRecord extends ComplianceDocInput {
  id: string;
  orgId: string;
  status: ComplianceDocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentComplianceSummary {
  agentId: string;
  agentName: string;
  licenseExpiry: string | null;
  eoInsuranceExpiry: string | null;
  totalDocs: number;
  expiredDocs: number;
  expiringSoonDocs: number;
  isFullyCompliant: boolean;
}

// ── Payment Types ────────────────────────────────────────────

export type PaymentMethodType = "check" | "ach" | "wire" | "cash" | "stripe" | "other";

export interface PaymentInput {
  invoiceId: string;
  agentId?: string;
  amount: number;
  paymentMethod: PaymentMethodType;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface PaymentRecord extends PaymentInput {
  id: string;
  orgId: string;
  stripePaymentId?: string;
  stripeTransferId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePaymentSummary {
  invoiceId: string;
  invoiceTotal: number;
  totalPaid: number;
  balance: number;
  isFullyPaid: boolean;
  payments: PaymentRecord[];
}

// ── Agent Onboarding / Invite Types ──────────────────────────

export type AgentInviteStatus = "not_invited" | "pending" | "accepted";

export interface AgentInviteInfo {
  agentId: string;
  agentName: string;
  agentEmail: string;
  inviteToken?: string;
  invitedAt?: string;
  inviteAcceptedAt?: string;
  inviteStatus: AgentInviteStatus;
}

export interface InviteDetails {
  agentName: string;
  agentEmail: string;
  agentRole: string;
  brokerageName: string;
  brokerageLogo?: string;
  brokerageColor?: string;
}

export const AGENT_INVITE_STATUS_LABELS: Record<AgentInviteStatus, string> = {
  not_invited: "Not Invited",
  pending: "Invite Pending",
  accepted: "Accepted",
};

export const AGENT_INVITE_STATUS_COLORS: Record<AgentInviteStatus, string> = {
  not_invited: "bg-slate-100 text-slate-500",
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-green-100 text-green-700",
};

// ── Onboarding Status Labels ─────────────────────────────────

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
};

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  inactive: "bg-slate-100 text-slate-500",
  terminated: "bg-red-100 text-red-700",
};

// ── Brokerage Roles & Permissions ────────────────────────────

export type BrokerageRoleType = "brokerage_admin" | "broker" | "manager" | "agent";

export const BROKERAGE_ROLE_LABELS: Record<BrokerageRoleType, string> = {
  brokerage_admin: "Admin",
  broker: "Broker",
  manager: "Manager",
  agent: "Agent",
};

export const BROKERAGE_ROLE_COLORS: Record<BrokerageRoleType, string> = {
  brokerage_admin: "bg-purple-100 text-purple-700",
  broker: "bg-blue-100 text-blue-700",
  manager: "bg-teal-100 text-teal-700",
  agent: "bg-slate-100 text-slate-700",
};

export const BMS_PERMISSIONS = {
  // Deal Submissions
  submit_deal: ["brokerage_admin", "broker", "manager", "agent"],
  approve_deal: ["brokerage_admin", "broker"],
  reject_deal: ["brokerage_admin", "broker"],
  delete_submission: ["brokerage_admin", "broker"],
  view_all_submissions: ["brokerage_admin", "broker", "manager"],
  view_own_submissions: ["brokerage_admin", "broker", "manager", "agent"],
  manage_public_link: ["brokerage_admin", "broker"],

  // Invoices
  create_invoice: ["brokerage_admin", "broker"],
  void_invoice: ["brokerage_admin", "broker"],
  delete_invoice: ["brokerage_admin"],
  view_all_invoices: ["brokerage_admin", "broker", "manager"],
  view_own_invoices: ["brokerage_admin", "broker", "manager", "agent"],
  bulk_upload_invoices: ["brokerage_admin", "broker"],

  // Payments
  record_payment: ["brokerage_admin", "broker"],
  delete_payment: ["brokerage_admin"],
  view_payments: ["brokerage_admin", "broker", "manager"],
  export_payments: ["brokerage_admin", "broker"],

  // Commission Plans
  manage_plans: ["brokerage_admin"],
  view_plans: ["brokerage_admin", "broker", "manager"],
  assign_plan: ["brokerage_admin", "broker"],

  // Agents
  manage_agents: ["brokerage_admin", "broker"],
  view_agents: ["brokerage_admin", "broker", "manager"],
  import_agents: ["brokerage_admin", "broker"],

  // Compliance
  manage_compliance: ["brokerage_admin", "broker"],
  view_compliance: ["brokerage_admin", "broker", "manager"],

  // Reports
  view_reports: ["brokerage_admin", "broker", "manager"],
  export_reports: ["brokerage_admin", "broker"],
  view_1099: ["brokerage_admin", "broker"],

  // Dashboard
  view_dashboard: ["brokerage_admin", "broker", "manager"],

  // Transactions
  transactions_view: ["brokerage_admin", "broker", "manager", "agent"],
  transactions_manage: ["brokerage_admin", "broker", "manager"],
  transactions_tasks: ["brokerage_admin", "broker", "manager"],

  // Listings & Properties
  listings_view: ["brokerage_admin", "broker", "manager", "agent"],
  listings_manage: ["brokerage_admin", "broker", "manager"],
  listings_claim: ["brokerage_admin", "broker", "manager", "agent"],
  listings_bulk_upload: ["brokerage_admin", "broker"],
  properties_view: ["brokerage_admin", "broker", "manager", "agent"],
  properties_manage: ["brokerage_admin", "broker", "manager"],

  // Goals & Leaderboard
  goals_view: ["brokerage_admin", "broker", "manager", "agent"],
  goals_manage: ["brokerage_admin", "broker"],
  leaderboard_view: ["brokerage_admin", "broker", "manager", "agent"],

  // Settings
  manage_brokerage_settings: ["brokerage_admin"],
  manage_roles: ["brokerage_admin"],
} as const satisfies Record<string, readonly BrokerageRoleType[]>;

export type BmsPermission = keyof typeof BMS_PERMISSIONS;

// ── Excel Upload ──────────────────────────────────────────────

export interface ExcelDealRow {
  agentName: string;
  propertyAddress: string;
  dealType: string;
  transactionValue: number;
  commissionPct?: number;
  commissionAmount?: number;
  agentSplitPct?: number;
  clientName?: string;
  closingDate?: string;
  notes?: string;
  // Computed fields (populated during validation)
  _totalCommission?: number;
  _agentPayout?: number;
  _housePayout?: number;
  _errors?: string[];
  _rowIndex?: number;
}

export const EXCEL_COLUMN_ALIASES: Record<string, string[]> = {
  agentName: ["agent_name", "agent", "agent name", "salesperson", "rep", "representative"],
  propertyAddress: ["property_address", "address", "property", "location", "property address"],
  dealType: ["deal_type", "type", "transaction_type", "deal type", "trans type"],
  transactionValue: ["transaction_value", "sale_price", "price", "value", "amount", "transaction value", "sale price", "lease value"],
  commissionPct: ["commission_pct", "commission_%", "comm_%", "commission %", "comm %", "commission_percent"],
  commissionAmount: ["commission_amount", "commission_amount", "commission amount", "total commission", "total_commission"],
  agentSplitPct: ["agent_split_pct", "agent_split", "split", "agent split", "agent %", "split %", "split_pct"],
  clientName: ["client_name", "client", "customer", "buyer", "seller", "tenant", "client name"],
  closingDate: ["closing_date", "close_date", "date", "closing", "close date", "closing date", "transaction date"],
  invoiceNumber: ["invoice #", "invoice number", "invoice no", "invoice_number", "invoice_no", "deal id", "deal_id", "listing id", "listing_id", "listing #", "ref", "reference", "deal code", "deal_code", "id"],
  notes: ["notes", "note", "comments", "memo", "remarks"],
};

// ── Label Maps ────────────────────────────────────────────────

export const DEAL_TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  lease: "Lease",
  rental: "Rental",
  commercial_sale: "Commercial Sale",
  commercial_lease: "Commercial Lease",
  land: "Land",
  new_construction: "New Construction",
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
  rejected: "Rejected",
};

export const EXCLUSIVE_TYPE_LABELS: Record<string, string> = {
  brokerage: "Brokerage Exclusive",
  personal: "Personal Exclusive",
};

export const EXCLUSIVE_TYPE_COLORS: Record<string, string> = {
  brokerage: "bg-blue-100 text-blue-700",
  personal: "bg-amber-100 text-amber-700",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

// ── Color Maps (Tailwind classes) ─────────────────────────────

export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-700",
};

export const COMMISSION_PLAN_TYPE_LABELS: Record<string, string> = {
  volume_based: "Volume-Based",
  value_based: "Value-Based",
  flat: "Flat Rate",
};

export const COMMISSION_PLAN_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const COMMISSION_PLAN_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-700",
};

export const COMPLIANCE_DOC_TYPE_LABELS: Record<string, string> = {
  license: "License",
  eo_insurance: "E&O Insurance",
  continuing_education: "Continuing Education",
  background_check: "Background Check",
  other: "Other",
};

export const COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  expiring_soon: "bg-amber-100 text-amber-700",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: "Check",
  ach: "ACH Transfer",
  wire: "Wire Transfer",
  cash: "Cash",
  stripe: "Stripe",
  other: "Other",
};

export const PAYMENT_METHOD_ICONS: Record<string, string> = {
  check: "receipt",
  ach: "building",
  wire: "zap",
  cash: "banknote",
  stripe: "credit-card",
  other: "circle",
};

// ── Audit Log Types ─────────────────────────────────────────

// ── Transaction Types ────────────────────────────────────────

export type TransactionStageType =
  | "submitted"
  | "application"
  | "approved"
  | "lease_signing"
  | "move_in"
  | "offer_accepted"
  | "under_contract"
  | "due_diligence"
  | "closing"
  | "invoice_sent"
  | "payment_received"
  | "agent_paid"
  | "closed"
  | "cancelled";

export type BmsTransactionTypeAlias = "rental" | "sale";

export interface CreateTransactionInput {
  type: BmsTransactionTypeAlias;
  propertyAddress: string;
  propertyUnit?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyName?: string;
  transactionValue?: number;
  commissionAmount?: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  otherPartyName?: string;
  otherPartyEmail?: string;
  otherPartyPhone?: string;
  agentId?: string;
  additionalAgents?: TransactionAgentInput[];
  notes?: string;
  applicationDate?: string;
  closingDate?: string;
  moveInDate?: string;
  leaseStartDate?: string;
}

export interface UpdateTransactionInput {
  propertyAddress?: string;
  propertyUnit?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyName?: string;
  transactionValue?: number;
  commissionAmount?: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  otherPartyName?: string;
  otherPartyEmail?: string;
  otherPartyPhone?: string;
  agentId?: string;
  housePayoutAmount?: number;
  notes?: string;
  applicationDate?: string;
  approvalDate?: string;
  contractDate?: string;
  inspectionDate?: string;
  closingDate?: string;
  moveInDate?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  expirationDate?: string;
}

export interface TransactionTaskRecord {
  id: string;
  transactionId: string;
  title: string;
  description?: string | null;
  stage: TransactionStageType;
  sortOrder: number;
  isCompleted: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AgentPayoutStatus = "pending" | "processing" | "paid";
export type TransactionAgentRole = "primary" | "co_agent" | "referral";

// ── Multi-Agent Deal Split Types ────────────────────────────

export interface TransactionAgentInput {
  agentId: string;
  role?: TransactionAgentRole;
  splitPct?: number;
  payoutAmount?: number;
  notes?: string;
}

export interface TransactionAgentRecord {
  id: string;
  transactionId: string;
  agentId: string;
  role: TransactionAgentRole;
  splitPct?: number | null;
  payoutAmount?: number | null;
  payoutStatus: AgentPayoutStatus;
  payoutDate?: string | null;
  payoutMethod?: string | null;
  payoutReference?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; firstName: string; lastName: string; email: string };
}

export interface CoAgentInput {
  agentId?: string;
  name?: string;
  email?: string;
  splitPct?: number;
  role?: TransactionAgentRole;
}

export const TRANSACTION_AGENT_ROLE_LABELS: Record<string, string> = {
  primary: "Primary",
  co_agent: "Co-Agent",
  referral: "Referral",
};

export const TRANSACTION_AGENT_ROLE_COLORS: Record<string, string> = {
  primary: "bg-blue-100 text-blue-700",
  co_agent: "bg-purple-100 text-purple-700",
  referral: "bg-amber-100 text-amber-700",
};

export interface TransactionRecord {
  id: string;
  orgId: string;
  dealSubmissionId?: string | null;
  agentId?: string | null;
  invoiceId?: string | null;
  type: BmsTransactionTypeAlias;
  stage: TransactionStageType;
  propertyAddress: string;
  propertyUnit?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyName?: string | null;
  transactionValue?: number | null;
  commissionAmount?: number | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  otherPartyName?: string | null;
  otherPartyEmail?: string | null;
  otherPartyPhone?: string | null;
  // Agent payout
  agentSplitPct?: number | null;
  agentPayoutAmount?: number | null;
  housePayoutAmount?: number | null;
  agentPayoutDate?: string | null;
  agentPayoutMethod?: string | null;
  agentPayoutReference?: string | null;
  agentPayoutStatus?: string | null;
  // Lifecycle timestamps
  invoiceCreatedAt?: string | null;
  invoiceSentAt?: string | null;
  commissionReceivedAt?: string | null;
  agentPaidAt?: string | null;
  // Milestone dates
  applicationDate?: string | null;
  approvalDate?: string | null;
  contractDate?: string | null;
  inspectionDate?: string | null;
  closingDate?: string | null;
  moveInDate?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  expirationDate?: string | null;
  actualCloseDate?: string | null;
  notes?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithTasks extends TransactionRecord {
  tasks: TransactionTaskRecord[];
  agent?: { id: string; firstName: string; lastName: string; email: string } | null;
  agents?: TransactionAgentRecord[];
  dealSubmission?: { id: string; propertyAddress: string; status: string } | null;
  invoice?: { id: string; invoiceNumber: string; status: string; totalCommission: number } | null;
  listing?: { id: string; address: string; unit: string | null; status: string } | null;
}

export interface TimelineEvent {
  id: string;
  type: "stage_change" | "task_completed" | "invoice_created" | "invoice_sent" | "payment_received" | "agent_payout" | "deal_submitted" | "deal_approved" | "note" | "status_change";
  title: string;
  description?: string;
  timestamp: string;
  actor?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentPayoutInput {
  amount: number;
  method: string;
  reference?: string;
  date?: string;
}

export interface AgentPayoutSummary {
  totalPaid: number;
  totalPending: number;
  payouts: Array<{
    transactionId: string;
    propertyAddress: string;
    commissionAmount: number;
    agentPayoutAmount: number;
    agentPayoutStatus: string;
    agentPayoutDate?: string;
  }>;
}

export interface TransactionStats {
  total: number;
  byStage: Record<string, number>;
  byType: Record<string, number>;
  avgDaysToClose: number;
  openCount: number;
  closedThisMonth: number;
}

// ── Audit Log Types ─────────────────────────────────────────

export type AuditEntityType =
  | "deal_submission"
  | "invoice"
  | "payment"
  | "agent"
  | "commission_plan"
  | "compliance_doc"
  | "transaction"
  | "listing"
  | "property"
  | "agent_goal"
  | "settings";

export interface AuditLogRecord {
  id: string;
  orgId: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const AUDIT_ENTITY_TYPES: Record<string, string> = {
  deal_submission: "Deal Submission",
  invoice: "Invoice",
  payment: "Payment",
  agent: "Agent",
  commission_plan: "Commission Plan",
  compliance_doc: "Compliance Doc",
  transaction: "Transaction",
  listing: "Listing",
  property: "Property",
  agent_goal: "Agent Goal",
  settings: "Settings",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // CRUD
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",

  // Submission status flow
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  invoiced: "Invoiced",

  // Invoice status flow
  draft: "Draft",
  sent: "Sent",
  paid: "Marked Paid",
  void: "Voided",

  // Agent lifecycle
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  role_updated: "Changed Role",

  // Agent onboarding
  invited: "Invited",
  invite_revoked: "Revoked Invite",
  invite_accepted: "Accepted Invite",

  // Commission plans
  assigned_agents: "Assigned Agents",

  // Settings
  settings_updated: "Updated Settings",

  // Payments
  recorded: "Recorded Payment",

  // Transactions
  stage_advanced: "Advanced Stage",
  stage_reverted: "Reverted Stage",
  cancelled: "Cancelled",
  task_completed: "Completed Task",
  task_uncompleted: "Uncompleted Task",
  task_added: "Added Task",
  task_deleted: "Deleted Task",
  invoice_linked: "Linked Invoice",
  invoice_created_from_tx: "Created Invoice from Transaction",
  commission_received: "Commission Received",
  agent_payout_recorded: "Agent Payout Recorded",
  agent_added_to_split: "Added Agent to Split",
  agent_removed_from_split: "Removed Agent from Split",
  agent_split_updated: "Updated Agent Split",
  transactions_from_invoices: "Created Transactions from Invoices",

  // Listings
  status_advanced: "Advanced Status",
  status_reverted: "Reverted Status",
  claimed: "Claimed Listing",
  assigned: "Assigned Agent",
  off_market: "Taken Off Market",
  leased: "Leased",
  bulk_created_listings: "Bulk Created Listings",

  // Goals & Leaderboard
  goals_set: "Set Goals",
  bulk_goals_set: "Bulk Set Goals",

  // Bulk actions
  bulk_approved: "Bulk Approved",
  bulk_rejected: "Bulk Rejected",
  bulk_submitted: "Bulk Submitted",
  bulk_paid: "Bulk Paid",
  bulk_under_review: "Bulk Under Review",
  bulk_invoiced: "Bulk Invoiced",
};

// ── Listing Types ────────────────────────────────────────────

export type BmsListingStatusType = "available" | "showing" | "application" | "approved" | "leased" | "off_market";
export type BmsListingTypeAlias = "rental" | "sale";
export type BmsCommissionTypeAlias = "one_month" | "percentage" | "flat";

export const LISTING_STATUS_SEQUENCE: BmsListingStatusType[] = [
  "available", "showing", "application", "approved", "leased",
];

export const LISTING_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  showing: "Showing",
  application: "Application",
  approved: "Approved",
  leased: "Leased",
  off_market: "Off Market",
};

export const LISTING_STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-700",
  showing: "bg-blue-100 text-blue-700",
  application: "bg-amber-100 text-amber-700",
  approved: "bg-purple-100 text-purple-700",
  leased: "bg-emerald-100 text-emerald-700",
  off_market: "bg-slate-100 text-slate-500",
};

export const LISTING_TYPE_LABELS: Record<string, string> = {
  rental: "Rental",
  sale: "Sale",
};

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  one_month: "One Month Rent",
  percentage: "Percentage",
  flat: "Flat Fee",
};

export interface BmsPropertyInput {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  managementCo?: string;
  isExclusive?: boolean;
  billingEntityName?: string;
  billingEntityAddress?: string;
  billingEntityEmail?: string;
  billingEntityPhone?: string;
  totalUnits?: number;
  notes?: string;
}

export interface BmsPropertyRecord extends BmsPropertyInput {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  _listingCount?: number;
  _availableCount?: number;
  _leasedCount?: number;
}

export interface BmsListingInput {
  propertyId?: string;
  address: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  type?: BmsListingTypeAlias;
  rentPrice?: number;
  askingPrice?: number;
  bedrooms?: string;
  bathrooms?: string;
  sqft?: number;
  floor?: string;
  description?: string;
  amenities?: string[];
  availableDate?: string;
  commissionType?: BmsCommissionTypeAlias;
  commissionAmount?: number;
  commissionPct?: number;
  agentId?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  notes?: string;
}

export interface BmsListingRecord extends BmsListingInput {
  id: string;
  orgId: string;
  status: BmsListingStatusType;
  daysOnMarket?: number | null;
  showingStartedAt?: string | null;
  applicationAt?: string | null;
  approvedAt?: string | null;
  leasedAt?: string | null;
  offMarketAt?: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; firstName: string; lastName: string; email: string } | null;
  property?: { id: string; name: string; landlordName?: string | null } | null;
  transaction?: { id: string; stage: string } | null;
}

export interface ListingStats {
  total: number;
  available: number;
  showing: number;
  application: number;
  approved: number;
  leasedThisMonth: number;
  byType: Record<string, number>;
}

export interface PropertySummary {
  id: string;
  name: string;
  address?: string | null;
  landlordName?: string | null;
  totalUnits?: number | null;
  listingCount: number;
  availableCount: number;
  leasedCount: number;
  inProgressCount: number;
  occupancyRate: number;
  rentRange?: { min: number; max: number } | null;
}

export interface ListingBulkRow {
  propertyName: string;
  address: string;
  unit?: string;
  rentPrice?: number;
  bedrooms?: string;
  bathrooms?: string;
  sqft?: number;
  availableDate?: string;
  agentName?: string;
  notes?: string;
  _errors?: string[];
  _rowIndex?: number;
  _propertyId?: string;
  _agentId?: string;
}

// ── Leaderboard & Goals Types ────────────────────────────────

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  rank: number;
  previousRank?: number;
  trend: "up" | "down" | "same" | "new";

  dealsClosed: { actual: number; target: number | null; pct: number };
  revenue: { actual: number; target: number | null; pct: number };
  listingsLeased: { actual: number; target: number | null; pct: number };
  listingsAdded: { actual: number; target: number | null; pct: number };

  overallScore: number;
  streak: number;
  badges: Array<{ type: string; name: string; icon: string }>;
}

export interface AgentGoalInput {
  dealsClosedTarget?: number;
  revenueTarget?: number;
  listingsLeasedTarget?: number;
  listingsAddedTarget?: number;
}

export interface AgentGoalRecord {
  id: string;
  orgId: string;
  agentId: string;
  year: number;
  month: number;
  dealsClosedTarget: number | null;
  revenueTarget: number | null;
  listingsLeasedTarget: number | null;
  listingsAddedTarget: number | null;
  customTargets: Record<string, unknown> | null;
  dealsClosedActual: number;
  revenueActual: number;
  listingsLeasedActual: number;
  listingsAddedActual: number;
  lastCalculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; firstName: string; lastName: string; email: string };
}

export interface AgentDashboardData {
  currentGoals: AgentGoalRecord | null;
  currentRank: number;
  totalAgents: number;
  streak: number;
  badges: Array<{ id: string; type: string; name: string; icon: string; earnedAt: string }>;
  monthlyHistory: Array<{
    year: number;
    month: number;
    dealsClosed: number;
    revenue: number;
    hitTargets: boolean;
  }>;
  lifetimeStats: {
    totalDeals: number;
    totalRevenue: number;
    totalListingsLeased: number;
    monthsActive: number;
  };
}

export const LISTING_COLUMN_ALIASES: Record<string, string[]> = {
  propertyName: ["property", "complex", "building", "property name", "building name", "complex name"],
  address: ["address", "unit", "apt", "property address", "unit address", "street address"],
  unit: ["unit", "apt", "apartment", "unit number", "apt #", "suite"],
  rentPrice: ["rent", "rent price", "monthly rent", "price", "asking rent", "monthly"],
  bedrooms: ["bed", "beds", "bedrooms", "br", "bedroom", "bed count"],
  bathrooms: ["bath", "baths", "bathrooms", "ba", "bathroom", "bath count"],
  sqft: ["sqft", "sq ft", "square feet", "square footage", "sf"],
  availableDate: ["available", "available date", "avail date", "vacancy date", "move in", "avail"],
  agentName: ["agent", "agent name", "leasing agent", "assigned agent", "rep"],
  notes: ["notes", "description", "comments", "memo", "remarks"],
};
