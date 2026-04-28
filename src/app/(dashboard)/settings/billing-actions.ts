"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import type { UserPlan } from "@/lib/feature-gate";
import { FREE_DAILY_SEARCH_LIMIT } from "@/lib/feature-gate";

async function getAuthUser() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user) throw new Error("User not found");
  // Billing is always tied to the real user; do not honor ?as_org override
  // for plan/trial/subscription fields.
  return user;
}

export async function getBillingData() {
  const user = await getAuthUser();
  const plan = (user.plan || "free") as UserPlan;
  const counters = (user.usageCounters as any) || {};
  const today = new Date().toISOString().slice(0, 10);
  const searchesToday = counters.lastSearchDate === today ? (counters.searchesToday || 0) : 0;

  return {
    plan,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    searchesToday,
    searchLimit: plan === "free" ? FREE_DAILY_SEARCH_LIMIT : Infinity,
  };
}
