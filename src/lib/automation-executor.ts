// ============================================================
// Automations Engine — Action Executor
// ============================================================

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/gmail-send";
import { generateEmailWithAI } from "@/lib/ai-action-generator";
import type {
  AutomationAction,
  ActionResult,
  ExecutionResult,
  TriggerData,
  ActionDelay,
} from "./automation-types";

/**
 * Execute an array of actions sequentially.
 * Supports partial success — continues even if an action fails.
 */
export async function executeActions(
  orgId: string,
  automationId: string,
  automationName: string,
  actions: unknown,
  triggerData: TriggerData,
  contactId?: string,
  dealId?: string,
): Promise<ExecutionResult> {
  const actionList = Array.isArray(actions) ? (actions as AutomationAction[]) : [];
  const results: ActionResult[] = [];
  let failedCount = 0;

  for (const action of actionList) {
    try {
      const result = await executeSingleAction(
        orgId,
        automationId,
        automationName,
        action,
        triggerData,
        contactId,
        dealId,
      );
      results.push(result);
      if (!result.success) failedCount++;
    } catch (error) {
      results.push({
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failedCount++;
    }
  }

  const status =
    failedCount === 0
      ? "success"
      : failedCount === results.length
        ? "failed"
        : "partial";

  return {
    actionResults: results,
    status,
    errorMessage:
      failedCount > 0
        ? `${failedCount}/${results.length} actions failed`
        : undefined,
  };
}

// ── Action Router ───────────────────────────────────────────

export async function executeSingleAction(
  orgId: string,
  automationId: string,
  automationName: string,
  action: AutomationAction,
  triggerData: TriggerData,
  contactId?: string,
  dealId?: string,
): Promise<ActionResult> {
  // Check for delay — if present, schedule for later instead of executing now
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delay = (action as any).delay as ActionDelay | undefined;
  if (delay && delay.value > 0) {
    return scheduleDelayedAction(orgId, automationId, action, triggerData, delay, contactId, dealId);
  }

  switch (action.type) {
    case "create_task":
      return executeCreateTask(orgId, automationId, automationName, action, triggerData, contactId, dealId);
    case "update_contact_status":
      return executeUpdateContactStatus(action, contactId);
    case "send_notification":
      return executeSendNotification(orgId, automationName, action, triggerData);
    case "send_email":
      return executeSendEmail(orgId, automationId, action, triggerData, contactId);
    case "ai_generate_email":
      return executeAiGenerateEmail(orgId, automationId, automationName, action, triggerData, contactId);
    case "add_tag":
      return executeAddTag(action, contactId);
    default:
      return {
        action,
        success: false,
        error: `Unknown action type: ${(action as { type: string }).type}`,
      };
  }
}

// ── Action: create_task ─────────────────────────────────────

async function executeCreateTask(
  orgId: string,
  automationId: string,
  automationName: string,
  action: AutomationAction & { type: "create_task" },
  triggerData: TriggerData,
  contactId?: string,
  dealId?: string,
): Promise<ActionResult> {
  const title = interpolateTemplate(action.title, triggerData);
  const description = action.description
    ? interpolateTemplate(action.description, triggerData)
    : undefined;

  let dueAt: Date | undefined;
  if (action.dueInDays && action.dueInDays > 0) {
    dueAt = new Date(Date.now() + action.dueInDays * 86_400_000);
  }

  try {
    const task = await prisma.task.create({
      data: {
        orgId,
        contactId: contactId || undefined,
        dealId: dealId || undefined,
        title,
        description,
        priority: action.priority || "medium",
        dueAt,
        status: "pending",
        isAiGenerated: true,
        aiReasoning: `Automation "${automationName}" (${automationId})`,
      },
    });

    return {
      action,
      success: true,
      resultData: { taskId: task.id },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Action: update_contact_status ───────────────────────────

async function executeUpdateContactStatus(
  action: AutomationAction & { type: "update_contact_status" },
  contactId?: string,
): Promise<ActionResult> {
  if (!contactId) {
    return { action, success: false, error: "update_contact_status requires a contactId" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: { status: action.newStatus as any },
      select: { id: true, status: true },
    });

    return {
      action,
      success: true,
      resultData: { contactId: contact.id, newStatus: contact.status },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Action: send_notification ───────────────────────────────

async function executeSendNotification(
  orgId: string,
  automationName: string,
  action: AutomationAction & { type: "send_notification" },
  triggerData: TriggerData,
): Promise<ActionResult> {
  const title = interpolateTemplate(action.title, triggerData);
  const body = interpolateTemplate(action.body, triggerData);

  // MVP: log to console. Phase 2 will use push-notifications.ts
  console.log(
    `[automation:notification] org=${orgId} automation="${automationName}" title="${title}" body="${body}"`,
  );

  return {
    action,
    success: true,
    resultData: { title, body, method: "console" },
  };
}

// ── Action: add_tag ─────────────────────────────────────────

async function executeAddTag(
  action: AutomationAction & { type: "add_tag" },
  contactId?: string,
): Promise<ActionResult> {
  if (!contactId) {
    return { action, success: false, error: "add_tag requires a contactId" };
  }

  if (!Array.isArray(action.tags) || action.tags.length === 0) {
    return { action, success: false, error: "add_tag requires at least one tag" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { tags: true },
    });

    if (!contact) {
      return { action, success: false, error: `Contact not found: ${contactId}` };
    }

    const merged = Array.from(new Set([...contact.tags, ...action.tags]));

    await prisma.contact.update({
      where: { id: contactId },
      data: { tags: merged },
    });

    return {
      action,
      success: true,
      resultData: { tags: merged },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Action: send_email ──────────────────────────────────────

async function executeSendEmail(
  orgId: string,
  automationId: string,
  action: AutomationAction & { type: "send_email" },
  triggerData: TriggerData,
  contactId?: string,
): Promise<ActionResult> {
  const to = interpolateTemplate(action.to, triggerData);
  const subject = interpolateTemplate(action.subject, triggerData);
  const bodyHtml = interpolateTemplate(action.bodyHtml, triggerData);

  if (!to || !to.includes("@")) {
    return { action, success: false, error: "send_email: no valid recipient email (check {{email}} token or contact has no email)" };
  }

  try {
    // Find the Gmail account for the automation creator
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
      select: { createdBy: true },
    });

    if (!automation?.createdBy) {
      return { action, success: false, error: "send_email: automation has no creator — cannot determine sender Gmail account" };
    }

    const gmailAccount = await prisma.gmailAccount.findFirst({
      where: { userId: automation.createdBy },
      select: { id: true },
    });

    if (!gmailAccount) {
      return { action, success: false, error: "send_email: automation creator has no linked Gmail account" };
    }

    const emailMsg = await sendEmail({
      gmailAccountId: gmailAccount.id,
      orgId,
      to,
      subject,
      bodyHtml,
      contactId,
    });

    return {
      action,
      success: true,
      resultData: { emailId: emailMsg.id, to, subject },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: `send_email: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ── Action: ai_generate_email ───────────────────────────────

async function executeAiGenerateEmail(
  orgId: string,
  automationId: string,
  automationName: string,
  action: AutomationAction & { type: "ai_generate_email" },
  triggerData: TriggerData,
  contactId?: string,
): Promise<ActionResult> {
  if (!contactId) {
    return { action, success: false, error: "ai_generate_email requires a contactId" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!contact?.email) {
      return { action, success: false, error: "ai_generate_email: contact has no email address" };
    }

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    const prompt = interpolateTemplate(action.prompt, triggerData);

    const generated = await generateEmailWithAI({
      prompt,
      tone: action.tone || "professional",
      triggerData,
      contactName,
      contactEmail: contact.email,
    });

    if (action.sendAfterGeneration) {
      // Auto-send via Gmail
      const automation = await prisma.automation.findUnique({
        where: { id: automationId },
        select: { createdBy: true },
      });

      const gmailAccount = automation?.createdBy
        ? await prisma.gmailAccount.findFirst({
            where: { userId: automation.createdBy },
            select: { id: true },
          })
        : null;

      if (!gmailAccount) {
        // Fallback: create task with draft instead
        const task = await prisma.task.create({
          data: {
            orgId,
            contactId,
            title: `AI Draft (no Gmail): ${generated.subject}`,
            description: `Could not auto-send — no Gmail account linked.\n\nSubject: ${generated.subject}\n\n${generated.bodyHtml}`,
            priority: "medium",
            status: "pending",
            isAiGenerated: true,
            aiReasoning: `Automation "${automationName}" — Gmail not available`,
          },
        });
        return {
          action,
          success: true,
          resultData: { taskId: task.id, draftFallback: true, subject: generated.subject },
        };
      }

      const emailMsg = await sendEmail({
        gmailAccountId: gmailAccount.id,
        orgId,
        to: contact.email,
        subject: generated.subject,
        bodyHtml: generated.bodyHtml,
        contactId,
      });

      return {
        action,
        success: true,
        resultData: { emailId: emailMsg.id, to: contact.email, subject: generated.subject, aiGenerated: true },
      };
    }

    // Create draft task for human review
    const task = await prisma.task.create({
      data: {
        orgId,
        contactId,
        title: `AI Draft: ${generated.subject}`,
        description: `AI-generated email draft for ${contactName}:\n\nReasoning: ${generated.reasoning}\n\nSubject: ${generated.subject}\n\n${generated.bodyHtml}`,
        priority: "medium",
        status: "pending",
        isAiGenerated: true,
        aiReasoning: `Automation "${automationName}" (${automationId})`,
      },
    });

    return {
      action,
      success: true,
      resultData: { taskId: task.id, draftStatus: "review_pending", subject: generated.subject },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: `ai_generate_email: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ── Delay Scheduler ─────────────────────────────────────────

async function scheduleDelayedAction(
  orgId: string,
  automationId: string,
  action: AutomationAction,
  triggerData: TriggerData,
  delay: ActionDelay,
  contactId?: string,
  dealId?: string,
): Promise<ActionResult> {
  const ms =
    delay.value *
    (delay.unit === "minutes" ? 60_000 : delay.unit === "hours" ? 3_600_000 : 86_400_000);
  const scheduledFor = new Date(Date.now() + ms);

  try {
    // Remove the delay from the action before storing (so it executes immediately when picked up)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionWithoutDelay = { ...action } as any;
    delete actionWithoutDelay.delay;

    await prisma.scheduledAutomationAction.create({
      data: {
        automationId,
        orgId,
        contactId: contactId || null,
        dealId: dealId || null,
        action: actionWithoutDelay as object,
        triggerData: triggerData as object,
        scheduledFor,
        status: "pending",
      },
    });

    return {
      action,
      success: true,
      resultData: {
        scheduled: true,
        scheduledFor: scheduledFor.toISOString(),
        delayDescription: `${delay.value} ${delay.unit}`,
      },
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: `schedule_delay: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ── Template Interpolation ──────────────────────────────────

export function interpolateTemplate(template: string, data: TriggerData): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  let result = template;

  // Build contact name from firstName + lastName if available
  const firstName = d.firstName || "";
  const lastName = d.lastName || "";
  const contactName = [firstName, lastName].filter(Boolean).join(" ");

  result = result
    .replace(/\{\{contactName\}\}/g, contactName)
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{lastName\}\}/g, lastName)
    .replace(/\{\{source\}\}/g, d.source || "")
    .replace(/\{\{email\}\}/g, d.email || "")
    .replace(/\{\{phone\}\}/g, d.phone || "")
    .replace(/\{\{stage\}\}/g, d.newStage || "")
    .replace(/\{\{previousStage\}\}/g, d.previousStage || "")
    .replace(/\{\{propertyAddress\}\}/g, d.propertyAddress || "")
    .replace(/\{\{priority\}\}/g, d.priority || "")
    .replace(/\{\{title\}\}/g, d.title || "")
    // New trigger data tokens
    .replace(/\{\{subject\}\}/g, d.subject || "")
    .replace(/\{\{fromEmail\}\}/g, d.fromEmail || "")
    .replace(/\{\{fromName\}\}/g, d.fromName || "")
    .replace(/\{\{transactionValue\}\}/g, d.transactionValue != null ? String(d.transactionValue) : "")
    .replace(/\{\{dealAddress\}\}/g, d.dealAddress || "")
    .replace(/\{\{newScore\}\}/g, d.newScore != null ? String(d.newScore) : "")
    .replace(/\{\{previousScore\}\}/g, d.previousScore != null ? String(d.previousScore) : "")
    .replace(/\{\{scoreDelta\}\}/g, d.scoreDelta != null ? String(d.scoreDelta) : "")
    .replace(/\{\{enrichmentType\}\}/g, d.enrichmentType || "")
    .replace(/\{\{confidenceLevel\}\}/g, d.confidenceLevel || "");

  return result;
}
