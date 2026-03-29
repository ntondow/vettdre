"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { UnifiedProperty, PropertiesStats } from "./types";

// ── Auth ─────────────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// ── Status Colors ────────────────────────────────────────────

const LISTING_STATUS_COLORS: Record<string, string> = {
  available: "text-emerald-400 bg-emerald-500/15",
  showing: "text-blue-400 bg-blue-500/15",
  application: "text-amber-400 bg-amber-500/15",
  approved: "text-cyan-400 bg-cyan-500/15",
  leased: "text-slate-400 bg-slate-500/15",
  off_market: "text-slate-500 bg-slate-500/10",
};

const PROPERTY_STATUS_COLORS: Record<string, string> = {
  available: "text-emerald-400 bg-emerald-500/15",
  pending: "text-amber-400 bg-amber-500/15",
  under_contract: "text-blue-400 bg-blue-500/15",
  sold: "text-slate-400 bg-slate-500/15",
  leased: "text-slate-400 bg-slate-500/15",
  off_market: "text-slate-500 bg-slate-500/10",
};

// ── Helpers ──────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/\s+/g, " ");
}

function daysAgo(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function encodeMarketIntelHref(address: string): string {
  return `/market-intel?q=${encodeURIComponent(address)}`;
}

function parseBeds(val: string | number | null | undefined): number | undefined {
  if (val == null) return undefined;
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? undefined : n;
}

// ── Main Query ───────────────────────────────────────────────

export async function getUnifiedProperties(): Promise<UnifiedProperty[]> {
  const { orgId } = await getCurrentOrg();
  const now = new Date();

  const [
    listingsResult,
    dealPropsResult,
    showingsResult,
    prospectsResult,
  ] = await Promise.allSettled([
    // 1. BMS Listings
    prisma.bmsListing.findMany({
      where: { orgId },
      include: {
        agent: { select: { firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    // 2. CRM Properties with deals
    prisma.property.findMany({
      where: { orgId, deals: { some: {} } },
      include: {
        deals: { select: { id: true, status: true, dealValue: true }, take: 10 },
        showings: {
          select: { id: true },
          where: { scheduledAt: { gte: now } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    // 3. Showings (upcoming, with property details)
    prisma.showing.findMany({
      where: { orgId, scheduledAt: { gte: now } },
      include: {
        property: {
          select: {
            id: true,
            address: true,
            unitNumber: true,
            city: true,
            state: true,
            zip: true,
            propertyType: true,
            status: true,
            price: true,
            monthlyRent: true,
            bedrooms: true,
            bathrooms: true,
            sqft: true,
            createdAt: true,
          },
        },
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),

    // 4. Prospecting items
    prisma.prospectingItem.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const unified: UnifiedProperty[] = [];
  const seen = new Map<string, number>(); // normalized address → index

  // ── 1. Map BMS Listings ──────────────────────────────────────
  if (listingsResult.status === "fulfilled") {
    for (const l of listingsResult.value) {
      const key = normalizeAddress(l.address + (l.unit ? ` ${l.unit}` : ""));
      const prop: UnifiedProperty = {
        id: `lst_${l.id}`,
        source: "listing",
        address: l.address,
        unit: l.unit || undefined,
        city: l.city || undefined,
        state: l.state || undefined,
        zip: l.zipCode || undefined,
        propertyType: l.type,
        status: l.status.replace(/_/g, " "),
        statusColor: LISTING_STATUS_COLORS[l.status] || "text-slate-400 bg-slate-500/15",
        price: l.askingPrice ? Number(l.askingPrice) : undefined,
        rent: l.rentPrice ? Number(l.rentPrice) : undefined,
        bedrooms: parseBeds(l.bedrooms),
        bathrooms: parseBeds(l.bathrooms),
        sqft: l.sqft || undefined,
        href: "/brokerage/listings",
        marketIntelHref: encodeMarketIntelHref(l.address),
        daysOnMarket: l.daysOnMarket ?? (l.availableDate ? daysAgo(l.availableDate) : undefined),
        addedAt: l.createdAt.toISOString(),
        agentName: l.agent ? `${l.agent.firstName} ${l.agent.lastName}` : undefined,
        dealCount: 0,
        showingCount: 0,
      };
      seen.set(key, unified.length);
      unified.push(prop);
    }
  }

  // ── 2. Map CRM Properties with Deals ─────────────────────────
  if (dealPropsResult.status === "fulfilled") {
    for (const p of dealPropsResult.value) {
      const key = normalizeAddress(p.address + (p.unitNumber ? ` ${p.unitNumber}` : ""));
      const existing = seen.get(key);
      if (existing !== undefined) {
        // Merge into existing record
        unified[existing].dealCount = p.deals.length;
        unified[existing].showingCount += p.showings.length;
        continue;
      }
      const prop: UnifiedProperty = {
        id: `deal_${p.id}`,
        source: "deal",
        address: p.address,
        unit: p.unitNumber || undefined,
        city: p.city || undefined,
        state: p.state || undefined,
        zip: p.zip || undefined,
        propertyType: p.propertyType,
        status: p.status.replace(/_/g, " "),
        statusColor: PROPERTY_STATUS_COLORS[p.status] || "text-slate-400 bg-slate-500/15",
        price: p.price ? Number(p.price) : undefined,
        rent: p.monthlyRent ? Number(p.monthlyRent) : undefined,
        bedrooms: p.bedrooms ?? undefined,
        bathrooms: p.bathrooms ? Number(p.bathrooms) : undefined,
        sqft: p.sqft ?? undefined,
        href: "/pipeline",
        marketIntelHref: encodeMarketIntelHref(p.address),
        addedAt: p.createdAt.toISOString(),
        dealCount: p.deals.length,
        showingCount: p.showings.length,
      };
      seen.set(key, unified.length);
      unified.push(prop);
    }
  }

  // ── 3. Map Showings ──────────────────────────────────────────
  if (showingsResult.status === "fulfilled") {
    const seenPropertyIds = new Set<string>();
    for (const s of showingsResult.value) {
      if (!s.property || seenPropertyIds.has(s.propertyId)) continue;
      seenPropertyIds.add(s.propertyId);

      const p = s.property;
      const key = normalizeAddress(p.address + (p.unitNumber ? ` ${p.unitNumber}` : ""));
      const existing = seen.get(key);
      if (existing !== undefined) {
        unified[existing].showingCount += 1;
        continue;
      }
      const prop: UnifiedProperty = {
        id: `shw_${p.id}`,
        source: "showing",
        address: p.address,
        unit: p.unitNumber || undefined,
        city: p.city || undefined,
        state: p.state || undefined,
        zip: p.zip || undefined,
        propertyType: p.propertyType,
        status: "showing scheduled",
        statusColor: "text-amber-400 bg-amber-500/15",
        price: p.price ? Number(p.price) : undefined,
        rent: p.monthlyRent ? Number(p.monthlyRent) : undefined,
        bedrooms: p.bedrooms ?? undefined,
        bathrooms: p.bathrooms ? Number(p.bathrooms) : undefined,
        sqft: p.sqft ?? undefined,
        href: "/calendar",
        marketIntelHref: encodeMarketIntelHref(p.address),
        addedAt: p.createdAt.toISOString(),
        dealCount: 0,
        showingCount: 1,
      };
      seen.set(key, unified.length);
      unified.push(prop);
    }
  }

  // ── 4. Map Prospecting Items ─────────────────────────────────
  if (prospectsResult.status === "fulfilled") {
    for (const pi of prospectsResult.value) {
      const key = normalizeAddress(pi.address);
      const existing = seen.get(key);
      if (existing !== undefined) continue; // already tracked from another source

      const prop: UnifiedProperty = {
        id: `prs_${pi.id}`,
        source: "prospect",
        address: pi.address,
        city: pi.borough || undefined,
        state: "NY",
        zip: pi.zip || undefined,
        propertyType: pi.buildingClass || undefined,
        status: pi.status || "prospect",
        statusColor: "text-purple-400 bg-purple-500/15",
        assessedValue: pi.assessedValue ?? undefined,
        totalUnits: pi.totalUnits ?? undefined,
        sqft: pi.buildingArea ?? undefined,
        href: encodeMarketIntelHref(pi.address),
        marketIntelHref: encodeMarketIntelHref(pi.address),
        addedAt: pi.createdAt.toISOString(),
        ownerName: pi.ownerName || undefined,
        dealCount: 0,
        showingCount: 0,
      };
      seen.set(key, unified.length);
      unified.push(prop);
    }
  }

  return serialize(unified);
}

// ── Stats ────────────────────────────────────────────────────

export async function getPropertiesStats(): Promise<PropertiesStats> {
  const { orgId } = await getCurrentOrg();
  const now = new Date();

  const [listings, deals, showings, prospects] = await Promise.allSettled([
    prisma.bmsListing.count({ where: { orgId } }),
    prisma.property.count({ where: { orgId, deals: { some: {} } } }),
    prisma.showing.count({ where: { orgId, scheduledAt: { gte: now } } }),
    prisma.prospectingItem.count({ where: { orgId } }),
  ]);

  const l = listings.status === "fulfilled" ? listings.value : 0;
  const d = deals.status === "fulfilled" ? deals.value : 0;
  const s = showings.status === "fulfilled" ? showings.value : 0;
  const p = prospects.status === "fulfilled" ? prospects.value : 0;

  return {
    total: l + d + s + p,
    listings: l,
    deals: d,
    showings: s,
    prospects: p,
  };
}
