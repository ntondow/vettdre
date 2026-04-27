"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const ctx = await getCurrentOrgContext();
  return ctx?.orgId || null;
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
