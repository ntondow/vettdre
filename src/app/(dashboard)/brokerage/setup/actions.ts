"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

export interface SetupProgress {
  agentCount: number;
  listingCount: number;
  commissionPlanCount: number;
  complianceDocCount: number;
  hasBranding: boolean;
  hasSettings: boolean;
}

export async function getSetupProgress(): Promise<SetupProgress> {
  const { orgId } = await getCurrentOrg();

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
