// ============================================================
// Automations Engine — Trigger Dispatcher
// ============================================================

import prisma from "@/lib/prisma";
import type { AutomationTrigger } from "@prisma/client";
import type { TriggerData, DispatchResult } from "./automation-types";
import { evaluateConditions } from "./automation-evaluator";
import { executeActions } from "./automation-executor";

/**
 * Main dispatcher — finds active automations matching the trigger,
 * evaluates conditions, executes actions, and logs runs.
 */
export async function dispatchAutomation(
  orgId: string,
  triggerType: AutomationTrigger,
  triggerData: TriggerData,
  contactId?: string,
  dealId?: string,
): Promise<DispatchResult> {
  const stats: DispatchResult = { matchedCount: 0, executedCount: 0, errors: [] };

  try {
    const automations = await prisma.automation.findMany({
      where: { orgId, triggerType, isActive: true },
    });

    stats.matchedCount = automations.length;

    for (const automation of automations) {
      try {
        // Evaluate conditions
        if (!evaluateConditions(automation.conditions, triggerData)) {
          continue;
        }

        // Execute actions
        const result = await executeActions(
          orgId,
          automation.id,
          automation.name,
          automation.actions,
          triggerData,
          contactId,
          dealId,
        );

        // Log run
        await prisma.automationRun.create({
          data: {
            automationId: automation.id,
            contactId: contactId || undefined,
            dealId: dealId || undefined,
            triggerData: triggerData as object,
            actionsTaken: result.actionResults as object[],
            status: result.status,
            errorMessage: result.errorMessage || null,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        });

        // Update automation stats
        await prisma.automation.update({
          where: { id: automation.id },
          data: {
            runsCount: { increment: 1 },
            lastRunAt: new Date(),
            lastError: result.errorMessage || null,
          },
        });

        if (result.status === "success" || result.status === "partial") {
          stats.executedCount++;
        }
        if (result.errorMessage) {
          stats.errors.push(`${automation.name}: ${result.errorMessage}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`${automation.name}: ${msg}`);
        console.error(`[automation] Execution error for "${automation.name}":`, error);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stats.errors.push(`Dispatcher error: ${msg}`);
    console.error(`[automation] Dispatcher error for org=${orgId}:`, error);
  }

  return stats;
}

/**
 * Safe wrapper — never throws. Automations must not block business logic.
 * Fire-and-forget: call without await for non-blocking dispatch.
 */
export async function dispatchAutomationSafe(
  orgId: string,
  triggerType: AutomationTrigger,
  triggerData: TriggerData,
  contactId?: string,
  dealId?: string,
): Promise<void> {
  try {
    const result = await dispatchAutomation(orgId, triggerType, triggerData, contactId, dealId);
    if (result.errors.length > 0) {
      console.warn(`[automation] Completed with errors:`, result.errors);
    }
    if (result.executedCount > 0) {
      console.log(
        `[automation] Dispatched ${triggerType}: ${result.executedCount}/${result.matchedCount} executed`,
      );
    }
  } catch (error) {
    console.error(`[automation] Dispatcher crashed (${triggerType}):`, error);
  }
}
