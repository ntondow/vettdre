"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";

async function getCurrentOrg(options: { overrideAsOrg?: string } = {}) {
  const ctx = await getCurrentOrgContext(options);
  if (!ctx) throw new Error("Not authenticated");
  return { userId: ctx.userId, orgId: ctx.orgId };
}

export interface SetupProgress {
  agentCount: number;
  listingCount: number;
  commissionPlanCount: number;
  complianceDocCount: number;
  hasBranding: boolean;
  hasSettings: boolean;
}

export async function getSetupProgress(
  options: { overrideAsOrg?: string } = {},
): Promise<SetupProgress> {
  const { orgId } = await getCurrentOrg(options);

  const [
    agentCount,
    listingCount,
    commissionPlanCount,
    complianceDocCount,
    brandSettings,
    brokerageSettings,
  ] = await Promise.all([
    prisma.brokerAgent.count({ where: { orgId, status: { not: "terminated" } } }),
    prisma.bmsListing.count({ where: { orgId } }),
    prisma.commissionPlan.count({ where: { orgId, status: "active" } }),
    prisma.complianceDocument.count({ where: { orgId } }),
    prisma.brandSettings.findFirst({ where: { orgId }, select: { logoUrl: true, companyName: true } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } }),
  ]);

  const hasBranding = !!(brandSettings?.logoUrl || brandSettings?.companyName);
  // Check if org settings has any brokerage-specific config
  const settings = brokerageSettings?.settings as Record<string, unknown> | null;
  const hasSettings = !!(settings && Object.keys(settings).length > 0);

  return {
    agentCount,
    listingCount,
    commissionPlanCount,
    complianceDocCount,
    hasBranding,
    hasSettings,
  };
}
