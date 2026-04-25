/**
 * Shared auth helper for Intel read endpoints.
 * Requires Supabase session auth + "condo_intel" feature gate (pro+ plan).
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";

export interface ReadAuthContext {
  userId: string;
  orgId: string;
  plan: UserPlan;
}

/**
 * Authenticate a read endpoint request.
 * Returns { userId, orgId, plan } on success, or a NextResponse error.
 */
export async function requireIntelReadAuth(): Promise<ReadAuthContext | NextResponse> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ authProviderId: authUser.id }, { email: authUser.email || "" }] },
    select: { id: true, orgId: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const plan = (user.plan || "free") as UserPlan;
  if (!hasPermission(plan, "condo_intel")) {
    return NextResponse.json(
      { error: "Condo intelligence requires Pro plan or above", upgrade: true },
      { status: 403 },
    );
  }

  return { userId: user.id, orgId: user.orgId, plan };
}
