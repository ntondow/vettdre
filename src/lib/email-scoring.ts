/**
 * Email engagement scoring — calculates a 0-100 score for a contact.
 * Called on-demand from CRM sidebar, not during sync.
 */

import prisma from "@/lib/prisma";

export interface EngagementScore {
  total: number;
  level: "High" | "Medium" | "Low" | "None";
  factors: {
    frequency: number;     // 0-15
    recency: number;       // 0-15
    responseSpeed: number; // 0-15
    threadDepth: number;   // 0-10
    initiative: number;    // 0-10
  };
}

export async function calculateEmailEngagementScore(
  contactId: string,
  orgId: string,
): Promise<EngagementScore> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const emails = await prisma.emailMessage.findMany({
    where: { orgId, contactId },
    orderBy: { receivedAt: "desc" },
    select: {
      direction: true,
      receivedAt: true,
      threadId: true,
    },
    take: 200,
  });

  if (emails.length === 0) {
    return { total: 0, level: "None", factors: { frequency: 0, recency: 0, responseSpeed: 0, threadDepth: 0, initiative: 0 } };
  }

  // Frequency score (0-15): emails in last 30 days
  const recentEmails = emails.filter(e => e.receivedAt > thirtyDaysAgo);
  const frequency = Math.min(15, Math.round((recentEmails.length / 20) * 15));

  // Recency score (0-15): how recent was the last email
  const lastEmail = emails[0];
  const daysSinceLast = (Date.now() - lastEmail.receivedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recency = daysSinceLast < 1 ? 15 :
                  daysSinceLast < 3 ? 12 :
                  daysSinceLast < 7 ? 9 :
                  daysSinceLast < 14 ? 6 :
                  daysSinceLast < 30 ? 3 : 0;

  // Response speed (0-15): average time between inbound and our reply in same thread
  const threadMap = new Map<string, typeof emails>();
  for (const e of emails) {
    const tid = e.threadId || "unknown";
    if (!threadMap.has(tid)) threadMap.set(tid, []);
    threadMap.get(tid)!.push(e);
  }

  let totalResponseTime = 0;
  let responseCount = 0;
  for (const msgs of threadMap.values()) {
    msgs.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i - 1].direction === "inbound" && msgs[i].direction === "outbound") {
        const diff = msgs[i].receivedAt.getTime() - msgs[i - 1].receivedAt.getTime();
        totalResponseTime += diff;
        responseCount++;
      }
    }
  }
  let responseSpeed = 0;
  if (responseCount > 0) {
    const avgResponseHours = (totalResponseTime / responseCount) / (1000 * 60 * 60);
    responseSpeed = avgResponseHours < 1 ? 15 :
                    avgResponseHours < 4 ? 12 :
                    avgResponseHours < 12 ? 9 :
                    avgResponseHours < 24 ? 6 :
                    avgResponseHours < 48 ? 3 : 0;
  }

  // Thread depth (0-10): average messages per thread
  const avgDepth = emails.length / Math.max(1, threadMap.size);
  const threadDepth = avgDepth >= 6 ? 10 :
                      avgDepth >= 4 ? 8 :
                      avgDepth >= 3 ? 6 :
                      avgDepth >= 2 ? 4 : 2;

  // Initiative (0-10): ratio of inbound (contact-initiated) messages
  const inboundCount = emails.filter(e => e.direction === "inbound").length;
  const inboundRatio = inboundCount / emails.length;
  const initiative = Math.round(inboundRatio * 10);

  const total = frequency + recency + responseSpeed + threadDepth + initiative;
  // Normalize to 0-100 scale (max raw = 65)
  const normalized = Math.min(100, Math.round((total / 65) * 100));

  const level: EngagementScore["level"] =
    normalized >= 60 ? "High" :
    normalized >= 30 ? "Medium" :
    normalized > 0 ? "Low" : "None";

  return {
    total: normalized,
    level,
    factors: { frequency, recency, responseSpeed, threadDepth, initiative },
  };
}
