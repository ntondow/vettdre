"use server";

import crypto from "crypto";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logAgentAction } from "@/lib/bms-audit";

// ── Auth Helper ──────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Invite Agent ─────────────────────────────────────────────

export async function inviteAgent(
  agentId: string,
): Promise<{ inviteUrl?: string; error?: string }> {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
    });
    if (!agent) return { error: "Agent not found" };

    if (agent.userId) {
      return { error: "Agent already has a linked user account" };
    }

    const token = crypto.randomUUID();

    await prisma.brokerAgent.update({
      where: { id: agentId },
      data: {
        inviteToken: token,
        invitedAt: new Date(),
        inviteEmail: agent.email,
      },
    });

    logAgentAction(orgId, { id: userId }, "invited", agentId, {
      agentName: `${agent.firstName} ${agent.lastName}`,
      inviteEmail: agent.email,
    });

    return { inviteUrl: `/join/agent/${token}` };
  } catch (error) {
    console.error("inviteAgent error:", error);
    return { error: "Failed to generate invite" };
  }
}

// ── Bulk Invite Agents ───────────────────────────────────────

export async function bulkInviteAgents(
  agentIds: string[],
): Promise<{ invited: number; alreadyLinked: number; errors: string[] }> {
  const result = { invited: 0, alreadyLinked: 0, errors: [] as string[] };

  try {
    const { orgId } = await getCurrentOrg();

    const agents = await prisma.brokerAgent.findMany({
      where: { id: { in: agentIds }, orgId },
      select: { id: true, firstName: true, lastName: true, email: true, userId: true },
    });

    const foundIds = new Set(agents.map((a) => a.id));
    for (const id of agentIds) {
      if (!foundIds.has(id)) {
        result.errors.push(`Agent ${id} not found`);
      }
    }

    for (const agent of agents) {
      if (agent.userId) {
        result.alreadyLinked++;
        continue;
      }

      try {
        const token = crypto.randomUUID();
        await prisma.brokerAgent.update({
          where: { id: agent.id },
          data: {
            inviteToken: token,
            invitedAt: new Date(),
            inviteEmail: agent.email,
          },
        });
        result.invited++;
      } catch (err) {
        result.errors.push(
          `Failed to invite ${agent.firstName} ${agent.lastName}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    return result;
  } catch (error) {
    console.error("bulkInviteAgents error:", error);
    result.errors.push("Bulk invite failed");
    return result;
  }
}

// ── Get Invite Details (PUBLIC — no auth) ────────────────────

export async function getInviteDetails(
  token: string,
): Promise<{ agentName: string; brokerageName: string; agentEmail: string } | null> {
  try {
    const agent = await prisma.brokerAgent.findUnique({
      where: { inviteToken: token },
      select: {
        firstName: true,
        lastName: true,
        inviteEmail: true,
        userId: true,
        organization: { select: { name: true } },
      },
    });

    if (!agent) return null;

    // Already accepted
    if (agent.userId) return null;

    return {
      agentName: `${agent.firstName} ${agent.lastName}`,
      brokerageName: agent.organization.name,
      agentEmail: agent.inviteEmail || "",
    };
  } catch (error) {
    console.error("getInviteDetails error:", error);
    return null;
  }
}

// ── Accept Invite ────────────────────────────────────────────

export async function acceptInvite(
  token: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const agent = await prisma.brokerAgent.findUnique({
      where: { inviteToken: token },
    });

    if (!agent) {
      return { success: false, error: "Invalid or expired invite link" };
    }

    if (agent.userId) {
      return { success: false, error: "This invite has already been accepted" };
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { success: false, error: "User account not found" };
    }

    // Check user isn't already linked to a different agent
    const existingLink = await prisma.brokerAgent.findFirst({
      where: { userId, id: { not: agent.id } },
    });
    if (existingLink) {
      return { success: false, error: "Your account is already linked to another agent profile" };
    }

    await prisma.brokerAgent.update({
      where: { id: agent.id },
      data: {
        userId,
        inviteAcceptedAt: new Date(),
        inviteToken: null, // single-use
      },
    });

    // Ensure user is in the same org
    if (user.orgId !== agent.orgId) {
      await prisma.user.update({
        where: { id: userId },
        data: { orgId: agent.orgId },
      });
    }

    logAgentAction(agent.orgId, { id: userId }, "invite_accepted", agent.id, {
      agentName: `${agent.firstName} ${agent.lastName}`,
    });

    return { success: true };
  } catch (error) {
    console.error("acceptInvite error:", error);
    return { success: false, error: "Failed to accept invite" };
  }
}

// ── Revoke Invite ────────────────────────────────────────────

export async function revokeInvite(
  agentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
    });
    if (!agent) return { success: false, error: "Agent not found" };

    if (!agent.inviteToken) {
      return { success: false, error: "No pending invite to revoke" };
    }

    await prisma.brokerAgent.update({
      where: { id: agentId },
      data: {
        inviteToken: null,
        invitedAt: null,
        inviteEmail: null,
      },
    });

    logAgentAction(orgId, { id: userId }, "invite_revoked", agentId, {
      agentName: `${agent.firstName} ${agent.lastName}`,
    });

    return { success: true };
  } catch (error) {
    console.error("revokeInvite error:", error);
    return { success: false, error: "Failed to revoke invite" };
  }
}

// ── Get Pending Invites ──────────────────────────────────────

export async function getPendingInvites(): Promise<Array<{
  agentId: string;
  agentName: string;
  email: string;
  invitedAt: string;
}>> {
  try {
    const { orgId } = await getCurrentOrg();

    const agents = await prisma.brokerAgent.findMany({
      where: {
        orgId,
        inviteToken: { not: null },
        userId: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        inviteEmail: true,
        invitedAt: true,
      },
      orderBy: { invitedAt: "desc" },
    });

    return JSON.parse(JSON.stringify(
      agents.map((a) => ({
        agentId: a.id,
        agentName: `${a.firstName} ${a.lastName}`,
        email: a.inviteEmail || "",
        invitedAt: a.invitedAt?.toISOString() || "",
      })),
    ));
  } catch (error) {
    console.error("getPendingInvites error:", error);
    return [];
  }
}
