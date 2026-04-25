// ── GET /api/mobile/scout ──────────────────────────────────────
// Scout a building by address, BBL, or coordinates.
// Query params:
//   ?address=350+Park+Avenue   — search by address
//   ?bbl=1006340001            — search by 10-digit BBL
//   ?lat=40.7128&lng=-74.0060  — search by coordinates (reverse geocode)
//   ?refresh=true              — bypass cache and fetch fresh data
//
// Returns a building profile with PLUTO data, violations, contacts, etc.
// Uses in-memory LRU cache (10-min TTL) for instant repeat lookups.

import { NextRequest, NextResponse } from "next/server";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { lookupPlutoByAddress, parseBBL } from "@/lib/pluto-lookup";

export const dynamic = "force-dynamic";

// ── In-memory LRU cache for full scout profiles ──────────────
// Separate from the per-source cacheManager — this caches the
// fully assembled + enriched profile for instant repeat lookups.
const SCOUT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const SCOUT_CACHE_MAX = 200;

const scoutCache = new Map<
  string,
  { data: unknown; expiresAt: number }
>();

function getFromScoutCache(bbl: string): unknown | null {
  const entry = scoutCache.get(bbl);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    scoutCache.delete(bbl);
    return null;
  }
  // Move to end (LRU)
  scoutCache.delete(bbl);
  scoutCache.set(bbl, entry);
  return entry.data;
}

function setInScoutCache(bbl: string, data: unknown): void {
  scoutCache.delete(bbl);
  // Evict oldest while at capacity
  while (scoutCache.size >= SCOUT_CACHE_MAX) {
    const firstKey = scoutCache.keys().next().value;
    if (firstKey !== undefined) scoutCache.delete(firstKey);
    else break;
  }
  scoutCache.set(bbl, { data, expiresAt: Date.now() + SCOUT_CACHE_TTL });
}

// ── Route handler ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const address = req.nextUrl.searchParams.get("address");
    const bbl = req.nextUrl.searchParams.get("bbl");
    const lat = req.nextUrl.searchParams.get("lat");
    const lng = req.nextUrl.searchParams.get("lng");
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    // Phase 7: signal-based filter (optional)
    const signalFilter = req.nextUrl.searchParams.get("filter"); // high_distress|forced_sale_likely|assemblage_opportunity|exemption_cliff

    let boroCode: string | null = null;
    let block: string | null = null;
    let lot: string | null = null;

    // ── Resolve BBL from input ──────────────────────────────

    if (bbl) {
      const parsed = parseBBL(bbl);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid BBL format. Expected 10 digits (borough 1-5)." },
          { status: 400 }
        );
      }
      boroCode = parsed.borocode;
      block = parsed.block;
      lot = parsed.lot;
    } else if (address) {
      const result = await lookupPlutoByAddress(address);
      if (result) {
        boroCode = result.borocode;
        block = result.block;
        lot = result.lot;
      }
    } else if (lat && lng) {
      // Validate coordinate bounds
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      if (
        isNaN(latitude) || isNaN(longitude) ||
        latitude < 40.4 || latitude > 41.0 ||
        longitude < -74.3 || longitude > -73.6
      ) {
        return NextResponse.json(
          { error: "Coordinates must be within New York City bounds" },
          { status: 400 }
        );
      }

      // Reverse geocode via Geocodio, then resolve address in PLUTO
      try {
        const geocodioKey = process.env.GEOCODIO_API_KEY;
        if (geocodioKey) {
          const geoRes = await fetch(
            `https://api.geocod.io/v1.7/reverse?q=${latitude},${longitude}&api_key=${geocodioKey}&fields=census`
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const resolved = geoData.results?.[0]?.formatted_address;
            if (resolved) {
              const streetOnly = resolved.split(",")[0];
              const result = await lookupPlutoByAddress(streetOnly);
              if (result) {
                boroCode = result.borocode;
                block = result.block;
                lot = result.lot;
              }
            }
          }
        }
      } catch (geoErr) {
        console.warn("[mobile/scout] Geocoding failed:", geoErr);
      }
    }

    if (!boroCode || !block || !lot) {
      return NextResponse.json(
        { error: "Could not resolve building. Try a different address or BBL." },
        { status: 404 }
      );
    }

    // ── Build BBL key ──────────────────────────────────────
    const bblKey = `${boroCode}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;

    // ── Check cache first ──────────────────────────────────
    if (!refresh) {
      const cached = getFromScoutCache(bblKey);
      if (cached) {
        console.log(`[mobile/scout] Cache HIT for ${bblKey}`);
        return NextResponse.json(cached, {
          headers: { "X-Cache": "HIT" },
        });
      }
    }

    console.log(`[mobile/scout] Cache MISS for ${bblKey} — fetching`);

    // ── Fetch building profile ──────────────────────────────
    const { fetchBuildingProfile } = await import(
      "@/app/(dashboard)/market-intel/building-profile-actions"
    );

    const profile = await fetchBuildingProfile(boroCode, block, lot);
    const serialized = serialize(profile);

    // Cache the result (fire-and-forget)
    setInScoutCache(bblKey, serialized);

    // Phase 7: append condo_intel signals if available
    let enrichedResponse = serialized as any;
    if (signalFilter || true) { // always append if data exists
      try {
        const prismaLib = (await import("@/lib/prisma")).default;
        const coBuilding = await prismaLib.coBuilding.findFirst({
          where: { bbl: bblKey },
          select: { id: true, orgId: true },
        });
        if (coBuilding) {
          const signals = await prismaLib.coBuildingSignal.findMany({
            where: { buildingId: coBuilding.id },
            orderBy: { score: "desc" },
            select: { signalType: true, score: true, confidence: true },
          });

          // Apply signal filter if specified
          const SIGNAL_FILTER_MAP: Record<string, string> = {
            high_distress: "pre_foreclosure_risk",
            forced_sale_likely: "forced_sale_probability",
            assemblage_opportunity: "assemblage_opportunity",
            exemption_cliff: "exemption_cliff",
          };

          let filtered = signals;
          if (signalFilter && SIGNAL_FILTER_MAP[signalFilter]) {
            const targetType = SIGNAL_FILTER_MAP[signalFilter];
            filtered = signals.filter(s => s.signalType === targetType && Number(s.score) >= 50);
            if (filtered.length === 0) {
              // Signal filter active but no match — still return building, just mark it
              enrichedResponse = { ...enrichedResponse, signalFilterMatch: false };
            }
          }

          enrichedResponse = {
            ...enrichedResponse,
            condoIntel: {
              signals: filtered.map(s => ({ type: s.signalType, score: Number(s.score), confidence: s.confidence })),
              distressFlag: signals.some(s => s.signalType === "pre_foreclosure_risk" && Number(s.score) >= 60),
            },
          };
        }
      } catch { /* condoIntel stays absent */ }
    }

    return NextResponse.json(enrichedResponse, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (error: unknown) {
    console.error("[mobile/scout] GET error:", error);
    return NextResponse.json(
      { error: "Failed to scout building" },
      { status: 500 }
    );
  }
}
