// BMS shared types, constants, labels, and Excel column aliases
// NO "use server" — safe for client component imports

// ── Type Aliases ──────────────────────────────────────────────

export type DealType = "sale" | "lease" | "rental" | "commercial_sale" | "commercial_lease" | "land" | "new_construction";
export type CommissionType = "percentage" | "flat";
export type RepresentedSide = "buyer" | "seller" | "landlord" | "tenant";
export type SubmissionStatus = "submitted" | "under_review" | "approved" | "invoiced" | "paid" | "rejected";
export type InvoiceStatusType = "draft" | "sent" | "paid" | "void";
export type SubmissionSource = "internal" | "external";
export type AgentStatus = "active" | "inactive" | "terminated";
export type CommissionPlanType = "volume_based" | "value_based" | "flat";
export type CommissionPlanStatus = "active" | "inactive";

// ── Interfaces ────────────────────────────────────────────────

export interface DealSubmissionInput {
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone?: string;
  agentLicense?: string;

  propertyAddress: string;
  unit?: string;
  city?: string;
  state: string;

  dealType: DealType;
  transactionValue: number;
  closingDate?: string;

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

  notes?: string;
}

export interface DealSubmissionRecord extends DealSubmissionInput {
  id: string;
  orgId: string;
  agentId?: string;
  status: SubmissionStatus;
  rejectionReason?: string;
  submissionSource: SubmissionSource;
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
  status: AgentStatus;
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
  brokerageName: string;
  agentEmail: string;
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

export type AuditEntityType =
  | "deal_submission"
  | "invoice"
  | "payment"
  | "agent"
  | "commission_plan"
  | "compliance_doc"
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

  // Bulk actions
  bulk_approved: "Bulk Approved",
  bulk_rejected: "Bulk Rejected",
  bulk_submitted: "Bulk Submitted",
  bulk_paid: "Bulk Paid",
  bulk_under_review: "Bulk Under Review",
  bulk_invoiced: "Bulk Invoiced",
};
