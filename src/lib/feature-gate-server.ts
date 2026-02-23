"use server";

import prisma from "@/lib/prisma";
import { FREE_DAILY_SEARCH_LIMIT } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";

interface UsageCounters {
  searchesToday?: number;
  lastSearchDate?: string;
}

export async function getUserPlan(userId: string): Promise<{
  plan: UserPlan;
  trialEndsAt: string | null;
  usageCounters: UsageCounters;
  usageResetDate: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, trialEndsAt: true, usageCounters: true, usageResetDate: true },
  });
  if (!user) return { plan: "free", trialEndsAt: null, usageCounters: {}, usageResetDate: null };

  return {
    plan: (user.plan || "free") as UserPlan,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    usageCounters: normalizeCounters(user.usageCounters as UsageCounters),
    usageResetDate: user.usageResetDate?.toISOString() ?? null,
  };
}

export async function incrementSearchCount(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, usageCounters: true },
  });
  if (!user) return { allowed: false, remaining: 0 };

  const plan = (user.plan || "free") as UserPlan;
  if (plan !== "free") return { allowed: true, remaining: Infinity };

  const counters = normalizeCounters(user.usageCounters as UsageCounters);
  const today = new Date().toISOString().slice(0, 10);

  // Reset if new day
  if (counters.lastSearchDate !== today) {
    counters.searchesToday = 0;
    counters.lastSearchDate = today;
  }

  const current = counters.searchesToday || 0;
  if (current >= FREE_DAILY_SEARCH_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  counters.searchesToday = current + 1;
  counters.lastSearchDate = today;

  await prisma.user.update({
    where: { id: userId },
    data: { usageCounters: counters as any },
  });

  return { allowed: true, remaining: FREE_DAILY_SEARCH_LIMIT - counters.searchesToday };
}

export async function startFreeTrial(userId: string): Promise<{ success: boolean; trialEndsAt: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, trialEndsAt: true },
  });
  if (!user) return { success: false, trialEndsAt: null };

  // Only allow trial for free users who haven't trialed before
  if (user.plan !== "free") return { success: false, trialEndsAt: null };
  if (user.trialEndsAt) return { success: false, trialEndsAt: null };

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);

  await prisma.user.update({
    where: { id: userId },
    data: { plan: "explorer", trialEndsAt: trialEnd },
  });

  return { success: true, trialEndsAt: trialEnd.toISOString() };
}

export async function checkAndExpireTrial(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, trialEndsAt: true },
  });
  if (!user || !user.trialEndsAt) return false;

  if (user.plan === "explorer" && user.trialEndsAt < new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "free", trialEndsAt: null },
    });
    return true;
  }
  return false;
}

function normalizeCounters(raw: UsageCounters | null): UsageCounters {
  if (!raw || typeof raw !== "object") return {};
  return { ...raw };
}
