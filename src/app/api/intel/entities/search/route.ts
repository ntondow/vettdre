/**
 * GET /api/intel/entities/search — Entity name search.
 * Auth: Supabase session + condo_intel feature gate.
 * Rate limit: 30 req/min per user (simple in-memory token bucket).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { normalizeName, matchEntities } from "@/lib/entity-resolver";
import type { IntelEntitySearchResponse, IntelEntityMatch } from "@/lib/intel-api-types";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter (30 req/min per user)
// NOTE: Redis-based rate limiting is a Phase 9 hardening item
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const auth = await requireIntelReadAuth();
  if (auth instanceof NextResponse) return auth;

  if (!checkRateLimit(auth.userId)) {
    return NextResponse.json({ error: "Rate limit exceeded (30/min)" }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  const typeFilter = request.nextUrl.searchParams.get("type");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20"), 50);

  if (q.trim().length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  const normalized = normalizeName(q);

  // Search candidates via prefix + contains
  const where: any = {
    orgId: auth.orgId,
    OR: [
      { nameNormalized: { startsWith: normalized.slice(0, Math.min(4, normalized.length)) } },
      { nameNormalized: { contains: normalized.slice(0, Math.min(8, normalized.length)) } },
    ],
  };
  if (typeFilter && ["individual", "llc", "corp", "trust", "partnership", "estate", "nonprofit"].includes(typeFilter)) {
    where.entityType = typeFilter;
  }

  const candidates = await prisma.coEntity.findMany({
    where,
    select: {
      id: true,
      canonicalName: true,
      nameNormalized: true,
      entityType: true,
      confidence: true,
    },
    take: 200,
  });

  // Score and rank
  const scored = candidates
    .map(c => {
      const match = matchEntities(q, c.canonicalName, typeFilter || undefined, c.entityType);
      return { ...c, matchConfidence: match.confidence };
    })
    .filter(c => c.matchConfidence >= 0.3)
    .sort((a, b) => b.matchConfidence - a.matchConfidence)
    .slice(0, limit);

  // Enrich with holdings count
  const matches: IntelEntityMatch[] = await Promise.all(
    scored.map(async (s) => {
      const holdingsCount = await prisma.coUnitOwnershipCurrent.count({
        where: { orgId: auth.orgId, currentOwnerEntityId: s.id },
      }).catch(() => 0);

      return {
        entityId: s.id,
        canonicalName: s.canonicalName,
        entityType: s.entityType,
        confidence: Number(s.matchConfidence.toFixed(3)),
        holdingsCount,
        neighborhoods: [], // lightweight — skip for search results
      };
    }),
  );

  const response: IntelEntitySearchResponse = { matches };
  return NextResponse.json(response);
}
