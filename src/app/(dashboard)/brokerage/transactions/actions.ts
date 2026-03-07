"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logTransactionAction } from "@/lib/bms-audit";
import {
  DEFAULT_RENTAL_TASKS,
  DEFAULT_SALE_TASKS,
  getStagesForType,
  getDefaultStageForType,
} from "@/lib/transaction-templates";
import type { TransactionStage, BmsTransactionType } from "@prisma/client";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionRecord,
  TransactionWithTasks,
  TransactionStats,
  TransactionStageType,
  TimelineEvent,
  AgentPayoutInput,
  AgentPayoutSummary,
  TransactionAgentInput,
  TransactionAgentRecord,
} from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!user) throw new Error("User not found");
  return {
    userId: user.id,
    orgId: user.orgId,
    userName: user.fullName,
    agentId: user.brokerAgent?.id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

function actor(ctx: { userId: string; userName: string }) {
  return { id: ctx.userId, name: ctx.userName };
}

function parseOptionalDate(val?: string): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

// ── Ensure Default Templates ────────────────────────────────

export async function ensureDefaultTemplates(orgId: string): Promise<void> {
  const existing = await prisma.transactionTemplate.findMany({
    where: { orgId, isDefault: true },
    select: { type: true },
  });

  const existingTypes = new Set(existing.map((t) => t.type));

  if (!existingTypes.has("rental")) {
    const template = await prisma.transactionTemplate.create({
      data: {
        orgId,
        name: "Default Rental Checklist",
        type: "rental",
        isDefault: true,
      },
    });
    await prisma.transactionTemplateTask.createMany({
      data: DEFAULT_RENTAL_TASKS.map((t) => ({
        templateId: template.id,
        title: t.title,
        stage: t.stage,
        sortOrder: t.sortOrder,
        isRequired: t.isRequired,
      })),
    });
  }

  if (!existingTypes.has("sale")) {
    const template = await prisma.transactionTemplate.create({
      data: {
        orgId,
        name: "Default Sale Checklist",
        type: "sale",
        isDefault: true,
      },
    });
    await prisma.transactionTemplateTask.createMany({
      data: DEFAULT_SALE_TASKS.map((t) => ({
        templateId: template.id,
        title: t.title,
        stage: t.stage,
        sortOrder: t.sortOrder,
        isRequired: t.isRequired,
      })),
    });
  }
}

// ── Create Transaction ──────────────────────────────────────

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();
  const txType = input.type as BmsTransactionType;

  // Ensure default templates exist for this org
  await ensureDefaultTemplates(ctx.orgId);

  // Find the template for this type
  const template = await prisma.transactionTemplate.findFirst({
    where: { orgId: ctx.orgId, type: txType, isActive: true },
    orderBy: { isDefault: "desc" },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  const defaultStage = getDefaultStageForType(txType);

  const transaction = await prisma.transaction.create({
    data: {
      orgId: ctx.orgId,
      type: txType,
      stage: defaultStage,
      agentId: input.agentId || ctx.agentId || undefined,
      propertyAddress: input.propertyAddress,
      propertyUnit: input.propertyUnit,
      propertyCity: input.propertyCity,
      propertyState: input.propertyState || "NY",
      propertyName: input.propertyName,
      transactionValue: input.transactionValue,
      commissionAmount: input.commissionAmount,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      otherPartyName: input.otherPartyName,
      otherPartyEmail: input.otherPartyEmail,
      otherPartyPhone: input.otherPartyPhone,
      notes: input.notes,
      applicationDate: parseOptionalDate(input.applicationDate),
      closingDate: parseOptionalDate(input.closingDate),
      moveInDate: parseOptionalDate(input.moveInDate),
      leaseStartDate: parseOptionalDate(input.leaseStartDate),
    },
  });

  // Copy template tasks to the transaction
  if (template && template.tasks.length > 0) {
    const now = new Date();
    await prisma.transactionTask.createMany({
      data: template.tasks.map((t) => ({
        transactionId: transaction.id,
        title: t.title,
        description: t.description,
        stage: t.stage,
        sortOrder: t.sortOrder,
        isRequired: t.isRequired,
        dueDate: t.defaultDueDays
          ? new Date(now.getTime() + t.defaultDueDays * 86400000)
          : undefined,
      })),
    });
  }

  // Create TransactionAgent records
  const primaryAgentId = input.agentId || ctx.agentId;
  if (primaryAgentId) {
    await prisma.transactionAgent.create({
      data: {
        transactionId: transaction.id,
        agentId: primaryAgentId,
        role: "primary",
      },
    });
  }

  if (input.additionalAgents && input.additionalAgents.length > 0) {
    for (const ag of input.additionalAgents) {
      if (!ag.agentId || ag.agentId === primaryAgentId) continue;
      await prisma.transactionAgent.create({
        data: {
          transactionId: transaction.id,
          agentId: ag.agentId,
          role: ag.role || "co_agent",
          splitPct: ag.splitPct,
          payoutAmount: ag.payoutAmount,
          notes: ag.notes,
        },
      });
    }
  }

  logTransactionAction(ctx.orgId, actor(ctx), "created", transaction.id, {
    type: txType,
    propertyAddress: input.propertyAddress,
  });

  return serialize(transaction) as TransactionRecord;
}

// ── Create Transaction from DealSubmission ──────────────────

export async function createTransactionFromSubmission(
  submissionId: string,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const submission = await prisma.dealSubmission.findFirst({
    where: { id: submissionId, orgId: ctx.orgId },
  });
  if (!submission) throw new Error("Deal submission not found");

  // Check if a transaction already exists for this submission
  const existing = await prisma.transaction.findUnique({
    where: { dealSubmissionId: submissionId },
  });
  if (existing) throw new Error("A transaction already exists for this deal submission");

  // Map BmsDealType to BmsTransactionType
  const dealType = submission.dealType as string;
  const txType: BmsTransactionType =
    dealType === "rental" ? "rental" : "sale";

  // Ensure default templates exist
  await ensureDefaultTemplates(ctx.orgId);

  const template = await prisma.transactionTemplate.findFirst({
    where: { orgId: ctx.orgId, type: txType, isActive: true },
    orderBy: { isDefault: "desc" },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  const defaultStage = getDefaultStageForType(txType);

  const transaction = await prisma.transaction.create({
    data: {
      orgId: ctx.orgId,
      dealSubmissionId: submissionId,
      agentId: submission.agentId,
      type: txType,
      stage: defaultStage,
      propertyAddress: submission.propertyAddress,
      propertyUnit: submission.unit,
      propertyCity: submission.city,
      propertyState: submission.state || "NY",
      transactionValue: submission.transactionValue,
      commissionAmount: submission.totalCommission,
      clientName: submission.clientName,
      clientEmail: submission.clientEmail,
      clientPhone: submission.clientPhone,
      closingDate: submission.closingDate,
      notes: submission.notes,
    },
  });

  // Copy template tasks
  if (template && template.tasks.length > 0) {
    const now = new Date();
    await prisma.transactionTask.createMany({
      data: template.tasks.map((t) => ({
        transactionId: transaction.id,
        title: t.title,
        description: t.description,
        stage: t.stage,
        sortOrder: t.sortOrder,
        isRequired: t.isRequired,
        dueDate: t.defaultDueDays
          ? new Date(now.getTime() + t.defaultDueDays * 86400000)
          : undefined,
      })),
    });
  }

  // Create TransactionAgent records
  if (submission.agentId) {
    await prisma.transactionAgent.create({
      data: {
        transactionId: transaction.id,
        agentId: submission.agentId,
        role: "primary",
      },
    });
  }

  // Handle coAgents from the submission
  const coAgents = submission.coAgents as Array<{ agentId?: string; splitPct?: number; role?: string }> | null;
  if (coAgents && Array.isArray(coAgents)) {
    for (const ca of coAgents) {
      if (!ca.agentId || ca.agentId === submission.agentId) continue;
      await prisma.transactionAgent.create({
        data: {
          transactionId: transaction.id,
          agentId: ca.agentId,
          role: ca.role || "co_agent",
          splitPct: ca.splitPct,
        },
      });
    }
  }

  logTransactionAction(ctx.orgId, actor(ctx), "created", transaction.id, {
    type: txType,
    fromSubmission: submissionId,
    propertyAddress: submission.propertyAddress,
  });

  return serialize(transaction) as TransactionRecord;
}

// ── Get Transactions (list) ─────────────────────────────────

export async function getTransactions(filters?: {
  type?: string;
  stage?: string;
  agentId?: string;
  search?: string;
}): Promise<TransactionRecord[]> {
  const ctx = await getCurrentOrg();

  const where: Record<string, unknown> = { orgId: ctx.orgId };

  if (filters?.type) where.type = filters.type;
  if (filters?.stage) where.stage = filters.stage;
  if (filters?.agentId) where.agentId = filters.agentId;

  if (filters?.search) {
    const s = filters.search;
    where.OR = [
      { propertyAddress: { contains: s, mode: "insensitive" } },
      { propertyName: { contains: s, mode: "insensitive" } },
      { clientName: { contains: s, mode: "insensitive" } },
      { otherPartyName: { contains: s, mode: "insensitive" } },
    ];
  }

  const transactions = await prisma.transaction.findMany({
    where: where as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    orderBy: { updatedAt: "desc" },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      agents: {
        select: { id: true, agentId: true, role: true, payoutStatus: true },
      },
    },
  });

  return serialize(transactions) as TransactionRecord[];
}

// ── Get Single Transaction with Tasks ───────────────────────

export async function getTransaction(id: string): Promise<TransactionWithTasks> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      agents: {
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      dealSubmission: { select: { id: true, propertyAddress: true, status: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, totalCommission: true } },
      listing: { select: { id: true, address: true, unit: true, status: true } },
    },
  });

  if (!transaction) throw new Error("Transaction not found");

  return serialize(transaction) as TransactionWithTasks;
}

// ── Update Transaction ──────────────────────────────────────

export async function updateTransaction(
  id: string,
  data: UpdateTransactionInput,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  // Verify ownership
  const existing = await prisma.transaction.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!existing) throw new Error("Transaction not found");

  const updateData: Record<string, unknown> = {};

  // Map string fields directly
  const stringFields = [
    "propertyAddress", "propertyUnit", "propertyCity", "propertyState",
    "propertyName", "clientName", "clientEmail", "clientPhone",
    "otherPartyName", "otherPartyEmail", "otherPartyPhone", "agentId", "notes",
  ] as const;

  for (const field of stringFields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  // Decimal fields
  if (data.transactionValue !== undefined) updateData.transactionValue = data.transactionValue;
  if (data.commissionAmount !== undefined) updateData.commissionAmount = data.commissionAmount;
  if (data.housePayoutAmount !== undefined) updateData.housePayoutAmount = data.housePayoutAmount;

  // Date fields
  const dateFields = [
    "applicationDate", "approvalDate", "contractDate", "inspectionDate",
    "closingDate", "moveInDate", "leaseStartDate", "leaseEndDate", "expirationDate",
  ] as const;

  for (const field of dateFields) {
    if (data[field] !== undefined) updateData[field] = parseOptionalDate(data[field]);
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  logTransactionAction(ctx.orgId, actor(ctx), "updated", id, {
    fields: Object.keys(updateData),
  });

  return serialize(updated) as TransactionRecord;
}

// ── Advance Stage ───────────────────────────────────────────

export async function advanceStage(
  id: string,
): Promise<{ success: true; transaction: TransactionRecord } | { success: false; error: string; incompleteTasks: string[] }> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { tasks: true },
  });
  if (!transaction) throw new Error("Transaction not found");

  if (transaction.stage === "closed" || transaction.stage === "cancelled") {
    return { success: false, error: "Transaction is already closed or cancelled", incompleteTasks: [] };
  }

  const stages = getStagesForType(transaction.type);
  const currentIndex = stages.indexOf(transaction.stage);
  if (currentIndex === -1 || currentIndex >= stages.length - 1) {
    return { success: false, error: "Cannot advance beyond the final stage", incompleteTasks: [] };
  }

  // Check required tasks in current stage
  const requiredIncomplete = transaction.tasks.filter(
    (t) => t.stage === transaction.stage && t.isRequired && !t.isCompleted,
  );

  if (requiredIncomplete.length > 0) {
    return {
      success: false,
      error: `${requiredIncomplete.length} required task(s) must be completed before advancing`,
      incompleteTasks: requiredIncomplete.map((t) => t.title),
    };
  }

  const nextStage = stages[currentIndex + 1];
  const updateData: Record<string, unknown> = { stage: nextStage };

  // Set timestamps for key stages
  if (nextStage === "closed") {
    updateData.closedAt = new Date();
    updateData.actualCloseDate = new Date();
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  logTransactionAction(ctx.orgId, actor(ctx), "stage_advanced", id, {
    from: transaction.stage,
    to: nextStage,
  });

  return { success: true, transaction: serialize(updated) as TransactionRecord };
}

// ── Revert Stage ────────────────────────────────────────────

export async function revertStage(id: string): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  if (transaction.stage === "cancelled") {
    throw new Error("Cannot revert a cancelled transaction");
  }

  const stages = getStagesForType(transaction.type);
  const currentIndex = stages.indexOf(transaction.stage);
  if (currentIndex <= 0) {
    throw new Error("Cannot revert — already at the first stage");
  }

  const prevStage = stages[currentIndex - 1];
  const updateData: Record<string, unknown> = { stage: prevStage };

  // Clear closed timestamps if reverting from closed
  if (transaction.stage === "closed") {
    updateData.closedAt = null;
    updateData.actualCloseDate = null;
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  logTransactionAction(ctx.orgId, actor(ctx), "stage_reverted", id, {
    from: transaction.stage,
    to: prevStage,
  });

  return serialize(updated) as TransactionRecord;
}

// ── Cancel Transaction ──────────────────────────────────────

export async function cancelTransaction(
  id: string,
  reason?: string,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      stage: "cancelled",
      cancelledAt: new Date(),
      cancelReason: reason || null,
    },
  });

  logTransactionAction(ctx.orgId, actor(ctx), "cancelled", id, {
    previousStage: transaction.stage,
    reason,
  });

  return serialize(updated) as TransactionRecord;
}

// ── Toggle Task ─────────────────────────────────────────────

export async function toggleTask(
  taskId: string,
): Promise<{ id: string; isCompleted: boolean; completedAt: string | null }> {
  const ctx = await getCurrentOrg();

  const task = await prisma.transactionTask.findUnique({
    where: { id: taskId },
    include: { transaction: { select: { orgId: true, id: true } } },
  });
  if (!task || task.transaction.orgId !== ctx.orgId) throw new Error("Task not found");

  const nowCompleted = !task.isCompleted;

  const updated = await prisma.transactionTask.update({
    where: { id: taskId },
    data: {
      isCompleted: nowCompleted,
      completedAt: nowCompleted ? new Date() : null,
      completedBy: nowCompleted ? ctx.userId : null,
    },
  });

  logTransactionAction(
    ctx.orgId,
    actor(ctx),
    nowCompleted ? "task_completed" : "task_uncompleted",
    task.transaction.id,
    { taskId, title: task.title, stage: task.stage },
  );

  return serialize({
    id: updated.id,
    isCompleted: updated.isCompleted,
    completedAt: updated.completedAt,
  }) as { id: string; isCompleted: boolean; completedAt: string | null };
}

// ── Add Task ────────────────────────────────────────────────

export async function addTask(
  transactionId: string,
  data: { title: string; stage: TransactionStageType; isRequired?: boolean; dueDate?: string },
): Promise<{ id: string; title: string; stage: string }> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  // Get max sortOrder for the stage
  const maxSort = await prisma.transactionTask.aggregate({
    where: { transactionId, stage: data.stage as TransactionStage },
    _max: { sortOrder: true },
  });

  const task = await prisma.transactionTask.create({
    data: {
      transactionId,
      title: data.title,
      stage: data.stage as TransactionStage,
      sortOrder: (maxSort._max.sortOrder || 0) + 1,
      isRequired: data.isRequired ?? false,
      dueDate: parseOptionalDate(data.dueDate),
    },
  });

  logTransactionAction(ctx.orgId, actor(ctx), "task_added", transactionId, {
    taskId: task.id,
    title: data.title,
    stage: data.stage,
  });

  return serialize({ id: task.id, title: task.title, stage: task.stage }) as {
    id: string;
    title: string;
    stage: string;
  };
}

// ── Update Task ─────────────────────────────────────────────

export async function updateTask(
  taskId: string,
  data: { title?: string; description?: string; dueDate?: string; notes?: string; isRequired?: boolean },
): Promise<{ id: string }> {
  const ctx = await getCurrentOrg();

  const task = await prisma.transactionTask.findUnique({
    where: { id: taskId },
    include: { transaction: { select: { orgId: true } } },
  });
  if (!task || task.transaction.orgId !== ctx.orgId) throw new Error("Task not found");

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;
  if (data.dueDate !== undefined) updateData.dueDate = parseOptionalDate(data.dueDate);

  await prisma.transactionTask.update({
    where: { id: taskId },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  return { id: taskId };
}

// ── Delete Task ─────────────────────────────────────────────

export async function deleteTask(taskId: string): Promise<void> {
  const ctx = await getCurrentOrg();

  const task = await prisma.transactionTask.findUnique({
    where: { id: taskId },
    include: { transaction: { select: { orgId: true, id: true } } },
  });
  if (!task || task.transaction.orgId !== ctx.orgId) throw new Error("Task not found");

  await prisma.transactionTask.delete({ where: { id: taskId } });

  logTransactionAction(ctx.orgId, actor(ctx), "task_deleted", task.transaction.id, {
    taskId,
    title: task.title,
  });
}

// ── Reorder Tasks ───────────────────────────────────────────

export async function reorderTasks(
  transactionId: string,
  taskIds: string[],
): Promise<void> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  // Update sortOrder for each task
  await Promise.all(
    taskIds.map((taskId, index) =>
      prisma.transactionTask.update({
        where: { id: taskId },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
}

// ── Get Templates ───────────────────────────────────────────

export async function getTemplates(): Promise<
  Array<{
    id: string;
    name: string;
    type: string;
    isDefault: boolean;
    isActive: boolean;
    taskCount: number;
  }>
> {
  const ctx = await getCurrentOrg();

  const templates = await prisma.transactionTemplate.findMany({
    where: { orgId: ctx.orgId },
    include: { _count: { select: { tasks: true } } },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    isDefault: t.isDefault,
    isActive: t.isActive,
    taskCount: t._count.tasks,
  }));
}

// ── Transaction Stats ───────────────────────────────────────

export async function getTransactionStats(): Promise<TransactionStats> {
  const ctx = await getCurrentOrg();

  const [total, transactions, closedThisMonth] = await Promise.all([
    prisma.transaction.count({ where: { orgId: ctx.orgId } }),
    prisma.transaction.findMany({
      where: { orgId: ctx.orgId },
      select: { type: true, stage: true, createdAt: true, closedAt: true },
    }),
    (() => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return prisma.transaction.count({
        where: {
          orgId: ctx.orgId,
          stage: "closed",
          closedAt: { gte: startOfMonth },
        },
      });
    })(),
  ]);

  // Count by stage
  const byStage: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let openCount = 0;
  let closedCount = 0;
  let totalDaysToClose = 0;

  for (const t of transactions) {
    byStage[t.stage] = (byStage[t.stage] || 0) + 1;
    byType[t.type] = (byType[t.type] || 0) + 1;

    if (t.stage !== "closed" && t.stage !== "cancelled") {
      openCount++;
    }

    if (t.stage === "closed" && t.closedAt) {
      closedCount++;
      totalDaysToClose += Math.round(
        (t.closedAt.getTime() - t.createdAt.getTime()) / 86400000,
      );
    }
  }

  const avgDaysToClose = closedCount > 0 ? Math.round(totalDaysToClose / closedCount) : 0;

  return {
    total,
    byStage,
    byType,
    avgDaysToClose,
    openCount,
    closedThisMonth,
  };
}

// ── Recent Active Transactions (for dashboard) ──────────────

export async function getRecentActiveTransactions(limit = 5): Promise<TransactionRecord[]> {
  const ctx = await getCurrentOrg();

  const transactions = await prisma.transaction.findMany({
    where: {
      orgId: ctx.orgId,
      stage: { notIn: ["closed", "cancelled"] },
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      tasks: { select: { id: true, isCompleted: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return serialize(transactions) as TransactionRecord[];
}

// ── Link Invoice to Transaction ──────────────────────────────

export async function linkInvoiceToTransaction(
  transactionId: string,
  invoiceId: string,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId: ctx.orgId },
  });
  if (!invoice) throw new Error("Invoice not found");

  // Check invoice isn't already linked to another transaction
  const existingLink = await prisma.transaction.findUnique({
    where: { invoiceId },
  });
  if (existingLink && existingLink.id !== transactionId) {
    throw new Error("Invoice is already linked to another transaction");
  }

  // If agent has a default split, use it as fallback
  let agentSplitPct = transaction.agentSplitPct;
  if (!agentSplitPct && transaction.agentId) {
    const agent = await prisma.brokerAgent.findUnique({
      where: { id: transaction.agentId },
      select: { defaultSplitPct: true },
    });
    if (agent?.defaultSplitPct) agentSplitPct = agent.defaultSplitPct;
  }

  const commissionAmount = transaction.commissionAmount ?? invoice.totalCommission;
  const splitPct = agentSplitPct ? Number(agentSplitPct) : Number(invoice.agentSplitPct);
  const agentPayoutAmount = Number(commissionAmount) * splitPct / 100;
  const housePayoutAmount = Number(commissionAmount) - agentPayoutAmount;

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      invoiceId,
      invoiceCreatedAt: new Date(),
      commissionAmount: commissionAmount,
      agentSplitPct: splitPct,
      agentPayoutAmount,
      housePayoutAmount,
    },
  });

  // Upsert TransactionAgent record for primary agent with split info
  if (transaction.agentId) {
    await prisma.transactionAgent.upsert({
      where: {
        transactionId_agentId: { transactionId, agentId: transaction.agentId },
      },
      create: {
        transactionId,
        agentId: transaction.agentId,
        role: "primary",
        splitPct: splitPct,
        payoutAmount: agentPayoutAmount,
      },
      update: {
        splitPct: splitPct,
        payoutAmount: agentPayoutAmount,
      },
    });
  }

  logTransactionAction(ctx.orgId, actor(ctx), "invoice_linked", transactionId, {
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
  });

  return serialize(updated) as TransactionRecord;
}

// ── Create Invoice from Transaction ──────────────────────────

export async function createInvoiceFromTransaction(
  transactionId: string,
): Promise<{ success: boolean; invoice?: { id: string; invoiceNumber: string }; error?: string }> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true, defaultSplitPct: true } },
    },
  });
  if (!transaction) return { success: false, error: "Transaction not found" };
  if (transaction.invoiceId) return { success: false, error: "Transaction already has a linked invoice" };
  if (!transaction.commissionAmount) return { success: false, error: "Transaction has no commission amount set" };

  // Get brokerage info for invoice header
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: {
      name: true,
      address: true,
      phone: true,
      brandSettings: { select: { companyName: true } },
    },
  });

  const brokerageName = org?.brandSettings?.companyName || org?.name || "";

  // Calculate split
  let splitPct = transaction.agentSplitPct ? Number(transaction.agentSplitPct) : null;
  if (!splitPct && transaction.agent?.defaultSplitPct) {
    splitPct = Number(transaction.agent.defaultSplitPct);
  }
  splitPct = splitPct || 70;
  const houseSplitPct = 100 - splitPct;
  const commission = Number(transaction.commissionAmount);
  const agentPayout = commission * splitPct / 100;
  const housePayout = commission - agentPayout;

  // Map transaction type to deal type
  const dealType = transaction.type === "rental" ? "rental" : "sale";

  // Generate invoice number
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const lastInvoice = await prisma.invoice.findFirst({
    where: { orgId: ctx.orgId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let nextNum = 1;
  if (lastInvoice) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""), 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  const invoiceNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;

  const agentName = transaction.agent
    ? `${transaction.agent.firstName} ${transaction.agent.lastName}`
    : "Unknown Agent";

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice = await prisma.invoice.create({
    data: {
      orgId: ctx.orgId,
      invoiceNumber,
      agentId: transaction.agentId,
      dealSubmissionId: transaction.dealSubmissionId,
      brokerageName,
      brokerageAddress: org?.address,
      brokeragePhone: org?.phone,
      agentName,
      agentEmail: transaction.agent?.email,
      agentLicense: transaction.agent?.licenseNumber,
      propertyAddress: transaction.propertyAddress,
      dealType: dealType as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      transactionValue: transaction.transactionValue || 0,
      closingDate: transaction.closingDate,
      clientName: transaction.otherPartyName,
      totalCommission: commission,
      agentSplitPct: splitPct,
      houseSplitPct,
      agentPayout,
      housePayout,
      paymentTerms: "Net 30",
      issueDate,
      dueDate,
      status: "draft",
    },
  });

  // Link invoice to transaction and set financial data
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      invoiceId: invoice.id,
      invoiceCreatedAt: new Date(),
      agentSplitPct: splitPct,
      agentPayoutAmount: agentPayout,
      housePayoutAmount: housePayout,
    },
  });

  // Upsert TransactionAgent record for primary agent with split info
  if (transaction.agentId) {
    await prisma.transactionAgent.upsert({
      where: {
        transactionId_agentId: { transactionId, agentId: transaction.agentId },
      },
      create: {
        transactionId,
        agentId: transaction.agentId,
        role: "primary",
        splitPct: splitPct,
        payoutAmount: agentPayout,
      },
      update: {
        splitPct: splitPct,
        payoutAmount: agentPayout,
      },
    });
  }

  logTransactionAction(ctx.orgId, actor(ctx), "invoice_created_from_tx", transactionId, {
    invoiceId: invoice.id,
    invoiceNumber,
    commission,
  });

  return serialize({ success: true, invoice: { id: invoice.id, invoiceNumber } });
}

// ── Record Agent Payout (legacy — updates Transaction-level fields) ───

export async function recordAgentPayout(
  transactionId: string,
  data: AgentPayoutInput,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const payoutDate = data.date ? new Date(data.date) : new Date();

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      agentPayoutAmount: data.amount,
      agentPayoutDate: payoutDate,
      agentPayoutMethod: data.method,
      agentPayoutReference: data.reference || null,
      agentPayoutStatus: "paid",
      agentPaidAt: payoutDate,
      housePayoutAmount: transaction.commissionAmount
        ? Number(transaction.commissionAmount) - data.amount
        : null,
    },
  });

  // Also update/create the TransactionAgent record for the primary agent
  if (transaction.agentId) {
    await prisma.transactionAgent.upsert({
      where: {
        transactionId_agentId: {
          transactionId,
          agentId: transaction.agentId,
        },
      },
      create: {
        transactionId,
        agentId: transaction.agentId,
        role: "primary",
        payoutAmount: data.amount,
        payoutStatus: "paid",
        payoutDate,
        payoutMethod: data.method,
        payoutReference: data.reference || null,
      },
      update: {
        payoutAmount: data.amount,
        payoutStatus: "paid",
        payoutDate,
        payoutMethod: data.method,
        payoutReference: data.reference || null,
      },
    });
  }

  logTransactionAction(ctx.orgId, actor(ctx), "agent_payout_recorded", transactionId, {
    amount: data.amount,
    method: data.method,
    reference: data.reference,
  });

  return serialize(updated) as TransactionRecord;
}

// ── Add Agent to Split ───────────────────────────────────────

export async function addAgentToSplit(
  transactionId: string,
  input: TransactionAgentInput,
): Promise<TransactionAgentRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  // Verify agent belongs to this org
  const agent = await prisma.brokerAgent.findFirst({
    where: { id: input.agentId, orgId: ctx.orgId },
  });
  if (!agent) throw new Error("Agent not found");

  const record = await prisma.transactionAgent.create({
    data: {
      transactionId,
      agentId: input.agentId,
      role: input.role || "co_agent",
      splitPct: input.splitPct,
      payoutAmount: input.payoutAmount,
      notes: input.notes,
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  logTransactionAction(ctx.orgId, actor(ctx), "agent_added_to_split", transactionId, {
    agentId: input.agentId,
    agentName: `${agent.firstName} ${agent.lastName}`,
    role: input.role || "co_agent",
    splitPct: input.splitPct,
  });

  return serialize(record) as TransactionAgentRecord;
}

// ── Remove Agent from Split ──────────────────────────────────

export async function removeAgentFromSplit(
  transactionId: string,
  agentId: string,
): Promise<void> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const record = await prisma.transactionAgent.findUnique({
    where: { transactionId_agentId: { transactionId, agentId } },
    include: { agent: { select: { firstName: true, lastName: true } } },
  });
  if (!record) throw new Error("Agent split not found");

  await prisma.transactionAgent.delete({
    where: { transactionId_agentId: { transactionId, agentId } },
  });

  logTransactionAction(ctx.orgId, actor(ctx), "agent_removed_from_split", transactionId, {
    agentId,
    agentName: record.agent ? `${record.agent.firstName} ${record.agent.lastName}` : agentId,
  });
}

// ── Update Agent Split (Manual Override) ─────────────────────

export async function updateTransactionAgentSplit(
  transactionAgentId: string,
  data: { splitPct?: number; payoutAmount?: number; notes?: string },
): Promise<TransactionAgentRecord> {
  const ctx = await getCurrentOrg();

  // Fetch existing record + transaction in one go
  const existing = await prisma.transactionAgent.findUnique({
    where: { id: transactionAgentId },
    include: {
      transaction: { select: { id: true, orgId: true, commissionAmount: true } },
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!existing || existing.transaction.orgId !== ctx.orgId) {
    throw new Error("Agent split record not found");
  }

  const commission = existing.transaction.commissionAmount
    ? Number(existing.transaction.commissionAmount)
    : 0;

  // Bidirectional calculation
  // If payoutAmount provided (or both), payoutAmount takes precedence
  const updateData: Record<string, unknown> = {};
  const prevSplitPct = existing.splitPct != null ? Number(existing.splitPct) : null;
  const prevPayoutAmount = existing.payoutAmount != null ? Number(existing.payoutAmount) : null;

  if (data.payoutAmount !== undefined) {
    updateData.payoutAmount = data.payoutAmount;
    // Back-calculate splitPct from payoutAmount
    if (commission > 0) {
      updateData.splitPct = Math.round((data.payoutAmount / commission) * 10000) / 100;
    }
  } else if (data.splitPct !== undefined) {
    updateData.splitPct = data.splitPct;
    // Forward-calculate payoutAmount from splitPct
    if (commission > 0) {
      updateData.payoutAmount = Math.round(commission * data.splitPct) / 100;
    }
  }

  if (data.notes !== undefined) updateData.notes = data.notes;

  const record = await prisma.transactionAgent.update({
    where: { id: transactionAgentId },
    data: updateData,
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Recalculate house payout: commission - sum(all agent payouts)
  const allAgents = await prisma.transactionAgent.findMany({
    where: { transactionId: existing.transaction.id },
    select: { payoutAmount: true },
  });
  const totalAgentPayout = allAgents.reduce(
    (sum, a) => sum + (a.payoutAmount ? Number(a.payoutAmount) : 0),
    0,
  );
  const housePayout = commission > 0 ? commission - totalAgentPayout : null;

  await prisma.transaction.update({
    where: { id: existing.transaction.id },
    data: { housePayoutAmount: housePayout },
  });

  // Detailed audit log with previous → new values
  const newSplitPct = updateData.splitPct !== undefined ? Number(updateData.splitPct) : prevSplitPct;
  const newPayoutAmount = updateData.payoutAmount !== undefined ? Number(updateData.payoutAmount) : prevPayoutAmount;
  const agentName = existing.agent
    ? `${existing.agent.firstName} ${existing.agent.lastName}`
    : existing.agentId;

  logTransactionAction(ctx.orgId, actor(ctx), "agent_split_override", existing.transaction.id, {
    transactionAgentId,
    agentId: existing.agentId,
    agentName,
    splitPct: prevSplitPct !== newSplitPct ? `${prevSplitPct ?? "—"}% → ${newSplitPct ?? "—"}%` : undefined,
    payoutAmount: prevPayoutAmount !== newPayoutAmount ? `$${prevPayoutAmount ?? "—"} → $${newPayoutAmount ?? "—"}` : undefined,
    housePayout: housePayout != null ? `$${housePayout.toFixed(2)}` : undefined,
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  });

  return serialize(record) as TransactionAgentRecord;
}

// ── Legacy: Update Agent Split (by composite key) ────────────

export async function updateAgentSplit(
  transactionId: string,
  agentId: string,
  data: { splitPct?: number; payoutAmount?: number; role?: string; notes?: string },
): Promise<TransactionAgentRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const updateData: Record<string, unknown> = {};
  if (data.splitPct !== undefined) updateData.splitPct = data.splitPct;
  if (data.payoutAmount !== undefined) updateData.payoutAmount = data.payoutAmount;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const record = await prisma.transactionAgent.update({
    where: { transactionId_agentId: { transactionId, agentId } },
    data: updateData,
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  logTransactionAction(ctx.orgId, actor(ctx), "agent_split_updated", transactionId, {
    agentId,
    fields: Object.keys(updateData),
  });

  return serialize(record) as TransactionAgentRecord;
}

// ── Record Per-Agent Payout ──────────────────────────────────

export async function recordAgentSplitPayout(
  transactionId: string,
  agentId: string,
  data: AgentPayoutInput,
): Promise<TransactionAgentRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const payoutDate = data.date ? new Date(data.date) : new Date();

  const record = await prisma.transactionAgent.update({
    where: { transactionId_agentId: { transactionId, agentId } },
    data: {
      payoutAmount: data.amount,
      payoutStatus: "paid",
      payoutDate,
      payoutMethod: data.method,
      payoutReference: data.reference || null,
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Check if all agents are paid → update transaction-level status
  const allAgents = await prisma.transactionAgent.findMany({
    where: { transactionId },
    select: { payoutStatus: true },
  });
  const allPaid = allAgents.every((a) => a.payoutStatus === "paid");

  if (allPaid) {
    const totalPaid = await prisma.transactionAgent.aggregate({
      where: { transactionId },
      _sum: { payoutAmount: true },
    });
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        agentPayoutStatus: "paid",
        agentPaidAt: payoutDate,
        agentPayoutAmount: totalPaid._sum.payoutAmount,
        housePayoutAmount: transaction.commissionAmount
          ? Number(transaction.commissionAmount) - Number(totalPaid._sum.payoutAmount || 0)
          : null,
      },
    });
  }

  logTransactionAction(ctx.orgId, actor(ctx), "agent_payout_recorded", transactionId, {
    agentId,
    amount: data.amount,
    method: data.method,
    reference: data.reference,
  });

  return serialize(record) as TransactionAgentRecord;
}

// ── Get Transaction Agents ───────────────────────────────────

export async function getTransactionAgents(
  transactionId: string,
): Promise<TransactionAgentRecord[]> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const agents = await prisma.transactionAgent.findMany({
    where: { transactionId },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return serialize(agents) as TransactionAgentRecord[];
}

// ── Mark Commission Received ─────────────────────────────────

export async function markCommissionReceived(
  transactionId: string,
): Promise<TransactionRecord> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
  });
  if (!transaction) throw new Error("Transaction not found");

  const updateData: Record<string, unknown> = {
    commissionReceivedAt: new Date(),
  };

  // Auto-advance to payment_received if currently at invoice_sent
  const stages = getStagesForType(transaction.type);
  const currentIndex = stages.indexOf(transaction.stage);
  const paymentReceivedIndex = stages.indexOf("payment_received");
  if (currentIndex >= 0 && paymentReceivedIndex >= 0 && currentIndex < paymentReceivedIndex) {
    updateData.stage = "payment_received";
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  logTransactionAction(ctx.orgId, actor(ctx), "commission_received", transactionId);

  return serialize(updated) as TransactionRecord;
}

// ── Sync Transaction from Invoice Events ─────────────────────

export async function syncTransactionFromInvoice(
  invoiceId: string,
  event: "sent" | "paid",
): Promise<void> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { invoiceId },
    });
    if (!transaction) return;

    const stages = getStagesForType(transaction.type);
    const currentIndex = stages.indexOf(transaction.stage);

    if (event === "sent") {
      const invoiceSentIndex = stages.indexOf("invoice_sent");
      const updateData: Record<string, unknown> = { invoiceSentAt: new Date() };
      if (currentIndex >= 0 && invoiceSentIndex >= 0 && currentIndex < invoiceSentIndex) {
        updateData.stage = "invoice_sent";
      }
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
    } else if (event === "paid") {
      const paymentReceivedIndex = stages.indexOf("payment_received");
      const updateData: Record<string, unknown> = { commissionReceivedAt: new Date() };
      if (currentIndex >= 0 && paymentReceivedIndex >= 0 && currentIndex < paymentReceivedIndex) {
        updateData.stage = "payment_received";
      }
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
    }
  } catch (error) {
    // Fire-and-forget — don't block the calling action
    console.error("syncTransactionFromInvoice error:", error);
  }
}

// ── Get Deal Timeline ────────────────────────────────────────

export async function getDealTimeline(
  transactionId: string,
): Promise<TimelineEvent[]> {
  const ctx = await getCurrentOrg();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, orgId: ctx.orgId },
    include: {
      tasks: { where: { isCompleted: true }, select: { id: true, title: true, completedAt: true, completedBy: true } },
      dealSubmission: { select: { id: true, createdAt: true, status: true, updatedAt: true } },
      invoice: {
        select: {
          id: true, invoiceNumber: true, status: true, totalCommission: true,
          createdAt: true, issueDate: true, paidDate: true,
          payments: { select: { id: true, amount: true, paymentDate: true, paymentMethod: true } },
        },
      },
      agents: {
        where: { payoutStatus: "paid" },
        include: { agent: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!transaction) throw new Error("Transaction not found");

  const events: TimelineEvent[] = [];

  // Transaction creation
  events.push({
    id: `tx-created-${transaction.id}`,
    type: "status_change",
    title: "Transaction created",
    description: `${transaction.propertyAddress}`,
    timestamp: transaction.createdAt.toISOString(),
    actor: "System",
  });

  // Deal submission events
  if (transaction.dealSubmission) {
    events.push({
      id: `sub-created-${transaction.dealSubmission.id}`,
      type: "deal_submitted",
      title: "Deal submitted",
      timestamp: transaction.dealSubmission.createdAt.toISOString(),
    });
    if (transaction.dealSubmission.status === "approved") {
      events.push({
        id: `sub-approved-${transaction.dealSubmission.id}`,
        type: "deal_approved",
        title: "Deal approved",
        timestamp: transaction.dealSubmission.updatedAt.toISOString(),
      });
    }
  }

  // Lifecycle timestamps
  if (transaction.invoiceCreatedAt) {
    events.push({
      id: `tx-invoice-created`,
      type: "invoice_created",
      title: "Invoice created",
      description: transaction.invoice ? `${transaction.invoice.invoiceNumber}` : undefined,
      timestamp: transaction.invoiceCreatedAt.toISOString(),
      amount: transaction.invoice ? Number(transaction.invoice.totalCommission) : undefined,
    });
  }
  if (transaction.invoiceSentAt) {
    events.push({
      id: `tx-invoice-sent`,
      type: "invoice_sent",
      title: "Invoice sent",
      description: transaction.invoice ? `${transaction.invoice.invoiceNumber}` : undefined,
      timestamp: transaction.invoiceSentAt.toISOString(),
    });
  }
  if (transaction.commissionReceivedAt) {
    events.push({
      id: `tx-commission-received`,
      type: "payment_received",
      title: "Commission received",
      timestamp: transaction.commissionReceivedAt.toISOString(),
      amount: transaction.commissionAmount ? Number(transaction.commissionAmount) : undefined,
    });
  }
  if (transaction.agentPaidAt) {
    events.push({
      id: `tx-agent-paid`,
      type: "agent_payout",
      title: "Agent payout processed",
      description: transaction.agentPayoutMethod
        ? `via ${transaction.agentPayoutMethod}${transaction.agentPayoutReference ? ` (${transaction.agentPayoutReference})` : ""}`
        : undefined,
      timestamp: transaction.agentPaidAt.toISOString(),
      amount: transaction.agentPayoutAmount ? Number(transaction.agentPayoutAmount) : undefined,
    });
  }

  // Per-agent payout events from TransactionAgent records
  for (const ta of transaction.agents) {
    if (ta.payoutDate) {
      const agentName = ta.agent
        ? `${ta.agent.firstName} ${ta.agent.lastName}`
        : "Agent";
      events.push({
        id: `agent-payout-${ta.id}`,
        type: "agent_payout",
        title: `${agentName} payout (${ta.role === "primary" ? "Primary" : ta.role === "co_agent" ? "Co-Agent" : "Referral"})`,
        description: ta.payoutMethod
          ? `via ${ta.payoutMethod}${ta.payoutReference ? ` (${ta.payoutReference})` : ""}`
          : undefined,
        timestamp: ta.payoutDate.toISOString(),
        amount: ta.payoutAmount ? Number(ta.payoutAmount) : undefined,
      });
    }
  }
  if (transaction.closedAt) {
    events.push({
      id: `tx-closed`,
      type: "status_change",
      title: "Transaction closed",
      timestamp: transaction.closedAt.toISOString(),
    });
  }
  if (transaction.cancelledAt) {
    events.push({
      id: `tx-cancelled`,
      type: "status_change",
      title: "Transaction cancelled",
      description: transaction.cancelReason || undefined,
      timestamp: transaction.cancelledAt.toISOString(),
    });
  }

  // Invoice payments
  if (transaction.invoice?.payments) {
    for (const p of transaction.invoice.payments) {
      events.push({
        id: `payment-${p.id}`,
        type: "payment_received",
        title: "Payment recorded",
        description: `${p.paymentMethod} payment`,
        timestamp: p.paymentDate.toISOString(),
        amount: Number(p.amount),
      });
    }
  }

  // Completed tasks
  for (const task of transaction.tasks) {
    if (task.completedAt) {
      events.push({
        id: `task-${task.id}`,
        type: "task_completed",
        title: task.title,
        timestamp: task.completedAt.toISOString(),
        actor: task.completedBy || undefined,
      });
    }
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return serialize(events) as TimelineEvent[];
}

// ── Agent Payout Summary ─────────────────────────────────────

export async function getAgentPayoutSummary(
  agentId?: string,
): Promise<AgentPayoutSummary> {
  const ctx = await getCurrentOrg();

  // If agentId is provided, prefer TransactionAgent records for per-agent attribution
  if (agentId) {
    const agentSplits = await prisma.transactionAgent.findMany({
      where: { agentId },
      include: {
        transaction: {
          select: { id: true, orgId: true, propertyAddress: true, commissionAmount: true },
        },
      },
    });

    // Filter to this org
    const orgSplits = agentSplits.filter((s) => s.transaction.orgId === ctx.orgId);

    // If agent has TransactionAgent records, use those
    if (orgSplits.length > 0) {
      let totalPaid = 0;
      let totalPending = 0;
      const payouts = orgSplits.map((s) => {
        const amount = Number(s.payoutAmount || 0);
        if (s.payoutStatus === "paid") {
          totalPaid += amount;
        } else if (amount > 0) {
          totalPending += amount;
        }
        return {
          transactionId: s.transactionId,
          propertyAddress: s.transaction.propertyAddress,
          commissionAmount: Number(s.transaction.commissionAmount || 0),
          agentPayoutAmount: amount,
          agentPayoutStatus: s.payoutStatus || "pending",
          agentPayoutDate: s.payoutDate?.toISOString(),
        };
      });

      return serialize({ totalPaid, totalPending, payouts }) as AgentPayoutSummary;
    }
  }

  // Fallback: legacy Transaction-level payout fields
  const where: Record<string, unknown> = {
    orgId: ctx.orgId,
    agentPayoutAmount: { not: null },
  };
  if (agentId) where.agentId = agentId;

  const transactions = await prisma.transaction.findMany({
    where: where as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    select: {
      id: true,
      propertyAddress: true,
      commissionAmount: true,
      agentPayoutAmount: true,
      agentPayoutStatus: true,
      agentPayoutDate: true,
    },
  });

  let totalPaid = 0;
  let totalPending = 0;
  const payouts = transactions.map((t) => {
    const amount = Number(t.agentPayoutAmount || 0);
    if (t.agentPayoutStatus === "paid") {
      totalPaid += amount;
    } else {
      totalPending += amount;
    }
    return {
      transactionId: t.id,
      propertyAddress: t.propertyAddress,
      commissionAmount: Number(t.commissionAmount || 0),
      agentPayoutAmount: amount,
      agentPayoutStatus: t.agentPayoutStatus || "pending",
      agentPayoutDate: t.agentPayoutDate?.toISOString(),
    };
  });

  return serialize({ totalPaid, totalPending, payouts }) as AgentPayoutSummary;
}
