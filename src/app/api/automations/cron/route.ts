// ============================================================
// Automations Cron — Time-Based Trigger Checks
// Runs every 30 minutes via external cron (Cloud Scheduler, etc.)
// Handles: no_activity, task_overdue
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";
import { executeSingleAction } from "@/lib/automation-executor";
import type {
  TriggerDataNoActivity,
  TriggerDataTaskOverdue,
  TriggerConfigNoActivity,
  TriggerConfigTaskOverdue,
  AutomationAction,
  TriggerData,
} from "@/lib/automation-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[AUTOMATION CRON] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    noActivity: { checked: 0, dispatched: 0 },
    taskOverdue: { checked: 0, dispatched: 0 },
    scheduledActions: { checked: 0, executed: 0, failed: 0 },
    errors: [] as string[],
  };

  try {
    await checkNoActivityTriggers(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.errors.push(`no_activity error: ${msg}`);
    console.error("[AUTOMATION CRON] no_activity top-level error:", error);
  }

  try {
    await checkTaskOverdueTriggers(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.errors.push(`task_overdue error: ${msg}`);
    console.error("[AUTOMATION CRON] task_overdue top-level error:", error);
  }

  try {
    await executeScheduledActions(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.errors.push(`scheduled_actions error: ${msg}`);
    console.error("[AUTOMATION CRON] scheduled_actions top-level error:", error);
  }

  console.log("[AUTOMATION CRON] Complete:", JSON.stringify(results));
  return NextResponse.json({ ok: true, ...results });
}

// ── no_activity ─────────────────────────────────────────────

async function checkNoActivityTriggers(results: {
  noActivity: { checked: number; dispatched: number };
  errors: string[];
}) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "no_activity", isActive: true },
    select: { id: true, orgId: true, triggerConfig: true },
  });

  for (const automation of automations) {
    try {
      const config = (automation.triggerConfig || {}) as unknown as TriggerConfigNoActivity;
      const daysSinceContact = config.daysSinceContact || 7;
      const excludeTags = config.excludeTags || [];

      const cutoffDate = new Date(Date.now() - daysSinceContact * 86_400_000);

      const staleContacts = await prisma.contact.findMany({
        where: {
          orgId: automation.orgId,
          status: { notIn: ["archived", "past_client"] },
          OR: [
            { lastActivityAt: { lt: cutoffDate } },
            { lastActivityAt: null },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          qualificationScore: true,
          tags: true,
          lastActivityAt: true,
          createdAt: true,
        },
        take: 100,
      });

      results.noActivity.checked += staleContacts.length;

      for (const contact of staleContacts) {
        // Skip contacts with excluded tags
        if (excludeTags.length > 0 && excludeTags.some((t) => contact.tags.includes(t))) {
          continue;
        }

        const referenceDate = contact.lastActivityAt || contact.createdAt;
        const daysSince = Math.floor(
          (Date.now() - referenceDate.getTime()) / 86_400_000,
        );

        const triggerData: TriggerDataNoActivity = {
          contactId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          lastActivityAt: contact.lastActivityAt?.toISOString() ?? null,
          daysSinceActivity: daysSince,
          tags: contact.tags,
        };

        await dispatchAutomationSafe(
          automation.orgId,
          "no_activity",
          triggerData,
          contact.id,
        );
        results.noActivity.dispatched++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.errors.push(`no_activity (${automation.id}): ${msg}`);
      console.error(`[AUTOMATION CRON] no_activity error for ${automation.id}:`, error);
    }
  }
}

// ── task_overdue ────────────────────────────────────────────

async function checkTaskOverdueTriggers(results: {
  taskOverdue: { checked: number; dispatched: number };
  errors: string[];
}) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "task_overdue", isActive: true },
    select: { id: true, orgId: true, triggerConfig: true },
  });

  for (const automation of automations) {
    try {
      const config = (automation.triggerConfig || {}) as unknown as TriggerConfigTaskOverdue;
      const hoursOverdue = config.hoursOverdue || 1;
      const taskTypes = config.taskTypes || [];

      const overdueCutoff = new Date(Date.now() - hoursOverdue * 3_600_000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        orgId: automation.orgId,
        dueAt: { lt: overdueCutoff },
        status: "pending",
      };
      if (taskTypes.length > 0) {
        where.type = { in: taskTypes };
      }

      const overdueTasks = await prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          contactId: true,
          dueAt: true,
          priority: true,
          status: true,
        },
        take: 100,
      });

      results.taskOverdue.checked += overdueTasks.length;

      for (const task of overdueTasks) {
        if (!task.dueAt) continue;

        const hoursOver = Math.floor(
          (Date.now() - task.dueAt.getTime()) / 3_600_000,
        );

        const triggerData: TriggerDataTaskOverdue = {
          taskId: task.id,
          title: task.title,
          contactId: task.contactId,
          dueAt: task.dueAt.toISOString(),
          hoursOverdue: hoursOver,
          priority: task.priority,
          status: task.status,
        };

        await dispatchAutomationSafe(
          automation.orgId,
          "task_overdue",
          triggerData,
          task.contactId || undefined,
        );
        results.taskOverdue.dispatched++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.errors.push(`task_overdue (${automation.id}): ${msg}`);
      console.error(`[AUTOMATION CRON] task_overdue error for ${automation.id}:`, error);
    }
  }
}

// ── scheduled_actions (delayed action execution) ────────────

async function executeScheduledActions(results: {
  scheduledActions: { checked: number; executed: number; failed: number };
  errors: string[];
}) {
  // Pick up pending scheduled actions whose time has come
  const pendingActions = await prisma.scheduledAutomationAction.findMany({
    where: {
      status: "pending",
      scheduledFor: { lte: new Date() },
    },
    include: {
      automation: {
        select: { id: true, name: true, orgId: true, isActive: true },
      },
    },
    take: 100,
    orderBy: { scheduledFor: "asc" },
  });

  results.scheduledActions.checked = pendingActions.length;

  for (const scheduled of pendingActions) {
    // Skip if automation was deactivated since scheduling
    if (!scheduled.automation.isActive) {
      await prisma.scheduledAutomationAction.update({
        where: { id: scheduled.id },
        data: { status: "cancelled", executedAt: new Date() },
      });
      continue;
    }

    try {
      const action = scheduled.action as unknown as AutomationAction;
      const triggerData = scheduled.triggerData as unknown as TriggerData;

      const result = await executeSingleAction(
        scheduled.orgId,
        scheduled.automationId,
        scheduled.automation.name,
        action,
        triggerData,
        scheduled.contactId || undefined,
        scheduled.dealId || undefined,
      );

      await prisma.scheduledAutomationAction.update({
        where: { id: scheduled.id },
        data: {
          status: result.success ? "executed" : "failed",
          error: result.error || null,
          executedAt: new Date(),
        },
      });

      if (result.success) {
        results.scheduledActions.executed++;
      } else {
        results.scheduledActions.failed++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.scheduledAutomationAction.update({
        where: { id: scheduled.id },
        data: { status: "failed", error: msg, executedAt: new Date() },
      });
      results.scheduledActions.failed++;
      results.errors.push(`scheduled_action (${scheduled.id}): ${msg}`);
      console.error(`[AUTOMATION CRON] scheduled action error for ${scheduled.id}:`, error);
    }
  }
}
