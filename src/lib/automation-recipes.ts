// ============================================================
// Automation Recipes — Pre-Built Templates
// ============================================================

import type {
  AutomationAction,
  Conditions,
  TriggerConfig,
} from "./automation-types";
import type { AutomationTrigger } from "@prisma/client";

export interface AutomationRecipe {
  id: string;
  name: string;
  description: string;
  category: RecipeCategory;
  triggerType: AutomationTrigger;
  triggerConfig: TriggerConfig;
  conditions: Conditions;
  actions: AutomationAction[];
}

export type RecipeCategory =
  | "lead_management"
  | "follow_up"
  | "deal_pipeline"
  | "engagement";

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  lead_management: "Lead Management",
  follow_up: "Follow-Up",
  deal_pipeline: "Deal Pipeline",
  engagement: "Engagement",
};

// ── Recipes ─────────────────────────────────────────────────

export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  // 1. New Lead Welcome
  {
    id: "new-lead-welcome",
    name: "New Lead Welcome",
    description:
      "Send a welcome email to every new lead that enters your CRM.",
    category: "lead_management",
    triggerType: "new_lead",
    triggerConfig: {},
    conditions: [],
    actions: [
      {
        type: "send_email",
        to: "{{email}}",
        subject: "Thanks for reaching out, {{firstName}}!",
        bodyHtml:
          "<p>Hi {{firstName}},</p><p>Thank you for your interest! I'd love to learn more about what you're looking for. Feel free to reply to this email or give me a call anytime.</p><p>Looking forward to connecting!</p>",
      },
    ],
  },

  // 2. Stale Lead Reactivation
  {
    id: "stale-lead-reactivation",
    name: "Stale Lead Reactivation",
    description:
      "Tag and create a follow-up task when a lead has been inactive for 7+ days.",
    category: "lead_management",
    triggerType: "no_activity",
    triggerConfig: { daysSinceContact: 7 },
    conditions: [],
    actions: [
      {
        type: "add_tag",
        tags: ["stale-lead"],
      },
      {
        type: "create_task",
        title: "Follow up with {{contactName}} — inactive 7+ days",
        description:
          "{{contactName}} hasn't had activity in over a week. Reach out to re-engage.",
        priority: "high",
        dueInDays: 1,
      },
    ],
  },

  // 3. Post-Showing Thank You
  {
    id: "post-showing-thank-you",
    name: "Post-Showing Thank You",
    description:
      "Send a thank-you email one day after a showing is completed.",
    category: "follow_up",
    triggerType: "showing_completed",
    triggerConfig: {},
    conditions: [],
    actions: [
      {
        type: "send_email",
        to: "{{email}}",
        subject: "Great meeting you at {{propertyAddress}}!",
        bodyHtml:
          "<p>Hi {{firstName}},</p><p>It was great showing you the property at {{propertyAddress}} yesterday. I hope you found it interesting!</p><p>If you have any questions or would like to schedule another visit, don't hesitate to reach out.</p><p>Best regards</p>",
        delay: { value: 1, unit: "days" },
      },
    ],
  },

  // 4. Deal Won Notification
  {
    id: "deal-won-notification",
    name: "Deal Won Celebration",
    description:
      "Create a high-priority task to celebrate and process a closed deal.",
    category: "deal_pipeline",
    triggerType: "deal_won",
    triggerConfig: {},
    conditions: [],
    actions: [
      {
        type: "create_task",
        title: "Deal Won — Process closing paperwork",
        description:
          "Congratulations! Deal has been closed. Process closing paperwork, schedule key handoff, and update commission records.",
        priority: "high",
        dueInDays: 2,
      },
    ],
  },

  // 5. High-Value Lead Alert
  {
    id: "high-value-lead-alert",
    name: "High-Value Lead Alert",
    description:
      "Tag and prioritize leads from StreetEasy or referral sources.",
    category: "lead_management",
    triggerType: "new_lead",
    triggerConfig: { sourceFilter: ["streeteasy", "referral"] },
    conditions: [
      {
        rules: [
          {
            field: "source",
            operator: "contains",
            value: "streeteasy",
          },
        ],
        logicalOp: "OR",
      },
    ],
    actions: [
      {
        type: "add_tag",
        tags: ["high-value", "priority-follow-up"],
      },
      {
        type: "create_task",
        title: "High-value lead: {{contactName}} from {{source}}",
        description:
          "New lead from premium source ({{source}}). Prioritize immediate outreach.",
        priority: "high",
        dueInDays: 0,
      },
    ],
  },

  // 6. Dormant Contact Archive
  {
    id: "dormant-contact-archive",
    name: "Dormant Contact Archive",
    description:
      "Archive contacts with no activity for 30+ days and tag them.",
    category: "engagement",
    triggerType: "no_activity",
    triggerConfig: { daysSinceContact: 30 },
    conditions: [],
    actions: [
      {
        type: "add_tag",
        tags: ["dormant"],
      },
      {
        type: "update_contact_status",
        newStatus: "archived",
        delay: { value: 2, unit: "days" },
      },
    ],
  },

  // 7. Capture Lead from Email
  {
    id: "capture-lead-from-email",
    name: "Capture Lead from Email",
    description:
      "Create a follow-up task when an inbound email is categorized as a lead.",
    category: "lead_management",
    triggerType: "email_received",
    triggerConfig: { includeLeadEmails: true },
    conditions: [
      {
        rules: [
          {
            field: "category",
            operator: "equals",
            value: "lead",
          },
        ],
        logicalOp: "AND",
      },
    ],
    actions: [
      {
        type: "create_task",
        title: "New lead email from {{fromName}} — {{subject}}",
        description:
          "Inbound email detected as a lead from {{fromEmail}}. Review and respond promptly.",
        priority: "high",
        dueInDays: 0,
      },
    ],
  },

  // 8. Score Milestone Alert
  {
    id: "score-milestone-alert",
    name: "Score Milestone Alert",
    description:
      "Tag contacts and create a task when qualification score exceeds 80.",
    category: "engagement",
    triggerType: "score_change",
    triggerConfig: { scoreThreshold: 80 },
    conditions: [
      {
        rules: [
          {
            field: "newScore",
            operator: "greater_than",
            value: 80,
          },
        ],
        logicalOp: "AND",
      },
    ],
    actions: [
      {
        type: "add_tag",
        tags: ["hot-lead", "score-80-plus"],
      },
      {
        type: "create_task",
        title: "Hot lead: {{firstName}} {{lastName}} — Score {{newScore}}",
        description:
          "Contact's qualification score jumped to {{newScore}} (was {{previousScore}}). This is a high-potential lead — prioritize outreach.",
        priority: "high",
        dueInDays: 0,
      },
    ],
  },

  // 9. Enrichment Verification
  {
    id: "enrichment-verification",
    name: "Enrichment Verification",
    description:
      "Create a task to verify and review newly enriched contact data.",
    category: "engagement",
    triggerType: "contact_enriched",
    triggerConfig: {},
    conditions: [],
    actions: [
      {
        type: "create_task",
        title: "Verify enrichment for {{firstName}} {{lastName}}",
        description:
          "Contact was enriched via {{enrichmentType}} (confidence: {{confidenceLevel}}). Review the new data and update the contact record if needed.",
        priority: "low",
        dueInDays: 3,
      },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────

export function getRecipeById(id: string): AutomationRecipe | undefined {
  return AUTOMATION_RECIPES.find((r) => r.id === id);
}

export function getRecipesByCategory(
  category: RecipeCategory,
): AutomationRecipe[] {
  return AUTOMATION_RECIPES.filter((r) => r.category === category);
}

export function getAllRecipeCategories(): RecipeCategory[] {
  return [...new Set(AUTOMATION_RECIPES.map((r) => r.category))];
}
