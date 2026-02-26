"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { BrokerageRoleType } from "./bms-types";

// ── Get Current Brokerage Role ──────────────────────────────

export async function getCurrentBrokerageRole(): Promise<BrokerageRoleType | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: { brokerAgent: { select: { brokerageRole: true } } },
    });
    if (!user?.brokerAgent) return null;

    return user.brokerAgent.brokerageRole as BrokerageRoleType;
  } catch (error) {
    console.error("getCurrentBrokerageRole error:", error);
    return null;
  }
}

// ── Get Current Agent Info (role + agentId) ─────────────────

export async function getCurrentAgentInfo(): Promise<{
  role: BrokerageRoleType;
  agentId: string;
} | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: { brokerAgent: { select: { id: true, brokerageRole: true } } },
    });
    if (!user?.brokerAgent) return null;

    return {
      role: user.brokerAgent.brokerageRole as BrokerageRoleType,
      agentId: user.brokerAgent.id,
    };
  } catch (error) {
    console.error("getCurrentAgentInfo error:", error);
    return null;
  }
}
