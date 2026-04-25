/**
 * Unresolved Records API — serves the admin review queue.
 * Requires authenticated super_admin user.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Auth: require super_admin
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ authProviderId: authUser.id }, { email: authUser.email || "" }] },
    select: { role: true },
  });
  if (dbUser?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");
  const source = request.nextUrl.searchParams.get("source");

  const where: any = {};
  if (source && source !== "all") {
    where.sourceTable = source;
  }

  const records = await prisma.coUnresolvedRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return NextResponse.json({
    records: records.map((r) => ({
      id: r.id,
      sourceTable: r.sourceTable,
      sourceRecordId: r.sourceRecordId,
      reason: r.reason,
      raw: r.raw,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
