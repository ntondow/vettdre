/**
 * Shared helpers for condo-ingest cron endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Validate Bearer CRON_SECRET auth and resolve the first org.
 * Returns { orgId } on success, or a NextResponse error to return early.
 */
export async function authAndResolveOrg(
  request: NextRequest,
): Promise<{ orgId: string } | NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "No organization found" }, { status: 500 });
  }

  return { orgId: org.id };
}
