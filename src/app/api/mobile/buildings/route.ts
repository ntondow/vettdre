// ── GET/POST /api/mobile/buildings ───────────────────────────
// GET: Returns saved buildings for the current user
// POST: Saves a building to the user's prospecting list

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    // Fetch from prospecting items linked to the user
    const items = await prisma.prospectingItem.findMany({
      where: {
        list: { orgId: ctx.orgId, createdBy: ctx.userId },
        status: { not: "removed" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        address: true,
        borough: true,
        block: true,
        lot: true,
        totalUnits: true,
        yearBuilt: true,
        ownerName: true,
        lastSalePrice: true,
        assessedValue: true,
        status: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(serialize(items));
  } catch (error: unknown) {
    console.error("[mobile/buildings] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved buildings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const {
      bbl,
      address,
      borough,
      totalUnits,
      yearBuilt,
      ownerName,
      lastSalePrice,
      assessedValue,
      notes,
    } = body;

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    // Parse BBL into block/lot (10-digit format: B-BBBBB-LLLL)
    let block = "";
    let lot = "";
    let parsedBorough = borough || null;
    if (bbl && /^\d{10}$/.test(bbl)) {
      parsedBorough = parsedBorough || bbl[0];
      block = bbl.substring(1, 6);
      lot = bbl.substring(6, 10);
    }

    // Get or create the user's mobile saves list
    let list = await prisma.prospectingList.findFirst({
      where: {
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        name: "Mobile Saves",
      },
    });

    if (!list) {
      list = await prisma.prospectingList.create({
        data: {
          orgId: ctx.orgId,
          createdBy: ctx.userId,
          name: "Mobile Saves",
          status: "active",
        },
      });
    }

    // Check if already saved (by address to avoid duplicates)
    const existing = await prisma.prospectingItem.findFirst({
      where: {
        listId: list.id,
        address,
      },
    });

    if (existing) {
      return NextResponse.json(serialize(existing));
    }

    // Create prospecting item
    const item = await prisma.prospectingItem.create({
      data: {
        listId: list.id,
        orgId: ctx.orgId,
        address,
        borough: parsedBorough || null,
        block: block || null,
        lot: lot || null,
        totalUnits: totalUnits ? parseInt(String(totalUnits)) : null,
        yearBuilt: yearBuilt ? parseInt(String(yearBuilt)) : null,
        ownerName: ownerName || null,
        lastSalePrice: lastSalePrice
          ? parseInt(String(lastSalePrice))
          : null,
        assessedValue: assessedValue
          ? parseInt(String(assessedValue))
          : null,
        notes: notes || null,
        status: "new",
      },
    });

    return NextResponse.json(serialize(item), { status: 201 });
  } catch (error: unknown) {
    console.error("[mobile/buildings] POST error:", error);
    return NextResponse.json(
      { error: "Failed to save building" },
      { status: 500 }
    );
  }
}
