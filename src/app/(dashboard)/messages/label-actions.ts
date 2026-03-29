"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

export interface LabelData {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

const DEFAULT_LABELS: Array<{ name: string; color: string; icon: string }> = [
  { name: "Hot Lead", color: "#ef4444", icon: "🔥" },
  { name: "Follow Up", color: "#f59e0b", icon: "📞" },
  { name: "Active Deal", color: "#22c55e", icon: "💰" },
  { name: "Showing", color: "#6366f1", icon: "🏠" },
  { name: "Archived", color: "#94a3b8", icon: "📦" },
];

// ============================================================
// Label CRUD
// ============================================================

export async function getLabels(): Promise<LabelData[]> {
  const user = await getUser();
  if (!user) return [];

  const labels = await prisma.emailLabel.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "asc" },
  });

  return labels.map(l => ({
    id: l.id,
    name: l.name,
    color: l.color,
    icon: l.icon,
  }));
}

export async function ensureDefaultLabels(): Promise<LabelData[]> {
  const user = await getUser();
  if (!user) return [];

  const existing = await prisma.emailLabel.count({ where: { orgId: user.orgId } });
  if (existing > 0) {
    return getLabels();
  }

  // Seed defaults
  await prisma.emailLabel.createMany({
    data: DEFAULT_LABELS.map(l => ({
      orgId: user.orgId,
      name: l.name,
      color: l.color,
      icon: l.icon,
    })),
  });

  return getLabels();
}

export async function createLabel(name: string, color: string, icon?: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const label = await prisma.emailLabel.create({
      data: {
        orgId: user.orgId,
        name,
        color,
        icon: icon || null,
      },
    });
    return { id: label.id, name: label.name, color: label.color, icon: label.icon };
  } catch (err: any) {
    if (err.code === "P2002") return { error: "Label already exists" };
    return { error: err.message };
  }
}

export async function updateLabel(labelId: string, data: { name?: string; color?: string; icon?: string }) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  await prisma.emailLabel.updateMany({
    where: { id: labelId, orgId: user.orgId },
    data,
  });
  return { success: true };
}

export async function deleteLabel(labelId: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  await prisma.emailLabel.deleteMany({
    where: { id: labelId, orgId: user.orgId },
  });
  return { success: true };
}

// ============================================================
// Thread Labels
// ============================================================

export async function getThreadLabels(threadIds: string[]): Promise<Record<string, LabelData[]>> {
  const user = await getUser();
  if (!user) return {};

  // Get all messages for these threads to find emailMessageIds
  const messages = await prisma.emailMessage.findMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    select: { id: true, threadId: true },
    distinct: ["threadId"],
  });

  const messageIdToThreadId = new Map<string, string>();
  for (const m of messages) {
    if (m.threadId) messageIdToThreadId.set(m.id, m.threadId);
  }

  const threadLabels = await prisma.emailThreadLabel.findMany({
    where: { threadId: { in: threadIds } },
    include: { label: true },
  });

  const result: Record<string, LabelData[]> = {};
  for (const tl of threadLabels) {
    if (!result[tl.threadId]) result[tl.threadId] = [];
    result[tl.threadId].push({
      id: tl.label.id,
      name: tl.label.name,
      color: tl.label.color,
      icon: tl.label.icon,
    });
  }

  return result;
}

export async function applyLabel(threadId: string, labelId: string) {
  const user = await getUser();
  if (!user) return;

  try {
    await prisma.emailThreadLabel.create({
      data: { threadId, labelId },
    });
  } catch {
    // Already applied — ignore unique constraint
  }
}

export async function removeLabel(threadId: string, labelId: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailThreadLabel.deleteMany({
    where: { threadId, labelId },
  });
}
