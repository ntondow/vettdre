"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getUserGmailAccount, getValidToken } from "@/lib/gmail";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

async function getGmailToken(userId: string): Promise<string | null> {
  const account = await getUserGmailAccount(userId);
  if (!account) return null;
  return getValidToken(account.id);
}

/** Get Gmail message IDs for threads */
async function getGmailMessageIds(orgId: string, threadIds: string[]): Promise<string[]> {
  const messages = await prisma.emailMessage.findMany({
    where: { orgId, threadId: { in: threadIds } },
    select: { gmailMessageId: true },
  });
  return messages.map(m => m.gmailMessageId);
}

/** Gmail batch modify — add/remove labels on multiple messages */
async function gmailBatchModify(
  token: string,
  messageIds: string[],
  addLabelIds?: string[],
  removeLabelIds?: string[],
) {
  if (messageIds.length === 0) return;
  const res = await fetch(`${GMAIL_API}/messages/batchModify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ids: messageIds,
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || [],
    }),
  });
  if (!res.ok) {
    console.error("Gmail batchModify failed:", res.status, await res.text());
  }
}

// ============================================================
// Bulk Actions
// ============================================================

export async function bulkMarkRead(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isRead: true },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, undefined, ["UNREAD"]);
  }
}

export async function bulkMarkUnread(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isRead: false },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, ["UNREAD"]);
  }
}

export async function bulkStar(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isStarred: true },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, ["STARRED"]);
  }
}

export async function bulkUnstar(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isStarred: false },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, undefined, ["STARRED"]);
  }
}

export async function bulkPin(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  // Pin is DB-only, no Gmail equivalent
  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isPinned: true },
  });
}

export async function bulkUnpin(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isPinned: false },
  });
}

export async function bulkArchive(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isArchived: true },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, undefined, ["INBOX"]);
  }
}

export async function bulkDelete(threadIds: string[]) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { isDeleted: true },
  });

  const token = await getGmailToken(user.id);
  if (token) {
    const gmailIds = await getGmailMessageIds(user.orgId, threadIds);
    await gmailBatchModify(token, gmailIds, ["TRASH"]);
  }
}

export async function bulkSnooze(threadIds: string[], snoozeUntil: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId: { in: threadIds } },
    data: { snoozedUntil: new Date(snoozeUntil), isRead: true },
  });
}

// ============================================================
// Individual Thread Actions
// ============================================================

export async function togglePinThread(threadId: string) {
  const user = await getUser();
  if (!user) return;

  const firstMsg = await prisma.emailMessage.findFirst({
    where: { orgId: user.orgId, threadId },
    select: { isPinned: true },
  });

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId },
    data: { isPinned: !firstMsg?.isPinned },
  });

  return { isPinned: !firstMsg?.isPinned };
}

export async function snoozeThread(threadId: string, snoozeUntil: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId },
    data: { snoozedUntil: new Date(snoozeUntil), isRead: true },
  });
}

export async function unsnoozeThread(threadId: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailMessage.updateMany({
    where: { orgId: user.orgId, threadId },
    data: { snoozedUntil: null },
  });
}
