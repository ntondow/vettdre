// ── GET /api/mobile/pipeline/stage ─────────────────────────────
// Returns items for a specific pipeline stage.
// Query params:
//   type=buildings|clients (required)
//   status=<stage key>    (required)
//   limit=<number>        (optional, default 50, max 100)
//   offset=<number>       (optional, default 0)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const VALID_BUILDING_STATUSES = [
  "available",
  "showing",
  "application",
  "approved",
  "leased",
  "off_market",
];

const VALID_CLIENT_STATUSES = [
  "draft",
  "pending",
  "sent",
  "viewed",
  "partially_signed",
  "completed",
  "voided",
  "expired",
  "cancelled",
];

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, isAdmin, agentId } = ctx;
    const url = new URL(req.url);

    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

    if (!type || !["buildings", "clients"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'buildings' or 'clients'" },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    if (type === "buildings") {
      if (!VALID_BUILDING_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid building status: ${status}` },
          { status: 400 }
        );
      }

      const agentFilter = isAdmin ? {} : { agentId: agentId || "__none__" };

      const [items, total] = await Promise.all([
        prisma.bmsListing.findMany({
          where: { orgId, status: status as any, ...agentFilter },
          select: {
            id: true,
            address: true,
            unit: true,
            type: true,
            status: true,
            rentPrice: true,
            askingPrice: true,
            bedrooms: true,
            bathrooms: true,
            sqft: true,
            availableDate: true,
            daysOnMarket: true,
            tenantName: true,
            tenantEmail: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.bmsListing.count({
          where: { orgId, status: status as any, ...agentFilter },
        }),
      ]);

      return NextResponse.json(
        serialize({
          type: "buildings",
          status,
          items: items.map((l) => ({
            id: l.id,
            address: l.address,
            unit: l.unit,
            listingType: l.type,
            status: l.status,
            price: l.rentPrice ? Number(l.rentPrice) : l.askingPrice ? Number(l.askingPrice) : null,
            priceType: l.rentPrice ? "rent" : l.askingPrice ? "sale" : null,
            bedrooms: l.bedrooms,
            bathrooms: l.bathrooms,
            sqft: l.sqft,
            availableDate: l.availableDate,
            daysOnMarket: l.daysOnMarket,
            tenantName: l.tenantName,
            tenantEmail: l.tenantEmail,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
          })),
          total,
          limit,
          offset,
        })
      );
    }

    // type === "clients"
    if (!VALID_CLIENT_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid client status: ${status}` },
        { status: 400 }
      );
    }

    const clientAgentFilter = isAdmin ? {} : { agentId: agentId || "__none__" };

    const [items, total] = await Promise.all([
      prisma.clientOnboarding.findMany({
        where: { orgId, status: status as any, ...clientAgentFilter },
        select: {
          id: true,
          clientFirstName: true,
          clientLastName: true,
          clientEmail: true,
          clientPhone: true,
          dealType: true,
          propertyAddress: true,
          status: true,
          sentAt: true,
          completedAt: true,
          allDocsSigned: true,
          documents: {
            select: {
              id: true,
              title: true,
              status: true,
            },
            orderBy: { sortOrder: "asc" },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.clientOnboarding.count({
        where: { orgId, status: status as any, ...clientAgentFilter },
      }),
    ]);

    return NextResponse.json(
      serialize({
        type: "clients",
        status,
        items: items.map((c) => ({
          id: c.id,
          name: `${c.clientFirstName} ${c.clientLastName}`.trim(),
          email: c.clientEmail,
          phone: c.clientPhone,
          dealType: c.dealType,
          propertyAddress: c.propertyAddress,
          status: c.status,
          sentAt: c.sentAt,
          completedAt: c.completedAt,
          allDocsSigned: c.allDocsSigned,
          docProgress: {
            signed: c.documents.filter((d) => d.status === "signed").length,
            total: c.documents.length,
          },
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        total,
        limit,
        offset,
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/pipeline/stage] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stage items" },
      { status: 500 }
    );
  }
}
