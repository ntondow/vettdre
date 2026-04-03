"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { id: true, orgId: true },
  });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

export async function getAgentScreenings(agentUserId: string) {
  try {
    const ctx = await getCurrentOrg();
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
