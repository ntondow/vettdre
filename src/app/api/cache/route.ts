import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { cacheManager } from "@/lib/cache-manager";

// Admin-only cache management endpoint
// GET /api/cache?action=stats     — cache hit/miss rates
// GET /api/cache?action=cleanup   — delete expired DB rows
// GET /api/cache?action=invalidate&bbl=X — clear all tiers for a building

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { authProviderId: user.id } });
  if (!dbUser || (dbUser.role !== "owner" && dbUser.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action");

  if (action === "stats") {
    const stats = cacheManager.getStats();
    const dbCount = await prisma.buildingCache.count();
    return NextResponse.json({ ...stats, dbRows: dbCount });
  }

  if (action === "cleanup") {
    const removed = await cacheManager.cleanupExpiredDB();
    return NextResponse.json({ removed });
  }

  if (action === "invalidate") {
    const bbl = req.nextUrl.searchParams.get("bbl");
    if (!bbl) return NextResponse.json({ error: "bbl parameter required" }, { status: 400 });
    cacheManager.invalidate(bbl);
    return NextResponse.json({ ok: true, bbl });
  }

  return NextResponse.json({ error: "Unknown action. Use: stats, cleanup, invalidate" }, { status: 400 });
}
