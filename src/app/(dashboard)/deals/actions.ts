"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { generateDealAssumptions, calibrateWithCensusData } from "@/lib/ai-assumptions";
import type { BuildingData } from "@/lib/ai-assumptions";
import { calculateAll } from "@/lib/deal-calculator";
import { getCensusContextForAI } from "@/app/(dashboard)/market-intel/neighborhood-actions";
import { sendEmail } from "@/lib/gmail-send";
import { getCurrentMortgageRate } from "@/lib/fred";
import { fetchFmrByZip } from "@/lib/hud";
import { getMarketAppreciation } from "@/lib/fhfa";
import { getRedfinMetrics } from "@/lib/redfin-market";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function saveDealAnalysis(data: {
  id?: string;
  name: string;
  address?: string;
  borough?: string;
  block?: string;
  lot?: string;
  bbl?: string;
  contactId?: string;
  status?: string;
  dealType?: string;
  dealSource?: string;
  inputs: any;
  outputs: any;
  notes?: string;
}) {
  const user = await getUser();

  if (data.id) {
    const deal = await prisma.dealAnalysis.update({
      where: { id: data.id },
      data: {
        name: data.name,
        address: data.address || null,
        borough: data.borough || null,
        block: data.block || null,
        lot: data.lot || null,
        bbl: data.bbl || null,
        contactId: data.contactId || null,
        status: (data.status as any) || undefined,
        dealType: (data.dealType as any) || undefined,
        dealSource: (data.dealSource as any) || undefined,
        inputs: data.inputs,
        outputs: data.outputs,
        notes: data.notes || null,
      },
    });
    return { id: deal.id, saved: true };
  }

  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      name: data.name,
      address: data.address || null,
      borough: data.borough || null,
      block: data.block || null,
      lot: data.lot || null,
      bbl: data.bbl || null,
      contactId: data.contactId || null,
      status: (data.status as any) || "analyzing",
      dealType: (data.dealType as any) || "acquisition",
      dealSource: (data.dealSource as any) || "off_market",
      inputs: data.inputs,
      outputs: data.outputs,
      notes: data.notes || null,
    },
  });

  return { id: deal.id, saved: true };
}

export async function getDealAnalyses() {
  const user = await getUser();
  const deals = await prisma.dealAnalysis.findMany({
    where: { orgId: user.orgId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      address: true,
      borough: true,
      status: true,
      dealType: true,
      dealSource: true,
      inputs: true,
      outputs: true,
      loiSent: true,
      loiSentDate: true,
      updatedAt: true,
    },
  });
  return deals.map(d => ({
    ...d,
    updatedAt: d.updatedAt.toISOString(),
    loiSentDate: d.loiSentDate?.toISOString() || null,
  }));
}

export async function getDealAnalysis(id: string) {
  const user = await getUser();
  const deal = await prisma.dealAnalysis.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!deal) throw new Error("Deal not found");
  return {
    ...deal,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    loiSentDate: deal.loiSentDate?.toISOString() || null,
  };
}

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";
const SALES_ID = "usep-8jbt";
const HPD_REG_ID = "tesw-yqqr";

// Borough avg rents by unit type (rough estimates for pre-fill)
const AVG_RENTS: Record<string, { studio: number; oneBr: number; twoBr: number; threeBr: number }> = {
  Manhattan: { studio: 2800, oneBr: 3500, twoBr: 4500, threeBr: 5500 },
  Brooklyn: { studio: 2200, oneBr: 2800, twoBr: 3500, threeBr: 4200 },
  Queens: { studio: 1800, oneBr: 2200, twoBr: 2800, threeBr: 3200 },
  Bronx: { studio: 1400, oneBr: 1700, twoBr: 2100, threeBr: 2500 },
  "Staten Island": { studio: 1300, oneBr: 1600, twoBr: 2000, threeBr: 2400 },
};

export interface DealPrefillData {
  // PLUTO
  address: string;
  borough: string;
  block: string;
  lot: string;
  bbl: string;
  unitsRes: number;
  unitsTotal: number;
  yearBuilt: number;
  numFloors: number;
  assessTotal: number;
  bldgArea: number;
  lotArea: number;
  zoneDist: string;
  ownerName: string;
  bldgClass: string;
  far: number;
  residFar: number;
  // ACRIS / Sales
  lastSalePrice: number;
  lastSaleDate: string;
  // HPD
  hpdUnits: number;
  // DOF / Tax
  annualTaxes: number;
  // Estimated unit mix
  suggestedUnitMix: { type: string; count: number; monthlyRent: number }[];
}

export async function fetchDealPrefillData(bbl: string): Promise<DealPrefillData | null> {
  const match = bbl.match(/^(\d)(\d{5})(\d{4})$/);
  if (!match) return null;

  const [, boro, rawBlock, rawLot] = match;
  const block = rawBlock.replace(/^0+/, "");
  const lot = rawLot.replace(/^0+/, "");
  const boroNames = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
  const borough = boroNames[parseInt(boro)] || "";

  // Fetch PLUTO, ACRIS Sales, HPD in parallel
  const [plutoResult, salesResult, hpdResult] = await Promise.allSettled([
    // PLUTO
    fetch(`${NYC_BASE}/${PLUTO_ID}.json?$where=borocode='${boro}' AND block='${block}' AND lot='${lot}'&$select=address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgarea,lotarea,zonedist1,bldgclass,builtfar,residfar,condession&$limit=1`)
      .then(r => r.ok ? r.json() : []),
    // ACRIS Rolling Sales
    fetch(`${NYC_BASE}/${SALES_ID}.json?$where=borough='${boro}' AND block='${block}' AND lot='${lot}'&$order=sale_date DESC&$limit=5`)
      .then(r => r.ok ? r.json() : []),
    // HPD Registrations
    fetch(`${NYC_BASE}/${HPD_REG_ID}.json?$where=boroid='${boro}' AND block='${block}' AND lot='${lot}'&$limit=1`)
      .then(r => r.ok ? r.json() : []),
  ]);

  const plutoData = plutoResult.status === "fulfilled" ? plutoResult.value : [];
  const salesData = salesResult.status === "fulfilled" ? salesResult.value : [];
  const hpdData = hpdResult.status === "fulfilled" ? hpdResult.value : [];

  if (plutoData.length === 0) return null;
  const p = plutoData[0];

  // Parse PLUTO
  const unitsRes = parseInt(p.unitsres || "0");
  const unitsTotal = parseInt(p.unitstotal || "0");
  const assessTotal = parseInt(p.assesstot || "0");
  const bldgArea = parseInt(p.bldgarea || "0");
  const lotArea = parseInt(p.lotarea || "0");

  // Annual taxes: NYC tax rate ~10-12% of assessed value for multifamily
  // More accurate: use assesstot * tax rate. NYC Class 2 effective rate ~12.3%
  const annualTaxes = Math.round(assessTotal * 0.123);

  // ACRIS last sale
  let lastSalePrice = 0;
  let lastSaleDate = "";
  for (const s of salesData) {
    const price = parseInt((s.sale_price || "0").replace(/,/g, ""));
    if (price > 10000) {
      lastSalePrice = price;
      lastSaleDate = s.sale_date || "";
      break;
    }
  }

  // HPD unit count
  const hpdUnits = hpdData.length > 0 ? parseInt(hpdData[0].unitsres || "0") : 0;

  // Estimate unit mix based on total units and borough
  const totalUnits = unitsRes || hpdUnits || unitsTotal;
  const rents = AVG_RENTS[borough] || AVG_RENTS["Brooklyn"];
  const suggestedUnitMix: { type: string; count: number; monthlyRent: number }[] = [];

  if (totalUnits > 0) {
    if (totalUnits <= 6) {
      // Small building: mostly 1BR/2BR
      const oneBr = Math.ceil(totalUnits * 0.5);
      const twoBr = totalUnits - oneBr;
      if (oneBr > 0) suggestedUnitMix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
      if (twoBr > 0) suggestedUnitMix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
    } else if (totalUnits <= 20) {
      const studios = Math.round(totalUnits * 0.15);
      const oneBr = Math.round(totalUnits * 0.45);
      const twoBr = Math.round(totalUnits * 0.3);
      const threeBr = totalUnits - studios - oneBr - twoBr;
      if (studios > 0) suggestedUnitMix.push({ type: "Studio", count: studios, monthlyRent: rents.studio });
      if (oneBr > 0) suggestedUnitMix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
      if (twoBr > 0) suggestedUnitMix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
      if (threeBr > 0) suggestedUnitMix.push({ type: "3BR", count: threeBr, monthlyRent: rents.threeBr });
    } else {
      // Large building: full mix
      const studios = Math.round(totalUnits * 0.2);
      const oneBr = Math.round(totalUnits * 0.4);
      const twoBr = Math.round(totalUnits * 0.25);
      const threeBr = totalUnits - studios - oneBr - twoBr;
      if (studios > 0) suggestedUnitMix.push({ type: "Studio", count: studios, monthlyRent: rents.studio });
      if (oneBr > 0) suggestedUnitMix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
      if (twoBr > 0) suggestedUnitMix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
      if (threeBr > 0) suggestedUnitMix.push({ type: "3BR", count: threeBr, monthlyRent: rents.threeBr });
    }
  }

  return {
    address: p.address || "",
    borough,
    block,
    lot,
    bbl,
    unitsRes,
    unitsTotal,
    yearBuilt: parseInt(p.yearbuilt || "0"),
    numFloors: parseInt(p.numfloors || "0"),
    assessTotal,
    bldgArea,
    lotArea,
    zoneDist: p.zonedist1 || "",
    ownerName: p.ownername || "",
    bldgClass: p.bldgclass || "",
    far: parseFloat(p.builtfar || "0"),
    residFar: parseFloat(p.residfar || "0"),
    lastSalePrice,
    lastSaleDate,
    hpdUnits,
    annualTaxes,
    suggestedUnitMix,
  };
}

// Keep backward compat alias
export async function fetchPlutoForDeal(bbl: string) {
  return fetchDealPrefillData(bbl);
}

export async function updateDealAnalysisStatus(id: string, status: string) {
  const user = await getUser();
  const deal = await prisma.dealAnalysis.findFirst({ where: { id, orgId: user.orgId } });
  if (!deal) throw new Error("Deal not found");

  const updateData: any = { status };
  if (status === "loi_sent" && !deal.loiSent) {
    updateData.loiSent = true;
    updateData.loiSentDate = new Date();
  }

  await prisma.dealAnalysis.update({ where: { id }, data: updateData });
  return { success: true };
}

export async function deleteDealAnalysis(id: string) {
  const user = await getUser();
  const deal = await prisma.dealAnalysis.findFirst({ where: { id, orgId: user.orgId } });
  if (!deal) throw new Error("Deal not found");
  await prisma.dealAnalysis.delete({ where: { id } });
  return { success: true };
}

// ============================================================
// One-Click Underwrite — fetch all data + AI assumptions + save
// ============================================================
export async function underwriteDeal(params: {
  boroCode: string;
  block: string;
  lot: string;
  address?: string;
  borough?: string;
}) {
  const user = await getUser();
  const { boroCode, block, lot } = params;
  const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
  const boroNames = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
  const borough = params.borough || boroNames[parseInt(boroCode)] || "";

  // Fetch all data sources in parallel
  const [plutoResult, salesResult, hpdRegResult, hpdViolResult, rentStabResult] = await Promise.allSettled([
    fetch(`${NYC_BASE}/${PLUTO_ID}.json?$where=borocode='${boroCode}' AND block='${block}' AND lot='${lot}'&$select=address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgarea,lotarea,zonedist1,bldgclass,builtfar,residfar&$limit=1`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/${SALES_ID}.json?$where=borough='${boroCode}' AND block='${block}' AND lot='${lot}'&$order=sale_date DESC&$limit=5`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/${HPD_REG_ID}.json?$where=boroid='${boroCode}' AND block='${block}' AND lot='${lot}'&$limit=1`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/wvxf-dwi5.json?$where=boroid='${boroCode}' AND block='${block}' AND lot='${lot}'&$select=count(*) as cnt`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/35ss-ekc5.json?$where=ucbbl='${bbl}'&$limit=1`)
      .then(r => r.ok ? r.json() : []),
  ]);

  const plutoData = plutoResult.status === "fulfilled" ? plutoResult.value : [];
  const salesData = salesResult.status === "fulfilled" ? salesResult.value : [];
  const hpdRegData = hpdRegResult.status === "fulfilled" ? hpdRegResult.value : [];
  const hpdViolData = hpdViolResult.status === "fulfilled" ? hpdViolResult.value : [];
  const rentStabData = rentStabResult.status === "fulfilled" ? rentStabResult.value : [];

  const p = plutoData[0] || {};
  const unitsRes = parseInt(p.unitsres || "0");
  const unitsTotal = parseInt(p.unitstotal || "0");
  const assessTotal = parseInt(p.assesstot || "0");
  const hpdUnits = hpdRegData.length > 0 ? parseInt(hpdRegData[0].unitsres || "0") : 0;
  const hpdViolationCount = hpdViolData.length > 0 ? parseInt(hpdViolData[0]?.cnt || "0") : 0;
  const rentStabilizedUnits = rentStabData.length > 0 ? parseInt(rentStabData[0]?.uc2022rstab || rentStabData[0]?.uc2021rstab || "0") : 0;

  // Parse last sale
  let lastSalePrice = 0;
  let lastSaleDate = "";
  for (const s of salesData) {
    const price = parseInt((s.sale_price || "0").replace(/,/g, ""));
    if (price > 10000) {
      lastSalePrice = price;
      lastSaleDate = s.sale_date || "";
      break;
    }
  }

  const annualTaxes = Math.round(assessTotal * 0.123);
  const address = params.address || p.address || "";

  // Build the data object for AI assumptions
  const buildingData: BuildingData = {
    address,
    borough,
    boroCode,
    block,
    lot,
    bbl,
    unitsRes,
    unitsTotal,
    yearBuilt: parseInt(p.yearbuilt || "0"),
    numFloors: parseInt(p.numfloors || "0"),
    assessTotal,
    bldgArea: parseInt(p.bldgarea || "0"),
    lotArea: parseInt(p.lotarea || "0"),
    zoneDist: p.zonedist1 || "",
    bldgClass: p.bldgclass || "",
    builtFar: parseFloat(p.builtfar || "0"),
    residFar: parseFloat(p.residfar || "0"),
    ownerName: p.ownername || "",
    lastSalePrice,
    lastSaleDate,
    hpdUnits,
    hpdViolationCount,
    rentStabilizedUnits,
    marketValue: assessTotal, // use assessed as proxy
    annualTaxes,
    hasElevator: parseInt(p.numfloors || "0") > 5,
  };

  // Fetch live market data (non-blocking)
  const zip = (hpdRegData[0]?.zip || "").slice(0, 5);
  const [fredResult, hudResult, appreciationResult] = await Promise.allSettled([
    getCurrentMortgageRate(),
    zip ? fetchFmrByZip(zip) : Promise.resolve(null),
    zip ? getMarketAppreciation(zip) : Promise.resolve(null),
  ]);
  const liveRate = fredResult.status === "fulfilled" ? fredResult.value : null;
  const hudFmr = hudResult.status === "fulfilled" ? hudResult.value : undefined;
  const appreciation = appreciationResult.status === "fulfilled" ? appreciationResult.value : undefined;
  const redfin = zip ? getRedfinMetrics(zip) : null;

  // Generate AI assumptions
  let inputs = generateDealAssumptions(buildingData, {
    liveInterestRate: liveRate ?? undefined,
    hudFmr: hudFmr ?? undefined,
    marketAppreciation: appreciation ?? undefined,
    redfinMetrics: redfin ?? undefined,
  });

  // Calibrate with Census data if available
  const censusContext = await getCensusContextForAI(`${address}, ${borough}, NY`).catch(() => null);
  if (censusContext) {
    // Parse census context back into calibration params
    const extractNum = (label: string) => {
      const m = censusContext.match(new RegExp(label + ".*?\\$?([\\d,.]+)"));
      return m ? parseFloat(m[1].replace(/,/g, "")) : undefined;
    };
    const extractPct = (label: string) => {
      const m = censusContext.match(new RegExp(label + ".*?([\\d.]+)%"));
      return m ? parseFloat(m[1]) : undefined;
    };
    inputs = calibrateWithCensusData(inputs, {
      medianRent: extractNum("Census median rent"),
      vacancyRate: extractPct("Census vacancy"),
      medianHouseholdIncome: extractNum("Median income"),
      rentBurdenPct: extractPct("Rent burden"),
    }, hudFmr ?? undefined, {
      appreciation: appreciation ?? undefined,
      redfin: redfin ?? undefined,
    });
  }

  const outputs = calculateAll(inputs);

  // Save the deal
  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      name: address || "Untitled Deal",
      address: address || null,
      borough: borough || null,
      block: block || null,
      lot: lot || null,
      bbl,
      status: "analyzing" as any,
      dealType: "acquisition" as any,
      dealSource: "off_market" as any,
      inputs: inputs as any,
      outputs: outputs as any,
      notes: `AI-generated underwriting assumptions based on ${unitsRes || unitsTotal} units at ${address}, ${borough}. Year built: ${buildingData.yearBuilt}. ${hpdViolationCount > 0 ? `HPD violations: ${hpdViolationCount}.` : ""} ${rentStabilizedUnits > 0 ? `Rent stabilized units: ${rentStabilizedUnits}.` : ""}${inputs._censusContext ? ` Census: ${inputs._censusContext}` : ""}`,
    },
  });

  return { id: deal.id };
}

// ============================================================
// Contact Search — typeahead for LOI contact picker
// ============================================================
export async function searchContacts(query: string) {
  const user = await getUser();
  if (!query || query.length < 2) return [];

  const contacts = await prisma.contact.findMany({
    where: {
      orgId: user.orgId,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
    },
    take: 10,
    orderBy: { lastName: "asc" },
  });

  return contacts;
}

// ============================================================
// Get linked contact by ID
// ============================================================
export async function getContact(contactId: string) {
  const user = await getUser();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
    },
  });
  return contact;
}

// ============================================================
// User Profile — for LOI broker info
// ============================================================
export async function getUserProfile() {
  const user = await getUser();
  return {
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || "",
    brokerage: user.brokerage || "",
    licenseNumber: user.licenseNumber || "",
    title: user.title || "",
  };
}

// ============================================================
// Send LOI via Email — generates email with PDF attachment
// ============================================================
export async function sendLoiEmail(params: {
  dealId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  pdfBase64: string;
  propertyAddress: string;
  contactId?: string;
}) {
  const user = await getUser();

  // Find user's Gmail account
  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: user.id, isActive: true },
  });
  if (!gmailAccount) throw new Error("No Gmail account connected. Please connect Gmail in Settings.");

  const filename = `LOI-${(params.propertyAddress || "property").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`;

  // Send email with PDF attachment
  await sendEmail({
    gmailAccountId: gmailAccount.id,
    orgId: user.orgId,
    to: params.recipientEmail,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    contactId: params.contactId,
    attachments: [
      {
        filename,
        mimeType: "application/pdf",
        base64Content: params.pdfBase64,
      },
    ],
  });

  // Update deal status to loi_sent
  await prisma.dealAnalysis.update({
    where: { id: params.dealId },
    data: {
      status: "loi_sent" as any,
      loiSent: true,
      loiSentDate: new Date(),
    },
  });

  return { success: true };
}

// ============================================================
// LOI Follow-up Deals — for dashboard reminders
// ============================================================
export async function getLoiFollowUpDeals() {
  const user = await getUser();
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const deals = await prisma.dealAnalysis.findMany({
    where: {
      orgId: user.orgId,
      status: "loi_sent" as any,
      loiSent: true,
      loiSentDate: { lt: fiveDaysAgo },
    },
    select: {
      id: true,
      name: true,
      address: true,
      loiSentDate: true,
    },
    orderBy: { loiSentDate: "asc" },
  });

  return deals.map(d => ({
    ...d,
    loiSentDate: d.loiSentDate?.toISOString() || null,
  }));
}

// ============================================================
// Live Comps — search comparable sales from NYC DOF
// ============================================================
export async function fetchComps(params: {
  zip: string;
  radiusMiles?: number;
  yearsBack?: number;
  minUnits?: number;
  minPrice?: number;
  limit?: number;
}) {
  const { searchComps } = await import("@/lib/comps-engine");
  return searchComps(params);
}
