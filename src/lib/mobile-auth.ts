// ── Mobile Auth Helper ────────────────────────────────────────
// Validates Bearer token from mobile app requests and resolves
// the full user context (user, org, agent) for API route handlers.
//
// The mobile app sends: Authorization: Bearer <supabase_access_token>
// We validate the token with Supabase, then look up the user in Prisma.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import prisma from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

export interface MobileAuthContext {
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  role: string;
  isAdmin: boolean;
  timezone: string;
  agentId: string | null;
  agentStatus: string | null;
  brokerageRole: string | null;
}

// ── Token Validation ─────────────────────────────────────────

/**
 * Extract Bearer token from Authorization header, validate it with
 * Supabase, and return the full user context from Prisma.
 *
 * Returns null if auth fails — caller should return 401.
 */
export async function getMobileAuth(
  req: NextRequest
): Promise<MobileAuthContext | null> {
  try {
    // 1. Extract Bearer token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    if (!token) return null;

    // 2. Validate token with Supabase (service role can verify any JWT)
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    ).trim();

    const supabase = createSupabaseAdmin(supabaseUrl, supabaseServiceKey);
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !authUser) return null;

    // 3. Look up user in Prisma (primary: authProviderId, fallback: email)
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: {
        organization: { select: { id: true, name: true, tier: true } },
        brokerAgent: {
          select: {
            id: true,
            brokerageRole: true,
            status: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        include: {
          organization: { select: { id: true, name: true, tier: true } },
          brokerAgent: {
            select: {
              id: true,
              brokerageRole: true,
              status: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    if (!user) return null;

    // 4. Determine admin status
    const isAdmin =
      user.role === "owner" ||
      user.role === "admin" ||
      user.role === "super_admin" ||
      (!!user.brokerAgent &&
        ["brokerage_admin", "broker", "manager"].includes(
          user.brokerAgent.brokerageRole
        ));

    return {
      userId: user.id,
      orgId: user.orgId,
      fullName: user.fullName || "Agent",
      email: user.email,
      role: user.role,
      isAdmin,
      timezone: user.timezone || "America/New_York",
      agentId: user.brokerAgent?.id || null,
      agentStatus: user.brokerAgent?.status || null,
      brokerageRole: user.brokerAgent?.brokerageRole || null,
    };
  } catch (err) {
    console.error("[mobile-auth] Error:", err);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Standard 401 response for failed auth */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Serialize Dates to ISO strings and BigInt to numbers */
export function serialize<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "bigint") return Number(value);
      return value;
    })
  );
}
