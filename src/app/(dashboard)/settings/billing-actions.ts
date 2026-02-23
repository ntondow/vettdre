"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { UserPlan } from "@/lib/feature-gate";
import { FREE_DAILY_SEARCH_LIMIT } from "@/lib/feature-gate";

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
  const plan = (user.plan || "free") as UserPlan;
  const counters = (user.usageCounters as any) || {};
  const today = new Date().toISOString().slice(0, 10);
  const searchesToday = counters.lastSearchDate === today ? (counters.searchesToday || 0) : 0;

  return {
    plan,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    stripeCustomerId: user.stripeCustomerId,
    searchesToday,
    searchLimit: plan === "free" ? FREE_DAILY_SEARCH_LIMIT : Infinity,
  };
}
