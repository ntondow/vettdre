import prisma from "@/lib/prisma";

export type PlanName = "free" | "pro" | "team" | "enterprise";

export interface FeatureLimits {
  maxContacts: number;
  maxDeals: number;
  searchesPerDay: number;
  enrichmentsPerMonth: number;
  maxProspectLists: number;
  maxTeamMembers: number;
  aiAnalysis: boolean;
  bulkEnrich: boolean;
  csvExport: boolean;
  emailTemplates: boolean;
  apiAccess: boolean;
  customPipelines: boolean;
}

export const PLAN_LIMITS: Record<PlanName, FeatureLimits> = {
  free: {
    maxContacts: 50,
    maxDeals: 10,
    searchesPerDay: 10,
    enrichmentsPerMonth: 5,
    maxProspectLists: 1,
    maxTeamMembers: 1,
    aiAnalysis: false,
    bulkEnrich: false,
    csvExport: false,
    emailTemplates: true,
    apiAccess: false,
    customPipelines: false,
  },
  pro: {
    maxContacts: 1000,
    maxDeals: 100,
    searchesPerDay: 100,
    enrichmentsPerMonth: 50,
    maxProspectLists: 10,
    maxTeamMembers: 1,
    aiAnalysis: true,
    bulkEnrich: true,
    csvExport: true,
    emailTemplates: true,
    apiAccess: false,
    customPipelines: true,
  },
  team: {
    maxContacts: 10000,
    maxDeals: 500,
    searchesPerDay: 500,
    enrichmentsPerMonth: 200,
    maxProspectLists: 50,
    maxTeamMembers: 10,
    aiAnalysis: true,
    bulkEnrich: true,
    csvExport: true,
    emailTemplates: true,
    apiAccess: true,
    customPipelines: true,
  },
  enterprise: {
    maxContacts: Infinity,
    maxDeals: Infinity,
    searchesPerDay: Infinity,
    enrichmentsPerMonth: Infinity,
    maxProspectLists: Infinity,
    maxTeamMembers: Infinity,
    aiAnalysis: true,
    bulkEnrich: true,
    csvExport: true,
    emailTemplates: true,
    apiAccess: true,
    customPipelines: true,
  },
};

export const PLAN_DISPLAY: Record<PlanName, { label: string; price: number | null; color: string }> = {
  free: { label: "Free", price: 0, color: "slate" },
  pro: { label: "Pro", price: 79, color: "blue" },
  team: { label: "Team", price: 149, color: "violet" },
  enterprise: { label: "Enterprise", price: null, color: "amber" },
};

type CounterKey = "searchesToday" | "enrichmentsThisMonth" | "dealsThisMonth";

interface UsageCounters {
  searchesToday?: number;
  enrichmentsThisMonth?: number;
  dealsThisMonth?: number;
}

export async function checkFeatureAccess(
  userId: string,
  feature: keyof FeatureLimits,
): Promise<{ allowed: boolean; currentPlan: PlanName; requiredPlan: PlanName | null; currentValue?: number; limit?: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, usageCounters: true, usageResetDate: true, orgId: true },
  });
  if (!user) return { allowed: false, currentPlan: "free", requiredPlan: "pro" };

  const plan = (user.plan || "free") as PlanName;
  const limits = PLAN_LIMITS[plan];

  // Boolean features
  if (typeof limits[feature] === "boolean") {
    if (limits[feature]) return { allowed: true, currentPlan: plan, requiredPlan: null };
    const required = findMinPlan(feature);
    return { allowed: false, currentPlan: plan, requiredPlan: required };
  }

  // Numeric limits — check against usage counters
  const counters = resetCountersIfNeeded(user.usageCounters as UsageCounters, user.usageResetDate);
  const limit = limits[feature] as number;

  let current = 0;
  if (feature === "searchesPerDay") current = counters.searchesToday || 0;
  else if (feature === "enrichmentsPerMonth") current = counters.enrichmentsThisMonth || 0;
  else if (feature === "maxDeals") {
    current = await prisma.deal.count({ where: { orgId: user.orgId, status: "open" } });
  } else if (feature === "maxContacts") {
    current = await prisma.contact.count({ where: { orgId: user.orgId } });
  } else if (feature === "maxProspectLists") {
    current = await prisma.prospectingList.count({ where: { orgId: user.orgId, status: "active" } });
  } else if (feature === "maxTeamMembers") {
    current = await prisma.user.count({ where: { orgId: user.orgId, isActive: true } });
  }

  if (current < limit) return { allowed: true, currentPlan: plan, requiredPlan: null, currentValue: current, limit };
  const required = findMinPlanForLimit(feature, current + 1);
  return { allowed: false, currentPlan: plan, requiredPlan: required, currentValue: current, limit };
}

export async function incrementUsage(userId: string, counter: CounterKey, amount = 1): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { usageCounters: true, usageResetDate: true },
  });
  if (!user) return;

  const counters = resetCountersIfNeeded(user.usageCounters as UsageCounters, user.usageResetDate);
  counters[counter] = (counters[counter] || 0) + amount;

  const now = new Date();
  let resetDate = user.usageResetDate;
  if (!resetDate || resetDate < now) {
    // Set reset date: daily counters reset at midnight, monthly at 1st of next month
    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { usageCounters: counters as any, usageResetDate: resetDate },
  });
}

export async function getUsageStats(userId: string): Promise<{
  plan: PlanName;
  counters: UsageCounters;
  limits: FeatureLimits;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, usageCounters: true, usageResetDate: true },
  });
  if (!user) return { plan: "free", counters: {}, limits: PLAN_LIMITS.free };

  const plan = (user.plan || "free") as PlanName;
  const counters = resetCountersIfNeeded(user.usageCounters as UsageCounters, user.usageResetDate);
  return { plan, counters, limits: PLAN_LIMITS[plan] };
}

function resetCountersIfNeeded(counters: UsageCounters | null, resetDate: Date | null): UsageCounters {
  const c = counters || {};
  const now = new Date();

  // Reset daily counter if past midnight
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // We store the last reset check — if reset date is past, clear monthly
  if (resetDate && resetDate < now) {
    return { searchesToday: 0, enrichmentsThisMonth: 0, dealsThisMonth: 0 };
  }

  return { ...c };
}

function findMinPlan(feature: keyof FeatureLimits): PlanName {
  const order: PlanName[] = ["free", "pro", "team", "enterprise"];
  for (const p of order) {
    if (PLAN_LIMITS[p][feature] === true) return p;
  }
  return "enterprise";
}

function findMinPlanForLimit(feature: keyof FeatureLimits, needed: number): PlanName {
  const order: PlanName[] = ["free", "pro", "team", "enterprise"];
  for (const p of order) {
    const limit = PLAN_LIMITS[p][feature];
    if (typeof limit === "number" && needed <= limit) return p;
  }
  return "enterprise";
}
