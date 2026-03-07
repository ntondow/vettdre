// Transaction Management — Default templates, stage definitions, labels, colors
// NO "use server" — safe for client component imports

import type { TransactionStage, BmsTransactionType } from "@prisma/client";

// ── Stage Sequences ─────────────────────────────────────────

export const RENTAL_STAGES: TransactionStage[] = [
  "submitted",
  "approved",
  "lease_signing",
  "move_in",
  "invoice_sent",
  "payment_received",
  "agent_paid",
  "closed",
];

export const SALE_STAGES: TransactionStage[] = [
  "submitted",
  "approved",
  "under_contract",
  "due_diligence",
  "closing",
  "invoice_sent",
  "payment_received",
  "agent_paid",
  "closed",
];

export function getStagesForType(type: BmsTransactionType): TransactionStage[] {
  return type === "rental" ? RENTAL_STAGES : SALE_STAGES;
}

export function getDefaultStageForType(type: BmsTransactionType): TransactionStage {
  return "submitted";
}

// ── Stage Labels ────────────────────────────────────────────

export const STAGE_LABELS: Record<TransactionStage, string> = {
  submitted: "Submitted",
  application: "Application",
  approved: "Approved",
  lease_signing: "Lease Signing",
  move_in: "Move-In",
  offer_accepted: "Offer Accepted",
  under_contract: "Under Contract",
  due_diligence: "Due Diligence",
  closing: "Closing",
  invoice_sent: "Invoice Sent",
  payment_received: "Payment Received",
  agent_paid: "Agent Paid",
  closed: "Closed",
  cancelled: "Cancelled",
};

// ── Stage Colors ────────────────────────────────────────────

export const STAGE_COLORS: Record<TransactionStage, string> = {
  submitted: "bg-slate-100 text-slate-800",
  application: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  lease_signing: "bg-purple-100 text-purple-800",
  move_in: "bg-amber-100 text-amber-800",
  offer_accepted: "bg-blue-100 text-blue-800",
  under_contract: "bg-indigo-100 text-indigo-800",
  due_diligence: "bg-orange-100 text-orange-800",
  closing: "bg-purple-100 text-purple-800",
  invoice_sent: "bg-cyan-100 text-cyan-800",
  payment_received: "bg-lime-100 text-lime-800",
  agent_paid: "bg-teal-100 text-teal-800",
  closed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

// ── Transaction Type Labels ─────────────────────────────────

export const TRANSACTION_TYPE_LABELS: Record<BmsTransactionType, string> = {
  rental: "Rental",
  sale: "Sale",
};

export const TRANSACTION_TYPE_COLORS: Record<BmsTransactionType, string> = {
  rental: "bg-teal-100 text-teal-800",
  sale: "bg-indigo-100 text-indigo-800",
};

// ── Default Template Tasks ──────────────────────────────────

export interface DefaultTaskDef {
  title: string;
  stage: TransactionStage;
  sortOrder: number;
  isRequired: boolean;
}

// Financial stage tasks shared by both rental and sale
const FINANCIAL_TASKS: DefaultTaskDef[] = [
  { title: "Invoice generated", stage: "invoice_sent", sortOrder: 20, isRequired: true },
  { title: "Invoice sent to landlord/management", stage: "invoice_sent", sortOrder: 21, isRequired: true },
  { title: "Payment received from landlord", stage: "payment_received", sortOrder: 22, isRequired: true },
  { title: "Commission amount verified", stage: "payment_received", sortOrder: 23, isRequired: false },
  { title: "Agent payout calculated", stage: "agent_paid", sortOrder: 24, isRequired: true },
  { title: "Agent payout processed", stage: "agent_paid", sortOrder: 25, isRequired: true },
  { title: "Agent confirmed receipt", stage: "agent_paid", sortOrder: 26, isRequired: false },
];

export const DEFAULT_RENTAL_TASKS: DefaultTaskDef[] = [
  { title: "Application received", stage: "application", sortOrder: 1, isRequired: true },
  { title: "Credit check completed", stage: "application", sortOrder: 2, isRequired: true },
  { title: "Income verification", stage: "application", sortOrder: 3, isRequired: true },
  { title: "References checked", stage: "application", sortOrder: 4, isRequired: false },
  { title: "Landlord approval received", stage: "approved", sortOrder: 5, isRequired: true },
  { title: "Lease drafted", stage: "lease_signing", sortOrder: 6, isRequired: true },
  { title: "Lease reviewed by tenant", stage: "lease_signing", sortOrder: 7, isRequired: false },
  { title: "Lease signed by all parties", stage: "lease_signing", sortOrder: 8, isRequired: true },
  { title: "Security deposit collected", stage: "lease_signing", sortOrder: 9, isRequired: true },
  { title: "First month's rent collected", stage: "lease_signing", sortOrder: 10, isRequired: true },
  { title: "Keys delivered to tenant", stage: "move_in", sortOrder: 11, isRequired: true },
  { title: "Move-in inspection completed", stage: "move_in", sortOrder: 12, isRequired: false },
  ...FINANCIAL_TASKS,
];

export const DEFAULT_SALE_TASKS: DefaultTaskDef[] = [
  { title: "Offer accepted", stage: "offer_accepted", sortOrder: 1, isRequired: true },
  { title: "Attorney retained", stage: "under_contract", sortOrder: 2, isRequired: true },
  { title: "Contract signed", stage: "under_contract", sortOrder: 3, isRequired: true },
  { title: "Title search ordered", stage: "due_diligence", sortOrder: 4, isRequired: true },
  { title: "Title search cleared", stage: "due_diligence", sortOrder: 5, isRequired: true },
  { title: "Home inspection scheduled", stage: "due_diligence", sortOrder: 6, isRequired: false },
  { title: "Home inspection completed", stage: "due_diligence", sortOrder: 7, isRequired: false },
  { title: "Appraisal ordered", stage: "due_diligence", sortOrder: 8, isRequired: true },
  { title: "Appraisal completed", stage: "due_diligence", sortOrder: 9, isRequired: true },
  { title: "Mortgage commitment received", stage: "due_diligence", sortOrder: 10, isRequired: true },
  { title: "Survey completed", stage: "closing", sortOrder: 11, isRequired: false },
  { title: "Final walkthrough", stage: "closing", sortOrder: 12, isRequired: true },
  { title: "Closing scheduled", stage: "closing", sortOrder: 13, isRequired: true },
  { title: "Closing completed", stage: "closing", sortOrder: 14, isRequired: true },
  ...FINANCIAL_TASKS,
];
