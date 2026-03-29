"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { BrokerageRoleType, AgentStatus } from "./bms-types";

// ── Get Current Brokerage Role ──────────────────────────────

export async function getCurrentBrokerageRole(): Promise<BrokerageRoleType | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // Primary lookup by authProviderId, fallback to email
    // (covers invited users whose authProviderId is not yet linked)
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: { brokerAgent: { select: { brokerageRole: true, status: true } } },
    });
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        include: { brokerAgent: { select: { brokerageRole: true, status: true } } },
      });
    }
    if (!user) return null;

    // Org owner/admin always gets brokerage_admin — regardless of BrokerAgent record
    // (BrokerAgent defaults to role "agent", which would incorrectly downgrade owners)
    if (user.role === "owner" || user.role === "admin") {
      return "brokerage_admin";
    }

    // Fallback: check if user is the first user created in their org (de facto owner).
    // The middleware creates the org and owner user together, so the earliest user
    // is always the org creator. Covers cases where user.role was never updated
    // from the default "agent" (e.g. Supabase RLS blocked the role column write).
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) {
      return "brokerage_admin";
    }

    // Map app-level role to brokerage role for users whose BrokerAgent.brokerageRole
    // was never explicitly set or is null
    const ROLE_MAP: Partial<Record<string, BrokerageRoleType>> = {
      admin:   "brokerage_admin",
      manager: "manager",
    };
    if (user.role && ROLE_MAP[user.role]) {
      return ROLE_MAP[user.role]!;
    }

    // Other users: use BrokerAgent role if linked
    if (user.brokerAgent?.brokerageRole) {
      return user.brokerAgent.brokerageRole as BrokerageRoleType;
    }

    return null;
  } catch (error) {
    console.error("getCurrentBrokerageRole error:", error);
    return null;
  }
}

// ── Get Current Agent Info (role + agentId + status) ─────────

export async function getCurrentAgentInfo(): Promise<{
  role: BrokerageRoleType;
  agentId: string;
  agentStatus: AgentStatus;
} | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // Primary lookup by authProviderId, fallback to email
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
    });
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
      });
    }
    if (!user) return null;

    // Org owner/admin always gets brokerage_admin
    if (user.role === "owner" || user.role === "admin") {
      return {
        role: "brokerage_admin",
        agentId: user.brokerAgent?.id ?? user.id,
        agentStatus: (user.brokerAgent?.status as AgentStatus) ?? "active",
      };
    }

    // Fallback: first user in the org is the de facto owner
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) {
      return {
        role: "brokerage_admin",
        agentId: user.brokerAgent?.id ?? user.id,
        agentStatus: (user.brokerAgent?.status as AgentStatus) ?? "active",
      };
    }

    // Map app-level role to brokerage role for users whose BrokerAgent.brokerageRole
    // was never explicitly set or is null
    const ROLE_MAP2: Partial<Record<string, BrokerageRoleType>> = {
      admin:   "brokerage_admin",
      manager: "manager",
    };
    if (user.role && ROLE_MAP2[user.role]) {
      return {
        role: ROLE_MAP2[user.role]!,
        agentId: user.brokerAgent?.id ?? user.id,
        agentStatus: (user.brokerAgent?.status as AgentStatus) ?? "active",
      };
    }

    // Other users: use BrokerAgent role if linked
    if (user.brokerAgent?.brokerageRole) {
      return {
        role: user.brokerAgent.brokerageRole as BrokerageRoleType,
        agentId: user.brokerAgent.id,
        agentStatus: user.brokerAgent.status as AgentStatus,
      };
    }

    return null;
  } catch (error) {
    console.error("getCurrentAgentInfo error:", error);
    return null;
  }
}
