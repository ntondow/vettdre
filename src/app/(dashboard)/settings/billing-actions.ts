"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { PlanName } from "@/lib/feature-gate";
import { PLAN_LIMITS } from "@/lib/feature-gate";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function getBillingData() {
  const user = await getAuthUser();
  const plan = (user.plan || "free") as PlanName;
  const counters = (user.usageCounters as any) || {};
  const limits = PLAN_LIMITS[plan];

  // Get real counts
  const [contactCount, dealCount, prospectListCount, teamMemberCount] = await Promise.all([
    prisma.contact.count({ where: { orgId: user.orgId } }),
    prisma.deal.count({ where: { orgId: user.orgId, status: "open" } }),
    prisma.prospectingList.count({ where: { orgId: user.orgId, status: "active" } }),
    prisma.user.count({ where: { orgId: user.orgId, isActive: true } }),
  ]);

  return {
    plan,
    stripeCustomerId: user.stripeCustomerId,
    usage: {
      searchesToday: counters.searchesToday || 0,
      enrichmentsThisMonth: counters.enrichmentsThisMonth || 0,
      contacts: contactCount,
      deals: dealCount,
      prospectLists: prospectListCount,
      teamMembers: teamMemberCount,
    },
    limits: {
      searchesPerDay: limits.searchesPerDay,
      enrichmentsPerMonth: limits.enrichmentsPerMonth,
      maxContacts: limits.maxContacts,
      maxDeals: limits.maxDeals,
      maxProspectLists: limits.maxProspectLists,
      maxTeamMembers: limits.maxTeamMembers,
    },
  };
}
