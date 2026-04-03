// ── VettdRE Mobile — Shared Types ─────────────────────────────
// Mirrors Prisma schema models for the mobile app.
// Keep in sync with prisma/schema.prisma in the main repo.

// ── Enums ─────────────────────────────────────────────────────

export type UserRole = "admin" | "agent" | "super_admin";
export type UserPlan = "free" | "explorer" | "pro" | "team" | "enterprise";
export type OrgTier = "solo" | "team" | "enterprise" | "premium";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";
export type BmsDealType = "sale" | "lease" | "rental";
export type OnboardingStatus = "draft" | "pending" | "partially_signed" | "completed" | "expired" | "voided";
export type SigningStatus = "pending" | "viewed" | "signed" | "rejected" | "expired";
export type BrokerageRole = "owner" | "admin" | "manager" | "agent";
export type TaskType = "follow_up" | "call" | "email" | "meeting" | "inspection" | "other";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type DealSubmissionStatus = "submitted" | "approved" | "rejected" | "invoiced" | "paid";
export type CalendarEventType =
  | "showing"
  | "meeting"
  | "open_house"
  | "inspection"
  | "closing"
  | "task_deadline"
  | "deal_milestone"
  | "general";

// ── Core Models ───────────────────────────────────────────────

export interface User {
  id: string;
  orgId: string;
  authProviderId: string | null;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  phone: string | null;
  timezone: string;
  title: string | null;
  licenseNumber: string | null;
  brokerage: string | null;
  plan: UserPlan;
  isActive: boolean;
  isApproved: boolean;
  lastLoginAt: string | null;
  teamId: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: OrgTier;
  subscriptionStatus: SubscriptionStatus;
  logoUrl: string | null;
  phone: string | null;
  bmsSettings: Record<string, unknown> | null;
  submissionToken: string | null;
}

export interface BrokerAgent {
  id: string;
  orgId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  defaultSplitPct: number;
  status: string;
  brokerageRole: BrokerageRole;
  commissionPlanId: string | null;
  createdAt: string;
}

// ── Client Onboarding ─────────────────────────────────────────

export interface ClientOnboarding {
  id: string;
  orgId: string;
  agentId: string;
  contactId: string | null;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string | null;
  dealType: string | null;
  propertyAddress: string | null;
  exclusiveType: string | null;
  status: OnboardingStatus;
  token: string;
  expiresAt: string | null;
  sentAt: string | null;
  sentVia: string | null;
  completedAt: string | null;
  allDocsSigned: boolean;
  commissionPct: number | null;
  commissionFlat: number | null;
  monthlyRent: number | null;
  notes: string | null;
  documents?: OnboardingDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDocument {
  id: string;
  onboardingId: string;
  docType: string;
  title: string;
  version: number;
  pdfUrl: string | null;
  status: SigningStatus;
  signedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

// ── Deals & Earnings ──────────────────────────────────────────

export interface DealSubmission {
  id: string;
  orgId: string;
  agentId: string | null;
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  propertyAddress: string;
  unit: string | null;
  dealType: BmsDealType;
  transactionValue: number;
  closingDate: string | null;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;
  clientName: string | null;
  status: DealSubmissionStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EarningsPeriod = "week" | "month" | "quarter" | "year" | "all";

// Matches the response from /api/mobile/earnings
export interface EarningsSummary {
  period: string;
  totalEarnings: number;
  pendingPayouts: number;
  closedDeals: number;
  activeListings: number;
  trend: number;
  closeRate: number;
  recentPayments: RecentPayment[];
}

export interface RecentPayment {
  id: string;
  amount: number;
  date: string | null;
  method: string;
  property: string;
  invoiceNumber: string | null;
}

// ── Calendar & Tasks ──────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  eventType: CalendarEventType;
  contactId: string | null;
  propertyAddress: string | null;
  status: string;
  color: string;
  attendees: Array<{ email: string; name?: string }> | null;
}

export interface Task {
  id: string;
  orgId: string;
  contactId: string | null;
  dealId: string | null;
  assignedTo: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  dueAt: string | null;
  status: TaskStatus;
  completedAt: string | null;
  isAiGenerated: boolean;
  createdAt: string;
}

// ── Building Intelligence (Scout) ─────────────────────────────

export interface BuildingProfile {
  bbl: string;
  address: string;
  borough: string;
  neighborhood: string;
  zipCode: string;
  // MapPLUTO
  buildingClass: string;
  buildingClassDesc: string;
  yearBuilt: number;
  numFloors: number;
  unitsTotal: number;
  unitsRes: number;
  lotArea: number;
  bldgArea: number;
  zoneDist1: string;
  builtFAR: number;
  maxFAR: number;
  assessTotal: number;
  ownerName: string;
  // ACRIS
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  mortgageAmount: number | null;
  mortgageLender: string | null;
  // HPD
  hpdViolations: { open: number; total: number; classA?: number; classB?: number; classC?: number };
  hpdComplaints: { open: number; total: number; recent?: number; topTypes?: string[] };
  // Raw profile fields (from data-fusion-engine)
  violationSummary?: { open: number; total: number; classA: number; classB: number; classC: number };
  complaintSummary?: { total: number; recent: number; topTypes: string[] };
  rentStabilized: boolean;
  rsUnits: number | null;
  // DOB
  activePermits: number;
  recentPermits: Array<{
    type: string;
    filed: string;
    description: string;
  }>;
  // AI Analysis
  aiNotes: string | null;
  ownerConfidence: number;
  distressScore: number;
  distressSignals?: string[];
  rankedContacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
    source?: string;
  }>;
  // Raw PLUTO data passthrough
  pluto?: Record<string, string>;
}

// ── Notifications ─────────────────────────────────────────────

export type NotificationType =
  | "client_signed"
  | "client_viewed"
  | "new_lead"
  | "deal_approved"
  | "deal_paid"
  | "compliance_expiry"
  | "stage_change"
  | "task_overdue";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  entityId?: string;
  entityType?: string;
}

// ── Auth Context ──────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  org: Organization | null;
  agent: BrokerAgent | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
