"use server";

import { cache } from "react";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import type { BrokerageRoleType, AgentStatus } from "./bms-types";

// ── Get Current Brokerage Role ──────────────────────────────

export const getCurrentBrokerageRole = cache(async function (
  options: { overrideAsOrg?: string } = {},
): Promise<BrokerageRoleType | null> {
  try {
    const ctx = await getCurrentOrgContext(options);
    if (!ctx) return null;

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { brokerAgent: { select: { brokerageRole: true, status: true } } },
    });
    if (!user) return null;

    // Org owner/admin/super_admin always gets brokerage_admin — regardless of BrokerAgent record
    if (user.role === "owner" || user.role === "admin" || user.role === "super_admin") {
      return "brokerage_admin";
    }

    // Fallback: first user in the org is the de facto owner (uses effective org so
    // override carries through cleanly).
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) {
      return "brokerage_admin";
    }

    const ROLE_MAP: Partial<Record<string, BrokerageRoleType>> = {
      admin:   "brokerage_admin",
      manager: "manager",
    };
    if (user.role && ROLE_MAP[user.role]) {
      return ROLE_MAP[user.role]!;
    }

    if (user.brokerAgent?.brokerageRole) {
      return user.brokerAgent.brokerageRole as BrokerageRoleType;
    }

    return null;
  } catch (error) {
    console.error("getCurrentBrokerageRole error:", error);
    return null;
  }
});

// ── Get Current Agent Info (role + agentId + status) ─────────

export const getCurrentAgentInfo = cache(async function (
  options: { overrideAsOrg?: string } = {},
): Promise<{
  role: BrokerageRoleType;
  agentId: string;
  agentStatus: AgentStatus;
} | null> {
  try {
    const ctx = await getCurrentOrgContext(options);
    if (!ctx) return null;

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
    });
    if (!user) return null;

    if (user.role === "owner" || user.role === "admin" || user.role === "super_admin") {
      return {
        role: "brokerage_admin",
        agentId: user.brokerAgent?.id ?? user.id,
        agentStatus: (user.brokerAgent?.status as AgentStatus) ?? "active",
      };
    }

    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: ctx.orgId },
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
});
