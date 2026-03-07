"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AutomationTrigger } from "@prisma/client";
import type { Conditions, AutomationAction } from "@/lib/automation-types";
import { getRecipeById } from "@/lib/automation-recipes";

// ── Auth Helper ─────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) throw new Error("User not found");

  return { userId: user.id, orgId: user.orgId };
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// ── List Automations ────────────────────────────────────────

export async function getAutomations() {
  const { orgId } = await getCurrentOrg();

  const automations = await prisma.automation.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      triggerType: true,
      isActive: true,
      runsCount: true,
      lastRunAt: true,
      lastError: true,
      createdAt: true,
    },
  });

  return serialize(automations);
}

// ── Get Single Automation ───────────────────────────────────

export async function getAutomation(automationId: string) {
  const { orgId } = await getCurrentOrg();

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });

  if (!automation) {
    return { success: false as const, error: "Automation not found", automation: null };
  }

  return { success: true as const, automation: serialize(automation) };
}

// ── Create Automation ───────────────────────────────────────

export interface CreateAutomationInput {
  name: string;
  description?: string;
  triggerType: AutomationTrigger;
  triggerConfig?: Record<string, unknown>;
  conditions?: Conditions;
  actions?: AutomationAction[];
}

export async function createAutomation(input: CreateAutomationInput) {
  const { orgId, userId } = await getCurrentOrg();

  if (!input.name?.trim()) {
    return { success: false as const, error: "Name is required" };
  }

  try {
    const automation = await prisma.automation.create({
      data: {
        orgId,
        createdBy: userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        triggerType: input.triggerType,
        triggerConfig: (input.triggerConfig || {}) as object,
        conditions: (input.conditions || []) as object[],
        actions: (input.actions || []) as object[],
        isActive: true,
      },
    });

    revalidatePath("/settings/automations");
    return { success: true as const, automation: serialize(automation) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: msg };
  }
}

// ── Update Automation ───────────────────────────────────────

export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  triggerType?: AutomationTrigger;
  triggerConfig?: Record<string, unknown>;
  conditions?: Conditions;
  actions?: AutomationAction[];
  isActive?: boolean;
}

export async function updateAutomation(
  automationId: string,
  input: UpdateAutomationInput,
) {
  const { orgId } = await getCurrentOrg();

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });
  if (!existing) {
    return { success: false as const, error: "Automation not found" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined)
      data.description = input.description?.trim() || null;
    if (input.triggerType !== undefined) data.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined)
      data.triggerConfig = input.triggerConfig as object;
    if (input.conditions !== undefined)
      data.conditions = input.conditions as object[];
    if (input.actions !== undefined) data.actions = input.actions as object[];
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const automation = await prisma.automation.update({
      where: { id: automationId },
      data,
    });

    revalidatePath("/settings/automations");
    return { success: true as const, automation: serialize(automation) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: msg };
  }
}

// ── Toggle Active ───────────────────────────────────────────

export async function toggleAutomationActive(automationId: string) {
  const { orgId } = await getCurrentOrg();

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });
  if (!existing) {
    return { success: false as const, error: "Automation not found" };
  }

  try {
    const automation = await prisma.automation.update({
      where: { id: automationId },
      data: { isActive: !existing.isActive },
    });

    revalidatePath("/settings/automations");
    return { success: true as const, isActive: automation.isActive };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: msg };
  }
}

// ── Delete Automation ───────────────────────────────────────

export async function deleteAutomation(automationId: string) {
  const { orgId } = await getCurrentOrg();

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });
  if (!existing) {
    return { success: false as const, error: "Automation not found" };
  }

  try {
    // Delete runs first, then the automation
    await prisma.automationRun.deleteMany({
      where: { automationId },
    });
    await prisma.automation.delete({ where: { id: automationId } });

    revalidatePath("/settings/automations");
    return { success: true as const };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: msg };
  }
}

// ── Get Automation Runs (Paginated + Filtered) ──────────────

export async function getAutomationRuns(
  automationId: string,
  page = 1,
  limit = 20,
  statusFilter?: string,
) {
  const { orgId } = await getCurrentOrg();

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });
  if (!automation) {
    return { success: false as const, error: "Automation not found", runs: [], total: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { automationId };
  if (statusFilter && statusFilter !== "all") {
    where.status = statusFilter;
  }

  const [runs, total] = await Promise.all([
    prisma.automationRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.automationRun.count({ where }),
  ]);

  return { success: true as const, runs: serialize(runs), total };
}

// ── Get Run Stats ───────────────────────────────────────────

export async function getAutomationRunStats(automationId: string) {
  const { orgId } = await getCurrentOrg();

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  });
  if (!automation) return null;

  const [success, partial, failed, total] = await Promise.all([
    prisma.automationRun.count({ where: { automationId, status: "success" } }),
    prisma.automationRun.count({ where: { automationId, status: "partial" } }),
    prisma.automationRun.count({ where: { automationId, status: "failed" } }),
    prisma.automationRun.count({ where: { automationId } }),
  ]);

  return { success, partial, failed, total };
}

// ── Apply Recipe ────────────────────────────────────────────

export async function applyRecipe(recipeId: string) {
  const { orgId, userId } = await getCurrentOrg();

  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    return { success: false as const, error: "Recipe not found" };
  }

  try {
    const automation = await prisma.automation.create({
      data: {
        orgId,
        createdBy: userId,
        name: recipe.name,
        description: recipe.description,
        triggerType: recipe.triggerType,
        triggerConfig: (recipe.triggerConfig || {}) as object,
        conditions: (recipe.conditions || []) as object[],
        actions: (recipe.actions || []) as object[],
        isActive: true,
      },
    });

    revalidatePath("/settings/automations");
    return { success: true as const, automation: serialize(automation) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: msg };
  }
}

// ── Get Stats ───────────────────────────────────────────────

export async function getAutomationStats() {
  const { orgId } = await getCurrentOrg();

  const [total, active, totalRuns] = await Promise.all([
    prisma.automation.count({ where: { orgId } }),
    prisma.automation.count({ where: { orgId, isActive: true } }),
    prisma.automation.aggregate({
      where: { orgId },
      _sum: { runsCount: true },
    }),
  ]);

  return {
    total,
    active,
    totalRuns: totalRuns._sum.runsCount || 0,
  };
}
