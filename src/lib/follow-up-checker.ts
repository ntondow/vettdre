/**
 * Follow-up reminder generation — finds lead threads awaiting reply.
 */

import prisma from "@/lib/prisma";

/**
 * Find threads where the last message is inbound and older than 24h,
 * and upsert FollowUpReminder records for them.
 * Also auto-complete reminders for threads where we've since replied.
 */
export async function checkFollowUps(orgId: string) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find threads with lead category where last message is inbound and >24h old
  // Using raw SQL for efficient DISTINCT ON query
  const staleThreads: Array<{
    thread_id: string;
    contact_id: string | null;
    received_at: Date;
    direction: string;
  }> = await prisma.$queryRaw`
    SELECT DISTINCT ON (thread_id)
      thread_id, contact_id, received_at, direction
    FROM email_messages
    WHERE org_id = ${orgId}
      AND thread_id IS NOT NULL
      AND is_deleted = false
      AND is_archived = false
      AND (category = 'lead' OR category = 'personal')
    ORDER BY thread_id, received_at DESC
  `;

  // Filter to threads where the latest message is inbound and >24h old
  const needsFollowUp = staleThreads.filter(
    t => t.direction === "inbound" && t.received_at < twentyFourHoursAgo
  );

  // Upsert follow-up reminders
  for (const thread of needsFollowUp) {
    try {
      await prisma.followUpReminder.upsert({
        where: {
          orgId_threadId_reason: {
            orgId,
            threadId: thread.thread_id,
            reason: "no_reply_24h",
          },
        },
        create: {
          orgId,
          threadId: thread.thread_id,
          contactId: thread.contact_id,
          reason: "no_reply_24h",
          dueAt: new Date(), // due now
          status: "pending",
        },
        update: {}, // don't overwrite if already exists
      });
    } catch {
      // unique constraint race condition — ignore
    }
  }

  // Auto-complete reminders for threads where we've replied since the reminder was created
  const repliedThreadIds = staleThreads
    .filter(t => t.direction === "outbound")
    .map(t => t.thread_id);

  if (repliedThreadIds.length > 0) {
    await prisma.followUpReminder.updateMany({
      where: {
        orgId,
        threadId: { in: repliedThreadIds },
        status: "pending",
      },
      data: {
        status: "completed",
      },
    });
  }
}
