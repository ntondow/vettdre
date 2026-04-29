"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";

async function getCurrentOrg(options: { overrideAsOrg?: string } = {}) {
  const ctx = await getCurrentOrgContext(options);
  if (!ctx) throw new Error("Not authenticated");
  return { userId: ctx.userId, orgId: ctx.orgId };
}

export async function getAgentScreenings(
  agentUserId: string,
  options: { overrideAsOrg?: string } = {},
) {
  try {
    const ctx = await getCurrentOrg(options);
    const screenings = await prisma.screeningApplication.findMany({
      where: { orgId: ctx.orgId, agentUserId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        propertyAddress: true,
        unitNumber: true,
        status: true,
        vettdreRiskScore: true,
        riskRecommendation: true,
        completedAt: true,
        createdAt: true,
        applicants: {
          where: { role: "main" },
          take: 1,
          select: { firstName: true, lastName: true },
        },
      },
    });
    return JSON.parse(JSON.stringify(screenings));
  } catch (error) {
    console.error("Error fetching agent screenings:", error);
    return [];
  }
}
