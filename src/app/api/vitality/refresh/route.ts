import { NextRequest, NextResponse } from "next/server";
import { refreshAllVitalityScores, refreshVitalityScore } from "@/app/(dashboard)/market-intel/vitality-actions";

const REFRESH_KEY = process.env.VITALITY_REFRESH_KEY || "";

/**
 * POST /api/vitality/refresh
 * Triggers vitality score refresh for all NYC ZIP codes.
 * Protected by VITALITY_REFRESH_KEY header.
 *
 * Query params:
 *   ?zip=10001  — refresh a single ZIP code (fast, for testing)
 *   (no param)  — refresh all ~200 NYC ZIPs (slow, ~5-10 min)
 */
export async function POST(req: NextRequest) {
  // Auth check
  const authKey = req.headers.get("x-vitality-key") || "";
  if (!REFRESH_KEY || authKey !== REFRESH_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const singleZip = searchParams.get("zip");

  try {
    if (singleZip) {
      // Single ZIP refresh (for testing / targeted updates)
      const result = await refreshVitalityScore(singleZip);
      if (!result) {
        return NextResponse.json({ error: "Failed to refresh ZIP" }, { status: 500 });
      }
      return NextResponse.json({
        zipCode: singleZip,
        score: result.score,
        level: result.level,
        positiveCount: result.positiveCount,
        negativeCount: result.negativeCount,
        confidence: result.confidence,
      });
    }

    // Full refresh — all NYC ZIPs
    const result = await refreshAllVitalityScores();
    return NextResponse.json({
      updated: result.updated,
      errors: result.errors,
      durationMs: result.duration,
      durationMinutes: Math.round(result.duration / 60000),
    });
  } catch (err) {
    console.error("Vitality refresh error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
