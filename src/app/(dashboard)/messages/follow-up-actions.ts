"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

export interface FollowUpData {
  id: string;
  threadId: string;
  reason: string;
  status: string;
  dueAt: string;
  contactName: string | null;
  contactId: string | null;
  subject: string | null;
}

export async function getPendingFollowUps(): Promise<FollowUpData[]> {
  const user = await getUser();
  if (!user) return [];

  const followUps = await prisma.followUpReminder.findMany({
    where: { orgId: user.orgId, status: "pending" },
    orderBy: { dueAt: "asc" },
    include: {
      contact: { select: { firstName: true, lastName: true } },
    },
  });

  // Get thread subjects
  const threadIds = followUps.map(f => f.threadId);
  const threadSubjects = await prisma.emailMessage.findMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    select: { threadId: true, subject: true },
    distinct: ["threadId"],
    orderBy: { receivedAt: "asc" },
  });

  const subjectMap = new Map<string, string | null>();
  for (const t of threadSubjects) {
    if (t.threadId) subjectMap.set(t.threadId, t.subject);
  }

  return followUps.map(f => ({
    id: f.id,
    threadId: f.threadId,
    reason: f.reason,
    status: f.status,
    dueAt: f.dueAt.toISOString(),
    contactName: f.contact ? `${f.contact.firstName} ${f.contact.lastName}`.trim() : null,
    contactId: f.contactId,
    subject: subjectMap.get(f.threadId) || null,
  }));
}

export async function getFollowUpCount(): Promise<number> {
  const user = await getUser();
  if (!user) return 0;

  return prisma.followUpReminder.count({
    where: { orgId: user.orgId, status: "pending" },
  });
}

export async function dismissFollowUp(reminderId: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.followUpReminder.updateMany({
    where: { id: reminderId, orgId: user.orgId },
    data: { status: "dismissed", dismissedAt: new Date() },
  });
}

export async function snoozeFollowUp(reminderId: string, snoozeUntil: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.followUpReminder.updateMany({
    where: { id: reminderId, orgId: user.orgId },
    data: { dueAt: new Date(snoozeUntil) },
  });
}
