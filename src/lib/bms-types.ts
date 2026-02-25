// BMS shared types, constants, labels, and Excel column aliases
// NO "use server" — safe for client component imports

// ── Type Aliases ──────────────────────────────────────────────

export type DealType = "sale" | "lease" | "rental";
export type CommissionType = "percentage" | "flat";
export type RepresentedSide = "buyer" | "seller" | "landlord" | "tenant";
export type SubmissionStatus = "submitted" | "under_review" | "approved" | "invoiced" | "paid" | "rejected";
export type InvoiceStatusType = "draft" | "sent" | "paid" | "void";
export type SubmissionSource = "internal" | "external";
export type AgentStatus = "active" | "inactive" | "terminated";

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
