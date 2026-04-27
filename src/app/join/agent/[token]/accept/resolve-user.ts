"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the current Supabase auth user to a Prisma User record.
 * If no User record exists (common for fresh signups arriving via invite link
 * on a public route where middleware auto-provisioning doesn't run),
 * we create the User record using the invite token to determine the correct org.
 */
export async function getUserIdFromAuth(
  inviteToken?: string,
): Promise<{ userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // 1. Try to find existing User by authProviderId
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true },
    });

    // 2. Also try by email (admin-created users may not have authProviderId yet)
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        select: { id: true },
      });

      // Link authProviderId if found by email
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { authProviderId: authUser.id },
        });
      }
    }

    // 3. No User record at all — create one using the invite token's org
    if (!user && inviteToken) {
      const agent = await prisma.brokerAgent.findUnique({
        where: { inviteToken },
        select: { orgId: true, brokerageRole: true },
      });

      if (agent) {
        // Resolve preferred plan from inviting org's
        // settings.default_invite_plan; fall back to "free" on missing/invalid
        // config so a bad setting cannot break sign-ups.
        const VALID_PLANS = ["free", "explorer", "pro", "team", "enterprise"] as const;
        type Plan = (typeof VALID_PLANS)[number];
        const org = await prisma.organization.findUnique({
          where: { id: agent.orgId },
          select: { settings: true },
        });
        const settings = (org?.settings ?? {}) as Record<string, unknown>;
        const requestedPlan = settings.default_invite_plan;
        let chosenPlan: Plan = "free";
        if (typeof requestedPlan === "string") {
          if ((VALID_PLANS as readonly string[]).includes(requestedPlan)) {
            chosenPlan = requestedPlan as Plan;
          } else {
            console.warn(
              `[resolve-user] org ${agent.orgId} has invalid default_invite_plan='${requestedPlan}' — falling back to 'free'`,
            );
          }
        }

        const roleMap: Record<string, string> = {
          brokerage_admin: "admin",
          broker: "admin",
          manager: "admin",
          agent: "agent",
        };
        const userRole = roleMap[agent.brokerageRole] || "agent";
        const fullName =
          authUser.user_metadata?.full_name ||
          authUser.email?.split("@")[0] ||
          "Agent";

        user = await prisma.user.create({
          data: {
            orgId: agent.orgId,
            authProviderId: authUser.id,
            email: authUser.email!,
            fullName,
            role: userRole as "owner" | "admin" | "agent",
            plan: chosenPlan,
            isApproved: true,
            isActive: true,
          },
          select: { id: true },
        });

        console.log(
          `[resolve-user] Created User ${user.id} for invite token ${inviteToken}`,
        );
      }
    }

    return user ? { userId: user.id } : null;
  } catch (error) {
    console.error("getUserIdFromAuth error:", error);
    return null;
  }
}
