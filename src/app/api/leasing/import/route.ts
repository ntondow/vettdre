// ============================================================
// Bulk Unit Import API
//
// POST — receive validated rows, batch upsert BmsListings
// GET  — download CSV template
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { generateTemplate } from "@/lib/leasing-import";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Auth Helper ──────────────────────────────────────────────

async function getOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) return null;
  return { userId: user.id, orgId: user.orgId };
}

// ── Row type from client ─────────────────────────────────────

interface ImportRow {
  unit: string;
  bedrooms: string;
  bathrooms: string;
  rentAmount: number;
  sqft?: number | null;
  floor?: string | null;
  availableDate?: string | null;
  description?: string | null;
}

// ── GET — Download template ──────────────────────────────────

export async function GET() {
  const csv = generateTemplate();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=unit-import-template.csv",
    },
  });
}

// ── POST — Batch upsert ─────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getOrg();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { propertyId, rows } = body as { propertyId: string; rows: ImportRow[] };

  if (!propertyId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Missing propertyId or rows" }, { status: 400 });
  }

  if (rows.length > 1000) {
    return NextResponse.json({ error: "Maximum 1,000 rows per import" }, { status: 400 });
  }

  // Verify property belongs to org
  const property = await prisma.bmsProperty.findFirst({
    where: { id: propertyId, orgId: auth.orgId },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];

  // Process in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    const promises = chunk.map(async (row, idx) => {
      const rowNum = i + idx + 1;
      try {
        // Determine status based on availableDate
        let status: "available" | "off_market" = "available";
        let availableDate: Date | null = null;
        if (row.availableDate) {
          availableDate = new Date(row.availableDate);
          if (!isNaN(availableDate.getTime())) {
            const avDate = new Date(availableDate);
            avDate.setHours(0, 0, 0, 0);
            status = avDate > today ? "off_market" : "available";
          }
        }

        // Check if listing exists for this property+unit
        const existing = await prisma.bmsListing.findFirst({
          where: {
            propertyId,
            unit: row.unit,
          },
        });

        if (existing) {
          await prisma.bmsListing.update({
            where: { id: existing.id },
            data: {
              bedrooms: row.bedrooms,
              bathrooms: row.bathrooms,
              rentPrice: row.rentAmount,
              sqft: row.sqft ?? undefined,
              floor: row.floor ?? undefined,
              availableDate,
              description: row.description ?? undefined,
              status,
              address: property.address || "",
            },
          });
          updated++;
        } else {
          await prisma.bmsListing.create({
            data: {
              orgId: auth.orgId,
              propertyId,
              address: property.address || "",
              unit: row.unit,
              bedrooms: row.bedrooms,
              bathrooms: row.bathrooms,
              rentPrice: row.rentAmount,
              sqft: row.sqft ?? undefined,
              floor: row.floor ?? undefined,
              availableDate,
              description: row.description ?? undefined,
              status,
              type: "rental",
            },
          });
          created++;
        }
      } catch (err) {
        errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unknown error" });
        skipped++;
      }
    });

    await Promise.all(promises);
  }

  return NextResponse.json({ created, updated, skipped, errors });
}
