/**
 * Entity Resolution Endpoint — admin/internal
 *
 * POST { name, address?, entity_type? } → top 5 matched Co_entities with confidence scores.
 * Used for debugging and future "find this person across NYC real estate" feature.
 *
 * Auth: Bearer CRON_SECRET (admin/internal use)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeName, matchEntities } from "@/lib/entity-resolver";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name: string; address?: string; entity_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, entity_type } = body;
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name is required (min 2 chars)" }, { status: 400 });
  }

  const normalized = normalizeName(name);
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "No organization" }, { status: 500 });
  }

  // Search candidates: prefix match on normalized name + full-text search
  const candidates = await prisma.coEntity.findMany({
    where: {
      orgId: org.id,
      OR: [
        { nameNormalized: { startsWith: normalized.slice(0, Math.min(4, normalized.length)) } },
        { nameNormalized: { contains: normalized.slice(0, Math.min(8, normalized.length)) } },
      ],
    },
    select: {
      id: true,
      canonicalName: true,
      nameNormalized: true,
      entityType: true,
      dosId: true,
      icijNodeId: true,
      ofacSdnId: true,
      primaryAddress: true,
      confidence: true,
      sources: true,
    },
    take: 100,
  });

  // Score each candidate
  const scored = candidates
    .map((c) => {
      const match = matchEntities(name, c.canonicalName, entity_type, c.entityType);
      return { ...c, matchConfidence: match.confidence, matchMethod: match.method, isMatch: match.match };
    })
    .filter((c) => c.matchConfidence >= 0.3)
    .sort((a, b) => b.matchConfidence - a.matchConfidence)
    .slice(0, 5);

  // For each top match, fetch edges
  const results = await Promise.all(
    scored.map(async (s) => {
      const edges = await prisma.coEntityResolutionEdge.findMany({
        where: { OR: [{ sourceEntityId: s.id }, { targetEntityId: s.id }] },
        select: { edgeType: true, confidence: true, signalSource: true },
        take: 10,
      });
      return {
        entityId: s.id,
        name: s.canonicalName,
        entityType: s.entityType,
        dosId: s.dosId,
        icijNodeId: s.icijNodeId,
        ofacSdnId: s.ofacSdnId,
        address: s.primaryAddress,
        matchConfidence: Number(s.matchConfidence.toFixed(3)),
        matchMethod: s.matchMethod,
        sources: s.sources,
        edges: edges.map((e) => ({
          type: e.edgeType,
          confidence: Number(e.confidence),
          source: e.signalSource,
        })),
      };
    }),
  );

  return NextResponse.json({ query: name, normalized, matches: results });
}
