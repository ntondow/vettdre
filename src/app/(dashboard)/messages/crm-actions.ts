"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { calculateEmailEngagementScore, type EngagementScore } from "@/lib/email-scoring";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

export interface CRMContext {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    source: string | null;
    tags: string[];
    qualificationScore: number | null;
    lastContactedAt: string | null;
  } | null;
  enrichment: {
    jobTitle: string | null;
    employer: string | null;
    linkedinUrl: string | null;
    profilePhotoUrl: string | null;
  } | null;
  deals: Array<{
    id: string;
    name: string | null;
    status: string;
    dealValue: string | null;
    stageId: string;
    updatedAt: string;
  }>;
  activities: Array<{
    id: string;
    type: string;
    subject: string | null;
    occurredAt: string;
    direction: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    priority: string;
  }>;
  followUps: Array<{
    id: string;
    reason: string;
    status: string;
    dueAt: string;
  }>;
  engagementScore: EngagementScore;
}

export async function getCRMContext(contactId: string): Promise<CRMContext | null> {
  const user = await getUser();
  if (!user) return null;

  const [contact, enrichment, deals, activities, tasks, followUps, engagementScore] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        source: true,
        tags: true,
        qualificationScore: true,
        lastContactedAt: true,
      },
    }),
    prisma.enrichmentProfile.findFirst({
      where: { contactId },
      orderBy: { version: "desc" },
      select: {
        jobTitle: true,
        employer: true,
        linkedinUrl: true,
        profilePhotoUrl: true,
      },
    }),
    prisma.deal.findMany({
      where: { contactId, orgId: user.orgId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        dealValue: true,
        stageId: true,
        updatedAt: true,
      },
    }),
    prisma.activity.findMany({
      where: { contactId, orgId: user.orgId },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        subject: true,
        occurredAt: true,
        direction: true,
      },
    }),
    prisma.task.findMany({
      where: { contactId, orgId: user.orgId, status: { in: ["pending", "in_progress"] } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        priority: true,
      },
    }),
    prisma.followUpReminder.findMany({
      where: { contactId, orgId: user.orgId, status: "pending" },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        reason: true,
        status: true,
        dueAt: true,
      },
    }),
    calculateEmailEngagementScore(contactId, user.orgId),
  ]);

  if (!contact) return null;

  // Serialize dates for client
  return JSON.parse(JSON.stringify({
    contact: {
      ...contact,
      lastContactedAt: contact.lastContactedAt?.toISOString() || null,
    },
    enrichment: enrichment || null,
    deals: deals.map(d => ({
      ...d,
      dealValue: d.dealValue?.toString() || null,
      updatedAt: d.updatedAt.toISOString(),
    })),
    activities: activities.map(a => ({
      ...a,
      occurredAt: a.occurredAt.toISOString(),
    })),
    tasks: tasks.map(t => ({
      ...t,
      dueAt: t.dueAt?.toISOString() || null,
    })),
    followUps: followUps.map(f => ({
      ...f,
      dueAt: f.dueAt.toISOString(),
    })),
    engagementScore,
  }));
}
