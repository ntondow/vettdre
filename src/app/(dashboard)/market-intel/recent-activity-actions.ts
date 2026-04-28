"use server";

import { getCurrentOrgContext } from "@/lib/auth-context";
import prisma from "@/lib/prisma";

export interface RecentActivityData {
  savedProperties: number;
  activeDeals: number;
  recentActivity: {
    type: string;
    subject: string;
    date: string;
    contactName: string;
  }[];
  loiFollowUps: {
    id: string;
    name: string;
    address: string;
    daysSinceSent: number;
  }[];
}

export async function fetchRecentActivity(): Promise<RecentActivityData | null> {
  try {
    const ctx = await getCurrentOrgContext();
    if (!ctx) return null;
    const orgId = ctx.orgId;
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const [savedProps, dealCount, activities, loiDeals] = await Promise.all([
      prisma.property.count({ where: { orgId } }),
      prisma.deal.count({ where: { orgId, status: "open" } }),
      prisma.activity.findMany({
        where: { orgId },
        orderBy: { occurredAt: "desc" },
        take: 5,
        include: { contact: { select: { firstName: true, lastName: true } } },
      }),
      prisma.dealAnalysis.findMany({
        where: {
          orgId,
          status: "loi_sent" as any,
          loiSent: true,
          loiSentDate: { lt: fiveDaysAgo },
        },
        select: { id: true, name: true, address: true, loiSentDate: true },
        orderBy: { loiSentDate: "asc" },
        take: 5,
      }),
    ]);

    const now = new Date();

    return {
      savedProperties: savedProps,
      activeDeals: dealCount,
      recentActivity: activities.map(a => ({
        type: a.type,
        subject: a.subject || a.type,
        date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(a.occurredAt),
        contactName: a.contact ? `${a.contact.firstName} ${a.contact.lastName}`.trim() : "",
      })),
      loiFollowUps: loiDeals.map(d => ({
        id: d.id,
        name: d.name || "Untitled",
        address: d.address || "",
        daysSinceSent: d.loiSentDate ? Math.floor((now.getTime() - d.loiSentDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      })),
    };
  } catch (err) {
    console.error("Recent activity error:", err);
    return null;
  }
}
