// ── GET /api/mobile/pipeline ───────────────────────────────────
// Returns pipeline data with building stages and client stages.
// Combines BMS listing pipeline + client onboarding pipeline.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

// Stage definitions with colors
const BUILDING_STAGES = [
  { key: "available", label: "Available", color: "#10B981" },
  { key: "showing", label: "Showing", color: "#3B82F6" },
  { key: "application", label: "Application", color: "#F59E0B" },
  { key: "approved", label: "Approved", color: "#8B5CF6" },
  { key: "leased", label: "Leased", color: "#059669" },
  { key: "off_market", label: "Off Market", color: "#94A3B8" },
];

const CLIENT_STAGES = [
  { key: "draft", label: "Draft", color: "#94A3B8" },
  { key: "pending", label: "Pending", color: "#F59E0B" },
  { key: "partially_signed", label: "In Progress", color: "#3B82F6" },
  { key: "completed", label: "Signed", color: "#10B981" },
  { key: "expired", label: "Expired", color: "#94A3B8" },
  { key: "voided", label: "Voided", color: "#EF4444" },
];

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, isAdmin, agentId } = ctx;
    const listingAgentFilter = isAdmin ? {} : { agentId: agentId || "__none__" };
    const onboardingAgentFilter = isAdmin ? {} : { agentId: agentId || "__none__" };

    // Run both pipelines in parallel
    const [listingsByStatus, onboardingsByStatus] = await Promise.all([
      // Building/listing pipeline
      prisma.bmsListing.groupBy({
        by: ["status"],
        where: { orgId, ...listingAgentFilter },
        _count: { id: true },
      }),

      // Client onboarding pipeline
      prisma.clientOnboarding.groupBy({
        by: ["status"],
        where: { orgId, ...onboardingAgentFilter },
        _count: { id: true },
      }),
    ]);

    // Map counts to stage definitions
    const listingCounts: Record<string, number> = {};
    for (const g of listingsByStatus) {
      listingCounts[g.status] = g._count.id;
    }

    const onboardingCounts: Record<string, number> = {};
    for (const g of onboardingsByStatus) {
      onboardingCounts[g.status] = g._count.id;
    }

    const buildingStages = BUILDING_STAGES.map((s) => ({
      ...s,
      count: listingCounts[s.key] || 0,
    }));

    const clientStages = CLIENT_STAGES.map((s) => ({
      ...s,
      count: onboardingCounts[s.key] || 0,
    }));

    return NextResponse.json(
      serialize({
        buildingStages,
        clientStages,
        totalBuildings: buildingStages.reduce((sum, s) => sum + s.count, 0),
        totalClients: clientStages.reduce((sum, s) => sum + s.count, 0),
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/pipeline] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline" },
      { status: 500 }
    );
  }
}
