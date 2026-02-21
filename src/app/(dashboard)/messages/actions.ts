"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getUserGmailAccount } from "@/lib/gmail";
import { initialSync, incrementalSync } from "@/lib/gmail-sync";
import { sendEmail } from "@/lib/gmail-send";
import { checkFollowUps } from "@/lib/follow-up-checker";
import type { LabelData } from "./label-actions";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

// ============================================================
// Thread Grouping
// ============================================================
export interface ThreadSummary {
  threadId: string;
  subject: string | null;
  participants: { email: string; name: string | null; contactId: string | null; contactName: string | null }[];
  messageCount: number;
  lastMessageAt: string;
  snippet: string | null;
  isRead: boolean;
  isPinned: boolean;
  isSnoozed: boolean;
  snoozedUntil: string | null;
  category: string | null;
  isArchived: boolean;
  labels: LabelData[];
  leadSource: string | null;
  leadIntent: string | null;
  sentimentScore: number | null;
  aiSummary: string | null;
  extractedPhone: string | null;
  extractedBudget: string | null;
  extractedArea: string | null;
  latestDirection: string;
  latestFromName: string | null;
  latestFromEmail: string;
  latestToEmails: string[];
  contactId: string | null;
  contactName: string | null;
}

export async function getThreads(filters?: {
  search?: string;
  isRead?: boolean;
  leadSource?: string;
  hasContact?: boolean;
  leadIntent?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  isPinned?: boolean;
  isSnoozed?: boolean;
  labelId?: string;
  gmailFolder?: string;
}): Promise<ThreadSummary[]> {
  const user = await getUser();
  if (!user) return [];

  const folder = filters?.gmailFolder || "INBOX";
  const where: any = { orgId: user.orgId };

  if (folder === "INBOX") {
    where.isDeleted = false;
    where.isArchived = false;
    if (filters?.isSnoozed) {
      where.snoozedUntil = { not: null };
    } else {
      where.AND = [
        {
          OR: [
            { snoozedUntil: null },
            { snoozedUntil: { lte: new Date() } },
          ],
        },
      ];
    }
  } else if (folder !== "ALL") {
    where.labelIds = { has: folder };
  }

  if (filters?.search) {
    const searchOr = [
      { subject: { contains: filters.search, mode: "insensitive" } },
      { fromName: { contains: filters.search, mode: "insensitive" } },
      { fromEmail: { contains: filters.search, mode: "insensitive" } },
      { snippet: { contains: filters.search, mode: "insensitive" } },
    ];
    if (where.AND) {
      where.AND.push({ OR: searchOr });
    } else {
      where.OR = searchOr;
    }
  }
  if (filters?.isRead !== undefined) where.isRead = filters.isRead;
  if (filters?.leadSource) where.leadSource = filters.leadSource;
  if (filters?.hasContact === true) where.contactId = { not: null };
  if (filters?.hasContact === false) where.contactId = null;
  if (filters?.leadIntent) where.leadIntent = filters.leadIntent;
  if (filters?.category) where.category = filters.category;
  if (filters?.isPinned) where.isPinned = true;
  if (filters?.dateFrom || filters?.dateTo) {
    where.receivedAt = {};
    if (filters?.dateFrom) where.receivedAt.gte = new Date(filters.dateFrom);
    if (filters?.dateTo) where.receivedAt.lte = new Date(filters.dateTo);
  }

  const emails = await prisma.emailMessage.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 500,
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Group by threadId
  const threadMap = new Map<string, typeof emails>();
  for (const e of emails) {
    const tid = e.threadId || e.id;
    if (!threadMap.has(tid)) threadMap.set(tid, []);
    threadMap.get(tid)!.push(e);
  }

  // Fetch labels for all thread IDs
  const allThreadIds = Array.from(threadMap.keys());
  const threadLabels = await prisma.emailThreadLabel.findMany({
    where: { threadId: { in: allThreadIds } },
    include: { label: true },
  });
  const labelsByThread = new Map<string, LabelData[]>();
  for (const tl of threadLabels) {
    if (!labelsByThread.has(tl.threadId)) labelsByThread.set(tl.threadId, []);
    labelsByThread.get(tl.threadId)!.push({
      id: tl.label.id,
      name: tl.label.name,
      color: tl.label.color,
      icon: tl.label.icon,
    });
  }

  // If filtering by labelId, only keep threads that have the label
  if (filters?.labelId) {
    const labelThreadIds = new Set(
      threadLabels.filter(tl => tl.labelId === filters.labelId).map(tl => tl.threadId)
    );
    for (const tid of allThreadIds) {
      if (!labelThreadIds.has(tid)) threadMap.delete(tid);
    }
  }

  const threads: ThreadSummary[] = [];
  for (const [threadId, msgs] of threadMap) {
    msgs.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    const latest = msgs[msgs.length - 1];
    const first = msgs[0];
    const isRead = msgs.every(m => m.isRead);
    const isPinned = msgs.some(m => m.isPinned);
    const snoozedMsg = msgs.find(m => m.snoozedUntil !== null);
    const category = first.category || msgs.find(m => m.category)?.category || null;

    const participantMap = new Map<string, { email: string; name: string | null; contactId: string | null; contactName: string | null }>();
    for (const m of msgs) {
      if (!participantMap.has(m.fromEmail)) {
        participantMap.set(m.fromEmail, {
          email: m.fromEmail,
          name: m.fromName,
          contactId: m.contact?.id || null,
          contactName: m.contact ? (m.contact.firstName + " " + m.contact.lastName).trim() : null,
        });
      }
    }

    const aiMsg = msgs.find(m => m.aiParsed);

    threads.push({
      threadId,
      subject: first.subject,
      participants: Array.from(participantMap.values()),
      messageCount: msgs.length,
      lastMessageAt: latest.receivedAt.toISOString(),
      snippet: latest.snippet,
      isRead,
      isPinned,
      isSnoozed: !!snoozedMsg,
      snoozedUntil: snoozedMsg?.snoozedUntil?.toISOString() || null,
      category,
      isArchived: latest.isArchived,
      labels: labelsByThread.get(threadId) || [],
      leadSource: aiMsg?.leadSource || null,
      leadIntent: aiMsg?.leadIntent || null,
      sentimentScore: aiMsg?.sentimentScore || null,
      aiSummary: aiMsg?.aiSummary || null,
      extractedPhone: aiMsg?.extractedPhone || null,
      extractedBudget: aiMsg?.extractedBudget || null,
      extractedArea: aiMsg?.extractedArea || null,
      latestDirection: latest.direction,
      latestFromName: latest.fromName,
      latestFromEmail: latest.fromEmail,
      latestToEmails: latest.toEmails,
      contactId: latest.contact?.id || first.contact?.id || null,
      contactName: latest.contact ? (latest.contact.firstName + " " + latest.contact.lastName).trim() : first.contact ? (first.contact.firstName + " " + first.contact.lastName).trim() : null,
    });
  }

  // Sort: pinned first, then by most recent
  threads.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
  return threads;
}

// ============================================================
// Thread Detail
// ============================================================
export async function getThreadMessages(threadId: string) {
  const user = await getUser();
  if (!user) return [];

  const emails = await prisma.emailMessage.findMany({
    where: { orgId: user.orgId, threadId },
    orderBy: { receivedAt: "asc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // If threadId didn't match, try it as a message id
  if (emails.length === 0) {
    const single = await prisma.emailMessage.findFirst({
      where: { orgId: user.orgId, id: threadId },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return single ? [single] : [];
  }

  return emails;
}

export async function markThreadAsRead(threadId: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId },
    data: { isRead: true },
  });
}

// ============================================================
// Contact Lookup & Quick Create
// ============================================================
export async function findContactByEmail(email: string) {
  const user = await getUser();
  if (!user) return null;

  return prisma.contact.findFirst({
    where: { orgId: user.orgId, email: { equals: email, mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

export async function quickCreateContact(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  sourceDetail?: string;
  notes?: string;
  status: "lead" | "active";
}) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const contact = await prisma.contact.create({
      data: {
        orgId: user.orgId,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        phone: params.phone || null,
        source: params.source || "email",
        sourceDetail: params.sourceDetail || "Created from Messages inbox",
        notes: params.notes || null,
        status: params.status,
      },
    });

    // Link all existing emails from this sender to the new contact
    await prisma.emailMessage.updateMany({
      where: {
        orgId: user.orgId,
        contactId: null,
        OR: [
          { fromEmail: { equals: params.email, mode: "insensitive" } },
          { toEmails: { has: params.email.toLowerCase() } },
        ],
      },
      data: { contactId: contact.id },
    });

    return { success: true, contactId: contact.id };
  } catch (err: any) {
    console.error("Quick create contact error:", err);
    return { error: err.message };
  }
}

// ============================================================
// Gmail Sync
// ============================================================
export async function syncGmail() {
  console.log("=== GMAIL SYNC START ===");
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const gmailAccount = await getUserGmailAccount(user.id);
  if (!gmailAccount) return { error: "Gmail not connected" };

  try {
    let result;
    if (gmailAccount.syncedAt) {
      result = await incrementalSync(gmailAccount.id);
    } else {
      result = await initialSync(gmailAccount.id);
    }

    // Check for follow-ups after sync
    try {
      await checkFollowUps(user.orgId);
    } catch (err) {
      console.error("Follow-up check error:", err);
    }

    return result;
  } catch (err: any) {
    console.error("Sync error:", err);
    return { error: err.message };
  }
}

// ============================================================
// Send & Reply
// ============================================================
export async function sendNewEmail(to: string, subject: string, bodyHtml: string, contactId?: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const gmailAccount = await getUserGmailAccount(user.id);
  if (!gmailAccount) return { error: "Gmail not connected" };

  try {
    const result = await sendEmail({
      gmailAccountId: gmailAccount.id,
      orgId: user.orgId,
      to,
      subject,
      bodyHtml,
      contactId,
    });
    return { success: true, id: result.id };
  } catch (err: any) {
    console.error("Send error:", err);
    return { error: err.message };
  }
}

export async function replyToEmail(emailId: string, bodyHtml: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const gmailAccount = await getUserGmailAccount(user.id);
  if (!gmailAccount) return { error: "Gmail not connected" };

  const original = await prisma.emailMessage.findFirst({
    where: { id: emailId, orgId: user.orgId },
  });
  if (!original) return { error: "Email not found" };

  const replyTo = original.direction === "inbound" ? original.fromEmail : original.toEmails[0];

  try {
    const result = await sendEmail({
      gmailAccountId: gmailAccount.id,
      orgId: user.orgId,
      to: replyTo,
      subject: "Re: " + (original.subject || ""),
      bodyHtml,
      replyToMessageId: original.gmailMessageId,
      contactId: original.contactId || undefined,
    });
    return { success: true, id: result.id };
  } catch (err: any) {
    console.error("Reply error:", err);
    return { error: err.message };
  }
}

// ============================================================
// Utilities
// ============================================================
export async function markAsRead(emailId: string) {
  const user = await getUser();
  if (!user) return;
  await prisma.emailMessage.updateMany({
    where: { id: emailId, orgId: user.orgId },
    data: { isRead: true },
  });
}

export async function getUnreadCount() {
  const user = await getUser();
  if (!user) return 0;
  return prisma.emailMessage.count({
    where: { orgId: user.orgId, isRead: false, direction: "inbound" },
  });
}

export async function getContactsForAutocomplete(query: string) {
  const user = await getUser();
  if (!user) return [];

  return prisma.contact.findMany({
    where: {
      orgId: user.orgId,
      email: { not: null },
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    take: 10,
  });
}

export async function getTemplates() {
  const user = await getUser();
  if (!user) return [];

  return prisma.emailTemplate.findMany({
    where: { orgId: user.orgId },
    orderBy: { timesUsed: "desc" },
    take: 50,
  });
}
