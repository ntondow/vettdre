"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth ────────────────────────────────────────────────────

async function getCurrentOrg(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ authProviderId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
    select: { id: true, orgId: true },
  });
  if (!dbUser) return null;
  return { userId: dbUser.id, orgId: dbUser.orgId };
}

// ── Renovation Estimate (wraps pure library) ────────────────

export async function fetchRenovationEstimate(params: {
  bbl: string;
  units?: number;
  sqft?: number;
  yearBuilt?: number;
  bldgClass?: string;
  numFloors?: number;
  hasElevator?: boolean;
}) {
  try {
    const { estimateRenovationCost } = await import("@/lib/renovation-engine");
    const { bbl, units, sqft, yearBuilt, bldgClass, numFloors, hasElevator } = params;

    // If we have all the data, skip PLUTO fetch
    if (units && sqft && yearBuilt && bldgClass && numFloors !== undefined) {
      return estimateRenovationCost({
        units,
        sqft,
        yearBuilt,
        buildingClass: bldgClass,
        floors: numFloors,
        hasElevator: hasElevator ?? (numFloors > 5 || bldgClass.startsWith("D")),
        hpdViolations: 0,
        dobPermitsRecent: 0,
      });
    }

    // Otherwise fetch from PLUTO
    if (!bbl || bbl.length < 10) return null;
    const boroCode = bbl[0];
    const block = bbl.slice(1, 6);
    const lot = bbl.slice(6, 10);

    const url = `https://data.cityofnewyork.us/resource/64uk-42ks.json?$where=borocode='${boroCode}' AND block='${block}' AND lot='${lot}'&$select=unitsres,unitstotal,bldgarea,yearbuilt,bldgclass,numfloors,assesstot&$limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const p = data[0];

    const pUnits = parseInt(p.unitsres || p.unitstotal || "0");
    const pSqft = parseInt(p.bldgarea || "0");
    const pYear = parseInt(p.yearbuilt || "0");
    const pClass = p.bldgclass || "";
    const pFloors = parseInt(p.numfloors || "0");
    const pElevator = pFloors > 5 || pClass.startsWith("D");

    // HPD violations count
    let hpdViolations = 0;
    try {
      const hpdRes = await fetch(
        `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$where=boroid='${boroCode}' AND block='${block.replace(/^0+/, "")}' AND lot='${lot.replace(/^0+/, "")}'&$select=count(*) as cnt`,
      );
      if (hpdRes.ok) {
        const hpdData = await hpdRes.json();
        if (Array.isArray(hpdData) && hpdData.length > 0) {
          hpdViolations = parseInt(hpdData[0]?.cnt || "0");
        }
      }
    } catch { /* non-critical */ }

    return estimateRenovationCost({
      units: units || pUnits,
      sqft: sqft || pSqft,
      yearBuilt: yearBuilt || pYear,
      buildingClass: bldgClass || pClass,
      floors: numFloors ?? pFloors,
      hasElevator: hasElevator ?? pElevator,
      hpdViolations,
      dobPermitsRecent: 0,
      assessedValue: parseInt(p.assesstot || "0"),
    });
  } catch (error) {
    console.error("Renovation estimate error:", error);
    return null;
  }
}

// ── Apply Research to Deal ──────────────────────────────────

export async function applyResearchToDeal(params: {
  dealId: string;
  researchType: "comps" | "cap_rate" | "benchmarks" | "closing_costs" | "rent_stabilization" | "renovation";
  data: Record<string, unknown>;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Unauthorized");

  const { dealId, researchType, data } = params;

  if (dealId === "new") {
    // Create a new deal with the research data embedded
    const deal = await prisma.dealAnalysis.create({
      data: {
        orgId: org.orgId,
        userId: org.userId,
        name: (data.address as string) || "New Deal",
        address: (data.address as string) || null,
        borough: (data.borough as string) || null,
        bbl: (data.bbl as string) || null,
        status: "analyzing",
        dealType: "acquisition",
        dealSource: "other",
        inputs: JSON.parse(JSON.stringify({ _researchApplied: { [researchType]: data } })),
        outputs: JSON.parse(JSON.stringify({})),
        lastViewedAt: new Date(),
      },
    });
    return { dealId: deal.id, created: true };
  }

  // Update existing deal — merge research into inputs
  const existing = await prisma.dealAnalysis.findFirst({
    where: { id: dealId, orgId: org.orgId },
    select: { inputs: true },
  });
  if (!existing) throw new Error("Deal not found");

  const currentInputs = (existing.inputs as Record<string, unknown>) || {};
  const researchApplied = (currentInputs._researchApplied as Record<string, unknown>) || {};
  researchApplied[researchType] = data;

  const updatedInputs: Record<string, unknown> = { ...currentInputs, _researchApplied: researchApplied };

  // Apply specific field overrides based on research type
  if (researchType === "cap_rate" && data.marketCapRate) {
    updatedInputs.exitCapRate = data.marketCapRate;
  }
  if (researchType === "closing_costs" && data.totalBuyerCosts) {
    updatedInputs.closingCosts = data.totalBuyerCosts;
  }
  if (researchType === "benchmarks" && data.totalAnnual) {
    updatedInputs._benchmarkTotal = data.totalAnnual;
  }

  await prisma.dealAnalysis.update({
    where: { id: dealId },
    data: {
      inputs: JSON.parse(JSON.stringify(updatedInputs)),
      lastViewedAt: new Date(),
    },
  });

  return { dealId, created: false };
}
