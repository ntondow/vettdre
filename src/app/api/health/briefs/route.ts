/**
 * Terminal Brief Pipeline Health Check
 *
 * Reports brief generation coverage stats so we can detect
 * when the generate-briefs cron stops running.
 *
 * Auth: CRON_SECRET (same as other cron endpoints).
 * Usage: curl -H "Authorization: Bearer $CRON_SECRET" https://app.vettdre.com/api/health/briefs
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const HEALTHY_COVERAGE_THRESHOLD = 0.9;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Overall counts
    const [total, withBrief] = await Promise.all([
      prisma.terminalEvent.count(),
      prisma.terminalEvent.count({ where: { aiBrief: { not: null } } }),
    ]);

    // Pending briefs (enriched but no brief, under retry limit)
    const pending = await prisma.terminalEvent.count({
      where: {
        enrichmentPackage: { not: { equals: null } },
        aiBrief: null,
        tier: { in: [1, 2] },
      },
    });

    // Last brief generated
    const lastBriefEvent = await prisma.terminalEvent.findFirst({
      where: { aiBrief: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true, bbl: true },
    });

    // Daily coverage for last 7 days (raw SQL for aggregation)
    const daily = await prisma.$queryRaw<
      Array<{ day: string; total: bigint; with_brief: bigint }>
    >`
      SELECT
        TO_CHAR(detected_at, 'YYYY-MM-DD') as day,
        COUNT(*)::bigint as total,
        COUNT(ai_brief)::bigint as with_brief
      FROM terminal_events
      WHERE detected_at >= NOW() - INTERVAL '7 days'
      GROUP BY TO_CHAR(detected_at, 'YYYY-MM-DD')
      ORDER BY day DESC
    `;

    const dailyCoverage = daily.map((d) => ({
      day: d.day,
      total: Number(d.total),
      withBrief: Number(d.with_brief),
      pct: Number(d.total) > 0 ? Math.round((Number(d.with_brief) / Number(d.total)) * 100) : 0,
    }));

    // Health status: unhealthy if coverage below threshold in last 24h
    const today = dailyCoverage[0];
    const healthy = today ? today.pct >= HEALTHY_COVERAGE_THRESHOLD * 100 : false;

    return NextResponse.json({
      status: healthy ? "healthy" : "unhealthy",
      total,
      withBrief,
      withoutBrief: total - withBrief,
      coveragePct: total > 0 ? Math.round((withBrief / total) * 100) : 0,
      pending,
      lastBriefAt: lastBriefEvent?.updatedAt?.toISOString() || null,
      dailyCoverage,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Health/Briefs] Error:", error);
    return NextResponse.json(
      { error: "Health check failed", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
