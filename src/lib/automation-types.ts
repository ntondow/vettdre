// ============================================================
// Automations Engine — Type Definitions
// ============================================================

import type { AutomationTrigger } from "@prisma/client";

// ── Trigger Configs ─────────────────────────────────────────
// Stored in Automation.triggerConfig JSON column

export interface TriggerConfigNewLead {
  sourceFilter?: string[];       // only trigger for these sources
  contactTypeFilter?: string[];  // only trigger for these contact types
}

export interface TriggerConfigStageChange {
  stageFilter?: string[];        // trigger when moving TO these stages
}

export interface TriggerConfigNoActivity {
  daysSinceContact: number;      // e.g. 7 — trigger after N days without activity
  excludeTags?: string[];        // skip contacts with these tags
}

export interface TriggerConfigTaskOverdue {
  hoursOverdue: number;          // e.g. 1 — trigger N hours after dueAt
  taskTypes?: string[];          // specific TaskType values, empty = all
}

export interface TriggerConfigShowingCompleted {
  propertyFilter?: string[];     // property addresses to filter
}

export interface TriggerConfigEmailReceived {
  includeLeadEmails?: boolean;   // only trigger for detected leads
  excludeFromEmails?: string[];  // skip these sender addresses
}

export interface TriggerConfigDealWon {
  // No config needed — triggered on any closed deal
}

export interface TriggerConfigDealLost {
  // No config needed — triggered on any cancelled deal
}

export interface TriggerConfigScoreChange {
  minScoreDelta?: number;        // only trigger if score moved at least N points
  scoreThreshold?: number;       // only if new score >= threshold
}

export interface TriggerConfigContactEnriched {
  // No config needed — triggered on any enrichment completion
}

export interface TriggerConfigScreeningCompleted {
  minRiskScore?: number;         // only trigger if risk score >= threshold
  recommendations?: string[];    // filter by recommendation (approve, conditional, decline)
  tierFilter?: string[];         // filter by screening tier (base, enhanced)
}

export type TriggerConfig =
  | TriggerConfigNewLead
  | TriggerConfigStageChange
  | TriggerConfigNoActivity
  | TriggerConfigTaskOverdue
  | TriggerConfigShowingCompleted
  | TriggerConfigEmailReceived
  | TriggerConfigDealWon
  | TriggerConfigDealLost
  | TriggerConfigScoreChange
  | TriggerConfigContactEnriched
  | TriggerConfigScreeningCompleted
  | Record<string, unknown>;

// ── Conditions ──────────────────────────────────────────────
// Stored in Automation.conditions JSON column

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";

export interface ConditionRule {
  field: string;                           // dot-notation: "source", "qualificationScore"
  operator: ConditionOperator;
  value?: string | number | boolean | null;
}

export interface ConditionGroup {
  rules: ConditionRule[];
  logicalOp: "AND" | "OR";                // combine rules within group
}

// Groups combined with AND between them
export type Conditions = ConditionGroup[];

// ── Actions ─────────────────────────────────────────────────
// Stored in Automation.actions JSON column

export type ActionType =
  | "create_task"
  | "update_contact_status"
  | "send_notification"
  | "send_email"
  | "ai_generate_email"
  | "add_tag";

export interface ActionCreateTask {
  type: "create_task";
  title: string;                           // supports {{contactName}}, {{source}}, etc.
  description?: string;
  priority: "low" | "medium" | "high";
  dueInDays?: number;                      // null = no due date
  assignTo?: "contact_agent" | "automation_creator";
  delay?: ActionDelay;
}

export interface ActionUpdateContactStatus {
  type: "update_contact_status";
  newStatus: string;                       // ContactStatus enum value
  delay?: ActionDelay;
}

export interface ActionSendNotification {
  type: "send_notification";
  title: string;                           // supports template tokens
  body: string;
  delay?: ActionDelay;
}

export interface ActionSendEmail {
  type: "send_email";
  to: string;                              // email address or {{email}} template token
  subject: string;                         // supports template tokens
  bodyHtml: string;                        // supports template tokens
  delay?: ActionDelay;
}

export interface ActionAiGenerateEmail {
  type: "ai_generate_email";
  prompt: string;                          // instructions for AI (supports template tokens)
  tone?: "professional" | "friendly" | "urgent";
  sendAfterGeneration?: boolean;           // true = auto-send, false = create draft task
  delay?: ActionDelay;
}

export interface ActionAddTag {
  type: "add_tag";
  tags: string[];
  delay?: ActionDelay;
}

// ── Delay Support ───────────────────────────────────────────

export interface ActionDelay {
  value: number;
  unit: "minutes" | "hours" | "days";
}

export type AutomationAction =
  | ActionCreateTask
  | ActionUpdateContactStatus
  | ActionSendNotification
  | ActionSendEmail
  | ActionAiGenerateEmail
  | ActionAddTag;

// ── Trigger Data ────────────────────────────────────────────
// Passed to dispatcher at fire points

export interface TriggerDataNewLead {
  contactId: string;
  firstName: string;
  lastName: string;
  source?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
}

export interface TriggerDataStageChange {
  dealId: string;
  newStage: string;
  previousStage: string;
  transactionValue?: number | null;
  updatedAt: string;
}

export interface TriggerDataNoActivity {
  contactId: string;
  firstName: string;
  lastName: string;
  lastActivityAt?: string | null;
  daysSinceActivity: number;
  tags: string[];
}

export interface TriggerDataTaskOverdue {
  taskId: string;
  title: string;
  contactId?: string | null;
  dueAt: string;
  hoursOverdue: number;
  priority: string;
  status: string;
}

export interface TriggerDataShowingCompleted {
  showingSlotId: string;
  contactId: string;
  propertyAddress: string;
}

export interface TriggerDataEmailReceived {
  contactId?: string;
  emailMessageId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  category: string | null;
  sentimentScore: number | null;
}

export interface TriggerDataDealWon {
  dealId: string;
  transactionValue?: number | null;
  dealAddress?: string | null;
}

export interface TriggerDataDealLost {
  dealId: string;
  dealAddress?: string | null;
  cancelReason?: string | null;
}

export interface TriggerDataScoreChange {
  contactId: string;
  firstName: string;
  lastName: string;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
}

export interface TriggerDataContactEnriched {
  contactId: string;
  firstName: string;
  lastName: string;
  enrichmentType: string;
  confidenceLevel: string;
}

export interface TriggerDataScreeningCompleted {
  applicationId: string;
  contactId: string | null;
  agentUserId: string;
  riskScore: number | null;
  recommendation: string | null;
  propertyAddress: string;
}

export type TriggerData =
  | TriggerDataNewLead
  | TriggerDataStageChange
  | TriggerDataNoActivity
  | TriggerDataTaskOverdue
  | TriggerDataShowingCompleted
  | TriggerDataEmailReceived
  | TriggerDataDealWon
  | TriggerDataDealLost
  | TriggerDataScoreChange
  | TriggerDataContactEnriched
  | TriggerDataScreeningCompleted
  | Record<string, unknown>;

// ── Execution Results ───────────────────────────────────────

export interface ActionResult {
  action: AutomationAction;
  success: boolean;
  error?: string;
  resultData?: Record<string, unknown>;
}

export interface ExecutionResult {
  actionResults: ActionResult[];
  status: "success" | "partial" | "failed";
  errorMessage?: string;
}

// ── Dispatch Result ─────────────────────────────────────────

export interface DispatchResult {
  matchedCount: number;
  executedCount: number;
  errors: string[];
}

// ── Serialized Automation (server → client) ─────────────────

export interface AutomationSummary {
  id: string;
  name: string;
  description: string | null;
  triggerType: AutomationTrigger;
  isActive: boolean;
  runsCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface AutomationFull extends AutomationSummary {
  triggerConfig: TriggerConfig;
  conditions: Conditions;
  actions: AutomationAction[];
}

// ── UI Constants ────────────────────────────────────────────

export const TRIGGER_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  stage_change: "Stage Change",
  score_change: "Score Change",
  no_activity: "No Activity",
  task_overdue: "Task Overdue",
  showing_completed: "Showing Completed",
  email_received: "Email Received",
  deal_won: "Deal Won",
  deal_lost: "Deal Lost",
  contact_enriched: "Contact Enriched",
  screening_completed: "Screening Completed",
  custom: "Custom",
};

export const TRIGGER_COLORS: Record<string, string> = {
  new_lead: "bg-emerald-500/15 text-emerald-400",
  stage_change: "bg-blue-500/15 text-blue-400",
  no_activity: "bg-amber-500/15 text-amber-400",
  task_overdue: "bg-red-500/15 text-red-400",
  showing_completed: "bg-cyan-500/15 text-cyan-400",
  score_change: "bg-purple-500/15 text-purple-400",
  email_received: "bg-indigo-500/15 text-indigo-400",
  deal_won: "bg-green-500/15 text-green-400",
  deal_lost: "bg-rose-500/15 text-rose-400",
  contact_enriched: "bg-teal-500/15 text-teal-400",
  screening_completed: "bg-violet-500/15 text-violet-400",
  custom: "bg-slate-500/15 text-slate-400",
};

export const ACTION_LABELS: Record<string, string> = {
  create_task: "Create Task",
  update_contact_status: "Update Contact Status",
  send_notification: "Send Notification",
  send_email: "Send Email",
  ai_generate_email: "AI Generate Email",
  add_tag: "Add Tag",
};

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  greater_than: "greater than",
  less_than: "less than",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

export const CONDITION_FIELDS = [
  { value: "source", label: "Source", type: "string" as const },
  { value: "firstName", label: "First Name", type: "string" as const },
  { value: "lastName", label: "Last Name", type: "string" as const },
  { value: "email", label: "Email", type: "string" as const },
  { value: "phone", label: "Phone", type: "string" as const },
  { value: "qualificationScore", label: "Qualification Score", type: "number" as const },
  { value: "daysSinceActivity", label: "Days Since Activity", type: "number" as const },
  { value: "newStage", label: "New Stage", type: "string" as const },
  { value: "previousStage", label: "Previous Stage", type: "string" as const },
  { value: "priority", label: "Priority", type: "string" as const },
  { value: "hoursOverdue", label: "Hours Overdue", type: "number" as const },
  { value: "propertyAddress", label: "Property Address", type: "string" as const },
  // Email Received fields
  { value: "fromEmail", label: "From Email", type: "string" as const },
  { value: "subject", label: "Email Subject", type: "string" as const },
  { value: "category", label: "Email Category", type: "string" as const },
  { value: "sentimentScore", label: "Sentiment Score", type: "number" as const },
  // Score Change fields
  { value: "newScore", label: "New Score", type: "number" as const },
  { value: "previousScore", label: "Previous Score", type: "number" as const },
  { value: "scoreDelta", label: "Score Delta", type: "number" as const },
  // Deal fields
  { value: "transactionValue", label: "Transaction Value", type: "number" as const },
  { value: "dealAddress", label: "Deal Address", type: "string" as const },
  // Enrichment fields
  { value: "enrichmentType", label: "Enrichment Type", type: "string" as const },
  { value: "confidenceLevel", label: "Confidence Level", type: "string" as const },
  // Screening fields
  { value: "riskScore", label: "Risk Score", type: "number" as const },
  { value: "recommendation", label: "Recommendation", type: "string" as const },
];
