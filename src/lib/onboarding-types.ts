// Client Onboarding types, constants, and display helpers
// NO "use server" — safe for client component imports

// ── Type Aliases ──────────────────────────────────────────────

export type OnboardingStatusType =
  | "draft"
  | "pending"
  | "partially_signed"
  | "completed"
  | "expired"
  | "voided";

export type OnboardingDocTypeValue =
  | "tenant_rep_agreement"
  | "nys_disclosure"
  | "fair_housing_notice";

export type SigningStatusType = "pending" | "viewed" | "signed";

export type DeliveryMethod = "email" | "sms" | "link";

// ── Input Interfaces ──────────────────────────────────────────

export interface ClientOnboardingInput {
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone?: string;

  // Deal context (optional — can be filled later)
  dealType?: string;
  propertyAddress?: string;
  exclusiveType?: string;

  // Commission snapshot
  commissionPct?: number;
  monthlyRent?: number;

  // Delivery
  deliveryMethod?: DeliveryMethod;
  expiresInDays?: number; // default 7

  // Optional
  notes?: string;
}

export interface SignDocumentInput {
  documentId: string;
  signatureData: string; // base64 signature image or typed name
  signerName: string;
  signerEmail: string;
}

// ── Record Interfaces ─────────────────────────────────────────

export interface ClientOnboardingRecord {
  id: string;
  orgId: string;
  agentId: string;
  contactId?: string | null;

  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone?: string | null;

  dealType?: string | null;
  propertyAddress?: string | null;
  exclusiveType?: string | null;

  status: OnboardingStatusType;
  token: string;
  expiresAt?: string | null;
  sentAt?: string | null;
  sentVia?: string | null;

  completedAt?: string | null;
  allDocsSigned: boolean;

  commissionPct?: number | null;
  monthlyRent?: number | null;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;

  // Nested relations
  documents?: OnboardingDocumentRecord[];
  agent?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  };
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  _auditLogCount?: number;
}

export interface OnboardingDocumentRecord {
  id: string;
  onboardingId: string;

  docType: OnboardingDocTypeValue;
  title: string;
  version: number;

  templateHtml?: string | null;
  pdfUrl?: string | null;

  status: SigningStatusType;
  signedAt?: string | null;
  signedIp?: string | null;
  signatureData?: string | null;

  sortOrder: number;

  createdAt: string;
  updatedAt: string;

  auditLogs?: SigningAuditLogRecord[];
}

export interface SigningAuditLogRecord {
  id: string;
  onboardingId: string;
  documentId?: string | null;

  action: string;
  actorType: string;
  actorId?: string | null;
  actorName?: string | null;

  ipAddress?: string | null;
  userAgent?: string | null;

  metadata?: Record<string, unknown> | null;

  createdAt: string;
}

// ── Display Labels ────────────────────────────────────────────

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatusType, string> = {
  draft: "Draft",
  pending: "Pending Signature",
  partially_signed: "Partially Signed",
  completed: "Completed",
  expired: "Expired",
  voided: "Voided",
};

export const ONBOARDING_STATUS_COLORS: Record<OnboardingStatusType, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-blue-100 text-blue-700",
  partially_signed: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  expired: "bg-slate-100 text-slate-500",
  voided: "bg-red-100 text-red-700",
};

export const DOC_TYPE_LABELS: Record<OnboardingDocTypeValue, string> = {
  tenant_rep_agreement: "Tenant Representation Agreement",
  nys_disclosure: "NYS Agency Disclosure (DOS 1736)",
  fair_housing_notice: "Fair Housing Notice",
};

export const SIGNING_STATUS_LABELS: Record<SigningStatusType, string> = {
  pending: "Pending",
  viewed: "Viewed",
  signed: "Signed",
};

export const SIGNING_STATUS_COLORS: Record<SigningStatusType, string> = {
  pending: "bg-slate-100 text-slate-600",
  viewed: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  email: "Email",
  sms: "SMS",
  link: "Copy Link",
};
