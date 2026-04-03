"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { orgId: true },
  });
  return user?.orgId || null;
}

// ── Screening Dashboard Stats ──────────────────────────────────

export async function getScreeningDashboardStats(): Promise<{
  totalScreenings: number;
  approvalRate: number | null;
  avgRiskScore: number | null;
  pendingReview: number;
} | null> {
  try {
    const orgId = await getCurrentOrg();
    if (!orgId) return null;

    const { getScreeningBmsStats } = await import("@/lib/screening/integration");
    return await getScreeningBmsStats(orgId);
  } catch (error) {
    console.error("[BMS Dashboard] Failed to fetch screening stats:", error);
    return null;
  }
}
