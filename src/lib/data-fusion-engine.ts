"use server";

// ============================================================
// Data Fusion Engine — Unified Building Intelligence Layer
//
// Queries ALL data sources in parallel, cross-references entities,
// resolves conflicts, and produces one BuildingIntelligence object.
// ============================================================

import {
  type NormalizedAddress,
  type ResolvedEntity,
  type ResolvedContact,
  type ConfidentValue,
  normalizeAddress,
  resolveOwner,
  isSameEntity,
  isEntityName,
  isPersonName,
  normalizeName,
  resolveValue,
} from "./entity-resolver";

// Types available from entity-resolver.ts directly if needed by consumers

// ---- BuildingIntelligence Types ----

export interface BuildingIntelligence {
  bbl: string;
  bin?: string;
  address: NormalizedAddress;
  alternateAddresses: NormalizedAddress[];

  property: {
    units: ConfidentValue<number> | null;
    residentialUnits: ConfidentValue<number> | null;
    commercialUnits: ConfidentValue<number> | null;
    yearBuilt: ConfidentValue<number> | null;
    grossSqft: ConfidentValue<number> | null;
    lotSqft: ConfidentValue<number> | null;
    stories: ConfidentValue<number> | null;
    buildingClass: ConfidentValue<string> | null;
    zoning: ConfidentValue<string> | null;
    builtFAR: ConfidentValue<number> | null;
    maxFAR: ConfidentValue<number> | null;
    hasElevator: ConfidentValue<boolean> | null;
    rentStabilizedUnits: ConfidentValue<number> | null;
  };

  ownership: {
    likelyOwner: ResolvedEntity;
    registeredOwner: string;
    hpdRegistration?: {
      owner: string;
      managingAgent: string;
      agentPhone: string;
      agentAddress: string;
    };
    deedHolder?: string;
    llcName?: string;
    corporateAffiliations: string[];
    mailingAddress?: string;
    ownerPortfolio: { bbl: string; address: string; units: number }[];
    confidence: number;
    sources: string[];
  };

  financials: {
    assessedValue: { value: number; source: string; year: number } | null;
    marketValue: { value: number; source: string; year: number } | null;
    annualTax: { value: number; source: string; year: number } | null;
    taxRate: { value: number; source: string } | null;
    lastSale: {
      price: number;
      date: string;
      buyer: string;
      seller: string;
      source: string;
    } | null;
    allSales: {
      price: number;
      date: string;
      buyer: string;
      seller: string;
      docType: string;
    }[];
    estimatedValue: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
    } | null;
  };

  energy: {
    energyStarGrade: string;
    energyStarScore: number;
    siteEUI: number;
    sourceEUI: number;
    electricityKwh: number;
    gasTherms: number;
    waterKgal: number;
    fuelOilGal: number;
    ghgEmissions: number;
    estimatedUtilityCost: number;
    ll97Status: "compliant" | "at_risk_2030" | "non_compliant";
    ll97PenaltyEstimate: number;
    reportingYear: number;
  } | null;

  compliance: {
    hpdViolations: {
      open: number;
      total: number;
      classA: number;
      classB: number;
      classC: number;
      recentViolations: any[];
    };
    dobViolations: { open: number; ecb: number; ecbPenalty: number };
    dobPermits: { active: number; recent: any[] };
    rpieStatus: "compliant" | "non_compliant" | "unknown";
    rpieYearsMissed: string[];
    ll84Status: "reported" | "not_reported" | "not_required";
    complaints311: number;
    recentComplaints: number;
    topComplaintTypes: { type: string; count: number }[];
    litigationCount: number;
    openLitigation: number;
    harassmentFinding: boolean;
  };

  distressSignals: {
    score: number;
    signals: {
      type: string;
      severity: "low" | "medium" | "high";
      description: string;
      source: string;
    }[];
  };

  investmentSignals: {
    score: number;
    signals: {
      type: string;
      description: string;
      estimatedUpside: string;
    }[];
  };

  comps: {
    count: number;
    avgPricePerUnit: number;
    medianPricePerUnit: number;
    avgPricePerSqft: number;
    subjectVsMarket: number;
    recentComps: any[];
  } | null;

  liveListings: {
    forSale: {
      address: string;
      price: number;
      priceStr: string;
      units?: number;
      sqft?: number;
      pricePerUnit?: number;
      pricePerSqft?: number;
      broker?: string;
      brokerage?: string;
      daysOnMarket?: number;
      sourceUrl: string;
      sourceDomain: string;
      description: string;
    }[];
    forRent: {
      address: string;
      price: number;
      priceStr: string;
      beds?: number;
      sourceUrl: string;
      sourceDomain: string;
      description: string;
    }[];
    webComps: {
      address: string;
      price: number;
      priceStr: string;
      units?: number;
      pricePerUnit?: number;
      sourceUrl: string;
      type: string;
    }[];
    marketTrend: "rising" | "stable" | "declining" | "unknown";
    marketInsight: string;
  } | null;

  webIntelligence: {
    entityName: string;
    newsCount: number;
    courtFilingCount: number;
    hasNegativeNews: boolean;
    hasLawsuits: boolean;
    topArticles: {
      title: string;
      url: string;
      domain: string;
      snippet: string;
      category: string;
      sentiment?: string;
    }[];
    aiSummary?: string;
  } | null;

  contacts: {
    ownerContacts: ResolvedContact[];
    managingAgentContacts: ResolvedContact[];
  };

  // Raw data pass-through (for sections that render raw arrays)
  raw: {
    pluto: any;
    violations: any[];
    violationSummary: any;
    complaints: any[];
    complaintSummary: any;
    permits: any[];
    hpdContacts: any[];
    registrations: any[];
    litigation: any[];
    litigationSummary: any;
    ecbViolations: any[];
    ecbSummary: any;
    rentStabilized: any;
    speculation: any;
    dobFilings: any[];
    phoneRankings: any[];
    neighborhoodData: any;
    pdlEnrichment: any;
    apolloEnrichment: any;
    apolloOrgEnrichment: any;
    apolloKeyPeople: any[];
    leadVerification: any;
    rankedContacts: any[];
    ownerContacts: any[];
  };

  dataSources: string[];
  dataFreshness: Record<string, string>;
  overallConfidence: number;
  lastUpdated: string;
}

// ---- In-memory cache (15 min TTL) ----

const cache = new Map<string, { data: BuildingIntelligence; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

function getCached(bbl: string): BuildingIntelligence | null {
  const entry = cache.get(bbl);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(bbl); return null; }
  return entry.data;
}

function setCache(bbl: string, data: BuildingIntelligence) {
  cache.set(bbl, { data, ts: Date.now() });
  // Evict old entries if cache grows too large
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

// ---- NYC Open Data Helpers ----

const NYC = "https://data.cityofnewyork.us/resource";

const DATASETS = {
  PLUTO: "64uk-42ks",
  HPD_VIOLATIONS: "wvxf-dwi5",
  HPD_COMPLAINTS: "uwyv-629c",
  DOB_PERMITS: "83x8-shf7",
  DOB_JOBS: "ic3t-wcy2",
  HPD_REG: "tesw-yqqr",
  HPD_CONTACTS: "feu5-w2e2",
  HPD_LITIGATION: "59kj-x8nc",
  DOB_ECB: "6bgk-3dad",
  DOB_NOW: "w9ak-ipjd",
  RENT_STAB: "35ss-ekc5",
  SPECULATION: "adax-9x2w",
  RPIE: "wvts-6tdf",
  LL84: "5zyy-y8am",
  ROLLING_SALES: "usep-8jbt",
} as const;

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function queryNYC(dataset: string, where: string, opts?: { select?: string; limit?: number; order?: string; timeout?: number }): Promise<any[]> {
  const url = new URL(`${NYC}/${dataset}.json`);
  url.searchParams.set("$where", where);
  if (opts?.select) url.searchParams.set("$select", opts.select);
  url.searchParams.set("$limit", String(opts?.limit || 200));
  if (opts?.order) url.searchParams.set("$order", opts.order);
  try {
    const res = await fetchWithTimeout(url.toString(), opts?.timeout || 8000);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const BORO_NAMES: Record<string, string> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };
const BORO_UPPER: Record<string, string> = { "1": "MANHATTAN", "2": "BRONX", "3": "BROOKLYN", "4": "QUEENS", "5": "STATEN ISLAND" };

// ---- LL97 Constants ----

const UTILITY_RATES = { electricity: 0.20, gas: 1.20, water: 12.00, fuelOil: 3.50 };
const LL97_LIMITS: Record<string, { limit2024: number; limit2030: number }> = {
  multifamily: { limit2024: 0.00675, limit2030: 0.00407 },
  office: { limit2024: 0.00846, limit2030: 0.00453 },
  retail: { limit2024: 0.01074, limit2030: 0.00453 },
  hotel: { limit2024: 0.00987, limit2030: 0.00526 },
  _default: { limit2024: 0.00846, limit2030: 0.00453 },
};
const LL97_PENALTY_PER_TON = 268;

// ============================================================
// MAIN: fetchBuildingIntelligence
// ============================================================

export async function fetchBuildingIntelligence(bbl: string): Promise<BuildingIntelligence> {
  // Normalize BBL to 10 digits
  const bbl10 = bbl.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
  const boroCode = bbl10[0];
  const block = bbl10.slice(1, 6).replace(/^0+/, "") || "0";
  const lot = bbl10.slice(6, 10).replace(/^0+/, "") || "0";
  const blockPad = block.padStart(5, "0");
  const lotPad = lot.padStart(4, "0");
  const lotPad5 = lot.padStart(5, "0");
  const boroName = BORO_NAMES[boroCode] || "";
  const boroUpper = BORO_UPPER[boroCode] || "";

  // Check cache
  const cached = getCached(bbl10);
  if (cached) return cached;

  console.log(`=== DATA FUSION ENGINE === BBL: ${bbl10} (${boroName} blk ${block} lot ${lot})`);

  // Prepare results containers
  let plutoData: any = null;
  let hpdViolations: any[] = [];
  let hpdComplaints: any[] = [];
  let dobPermits: any[] = [];
  let dobJobs: any[] = [];
  let dobNow: any[] = [];
  let hpdRegistrations: any[] = [];
  let hpdContacts: any[] = [];
  let hpdLitigation: any[] = [];
  let dobEcb: any[] = [];
  let rentStab: any = null;
  let speculation: any = null;
  let rpieRecords: any[] = [];
  let ll84Raw: any = null;
  let rollingSales: any[] = [];

  const dataSources: string[] = [];
  const dataFreshness: Record<string, string> = {};
  const rawPhoneEntries: { phone: string; name: string; isOwnerPhone: boolean; filingDate: string; source: string }[] = [];

  // ============================================================
  // PHASE 1: Parallel data source queries (Promise.allSettled)
  // ============================================================

  const queries = await Promise.allSettled([
    // 0. PLUTO
    queryNYC(DATASETS.PLUTO, `borocode='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 1 }),

    // 1. HPD Violations
    queryNYC(DATASETS.HPD_VIOLATIONS, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 200, order: "inspectiondate DESC" }),

    // 2. HPD Complaints
    queryNYC(DATASETS.HPD_COMPLAINTS, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 200, order: "receiveddate DESC" }),

    // 3. DOB Permits
    queryNYC(DATASETS.DOB_PERMITS, `borough='${boroUpper}' AND block='${blockPad}' AND lot='${lotPad5}'`, {
      select: "owner_s_first_name,owner_s_last_name,owner_s_phone__,owner_s_business_name,permittee_s_first_name,permittee_s_last_name,permittee_s_phone__,permit_type,permit_status,filing_date,job_description",
      limit: 20, order: "filing_date DESC",
    }),

    // 4. HPD Registrations
    queryNYC(DATASETS.HPD_REG, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 5, order: "registrationenddate DESC" }),

    // 5. HPD Litigation
    queryNYC(DATASETS.HPD_LITIGATION, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 50, order: "caseopendate DESC" }),

    // 6. DOB ECB Violations
    queryNYC(DATASETS.DOB_ECB, `boro='${boroCode}' AND block='${blockPad}' AND lot='${lotPad}'`, { limit: 50, order: "issueddate DESC" }),

    // 7. Rent Stabilization
    queryNYC(DATASETS.RENT_STAB, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 5 }),

    // 8. Speculation Watch List
    queryNYC(DATASETS.SPECULATION, `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 5 }),

    // 9. DOB Job Applications
    queryNYC(DATASETS.DOB_JOBS, `borough='${boroUpper}' AND block='${blockPad}' AND lot='${lotPad5}'`, {
      select: "owner_s_first_name,owner_s_last_name,owner_sphone__,owner_s_business_name,owner_type,latest_action_date,job_type,house__,street_name",
      limit: 10, order: "latest_action_date DESC",
    }),

    // 10. DOB NOW Filings
    queryNYC(DATASETS.DOB_NOW, `borough='${boroUpper}' AND block='${blockPad}' AND lot='${lotPad5}'`, {
      select: "job_filing_number,job_type,filing_date,filing_status,owner_first_name,owner_last_name,owner_business_name,owner_phone,permittee_first_name,permittee_last_name,permittee_business_name,permittee_phone,proposed_dwelling_units,proposed_no_of_stories,estimated_job_costs,job_description",
      limit: 15, order: "filing_date DESC",
    }),

    // 11. RPIE Non-Compliance
    queryNYC(DATASETS.RPIE, `bbl='${bbl10}'`, { limit: 10 }),

    // 12. LL84 Energy
    queryNYC(DATASETS.LL84, `bbl_10_digits='${bbl10}'`, { limit: 1, order: "year_ending DESC" }),

    // 13. Rolling Sales (comps in same zip — fetched after PLUTO but we start it here with boro)
    queryNYC(DATASETS.ROLLING_SALES, `borough='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 5, order: "sale_date DESC" }),
  ]);

  // ============================================================
  // PHASE 2: Extract results from settled promises
  // ============================================================

  const extract = (idx: number): any[] => {
    const r = queries[idx];
    return r.status === "fulfilled" ? r.value : [];
  };

  // 0. PLUTO
  const plutoRaw = extract(0);
  if (plutoRaw.length > 0) {
    const p = plutoRaw[0];
    plutoData = {
      address: p.address || "",
      ownerName: p.ownername || "",
      unitsRes: parseInt(p.unitsres || "0"),
      unitsTot: parseInt(p.unitstotal || "0"),
      yearBuilt: parseInt(p.yearbuilt || "0"),
      yearAlter1: parseInt(p.yearalter1 || "0"),
      yearAlter2: parseInt(p.yearalter2 || "0"),
      numFloors: parseInt(p.numfloors || "0"),
      bldgArea: parseInt(p.bldgarea || "0"),
      lotArea: parseInt(p.lotarea || "0"),
      assessTotal: parseInt(p.assesstot || "0"),
      assessLand: parseInt(p.assessland || "0"),
      zoneDist1: p.zonedist1 || "",
      zoneDist2: p.zonedist2 || "",
      bldgClass: p.bldgclass || "",
      landUse: p.landuse || "",
      condoNo: p.condono || "",
      builtFAR: parseFloat(p.builtfar || "0"),
      residFAR: parseFloat(p.residfar || "0"),
      commFAR: parseFloat(p.commfar || "0"),
      facilFAR: parseFloat(p.facilfar || "0"),
      borough: boroName,
      block, lot, boroCode,
      zipCode: p.zipcode || "",
    };
    dataSources.push("PLUTO");
    dataFreshness.PLUTO = "2024";
  }

  // 1. HPD Violations
  hpdViolations = extract(1).map((v: any) => ({
    violationId: v.violationid || "",
    class: v.class || "",
    inspectionDate: v.inspectiondate || "",
    approvedDate: v.approveddate || "",
    status: v.violationstatus || "",
    currentStatus: v.currentstatus || "",
    novDescription: v.novdescription || "",
  }));
  if (hpdViolations.length > 0) { dataSources.push("HPD Violations"); dataFreshness["HPD Violations"] = "Live"; }

  // 2. HPD Complaints
  hpdComplaints = extract(2).map((c: any) => ({
    complaintId: c.complaintid || "",
    status: c.status || "",
    receivedDate: c.receiveddate || "",
    type: c.majorcategory || c.majorcategoryid || "",
    minorCategory: c.minorcategory || "",
  }));
  if (hpdComplaints.length > 0) { dataSources.push("HPD Complaints"); dataFreshness["HPD Complaints"] = "Live"; }

  // 3. DOB Permits
  const dobPermitsRaw = extract(3);
  dobPermits = dobPermitsRaw.map((p: any) => ({
    permitType: p.permit_type || "",
    permitStatus: p.permit_status || "",
    filingDate: p.filing_date || "",
    jobDescription: p.job_description || "",
    ownerName: [p.owner_s_first_name, p.owner_s_last_name].filter(Boolean).join(" ").trim(),
    ownerBusiness: p.owner_s_business_name || "",
  }));
  // Extract phones from permits
  const permitPhoneSeen = new Set<string>();
  dobPermitsRaw.forEach((p: any) => {
    const ownerName = [p.owner_s_first_name, p.owner_s_last_name].filter(Boolean).join(" ").trim();
    const ownerPhone = (p.owner_s_phone__ || "").trim();
    const ownerBiz = p.owner_s_business_name || "";
    if (ownerPhone && !permitPhoneSeen.has(ownerPhone)) {
      permitPhoneSeen.add(ownerPhone);
      rawPhoneEntries.push({ phone: ownerPhone, name: ownerName || ownerBiz, isOwnerPhone: true, filingDate: p.filing_date || "", source: "DOB Permit (Owner)" });
    }
    const applicantPhone = (p.permittee_s_phone__ || "").trim();
    const applicantName = [p.permittee_s_first_name, p.permittee_s_last_name].filter(Boolean).join(" ").trim();
    if (applicantPhone && applicantPhone !== ownerPhone) {
      rawPhoneEntries.push({ phone: applicantPhone, name: applicantName, isOwnerPhone: false, filingDate: p.filing_date || "", source: "DOB Permit (Applicant)" });
    }
  });
  if (dobPermits.length > 0) { dataSources.push("DOB Permits"); dataFreshness["DOB Permits"] = "Live"; }

  // 4. HPD Registrations + 4b. HPD Contacts
  hpdRegistrations = extract(4);
  if (hpdRegistrations.length > 0) {
    dataSources.push("HPD Registration");
    dataFreshness["HPD Registration"] = "Live";
    // Fetch contacts for these registrations
    const regIds = hpdRegistrations.map((r: any) => `'${r.registrationid}'`).join(",");
    try {
      hpdContacts = await queryNYC(DATASETS.HPD_CONTACTS, `registrationid in(${regIds})`, { limit: 30 });
    } catch { /* contacts fetch failed, continue without */ }
  }

  // 5. HPD Litigation
  hpdLitigation = extract(5).map((l: any) => ({
    litigationId: l.litigationid || "",
    caseType: l.casetype || "",
    caseOpenDate: l.caseopendate || "",
    caseStatus: l.casestatus || "",
    penalty: l.penalty || "",
    respondent: l.respondent || "",
    findingOfHarassment: l.findingofharassment || "",
  }));
  if (hpdLitigation.length > 0) { dataSources.push("HPD Litigation"); dataFreshness["HPD Litigation"] = "Live"; }

  // 6. DOB ECB
  dobEcb = extract(6).map((e: any) => ({
    ecbNumber: e.ecbviolationnumber || e.isn_dob_bis_extract || "",
    violationType: e.violationtype || "",
    issuedDate: e.issueddate || "",
    status: e.ecbviolationstatus || "",
    penaltyApplied: parseFloat(e.penaltyapplied || "0"),
    penaltyBalance: parseFloat(e.penaltybalancedue || "0"),
    respondent: e.respondentname || "",
  }));
  if (dobEcb.length > 0) { dataSources.push("DOB ECB"); dataFreshness["DOB ECB"] = "Live"; }

  // 7. Rent Stabilization
  const rentStabRaw = extract(7);
  if (rentStabRaw.length > 0) {
    const r = rentStabRaw[0];
    rentStab = {
      status: "Yes",
      uc2007: parseInt(r.uc2007 || "0"), uc2008: parseInt(r.uc2008 || "0"),
      uc2009: parseInt(r.uc2009 || "0"), uc2010: parseInt(r.uc2010 || "0"),
      uc2011: parseInt(r.uc2011 || "0"), uc2012: parseInt(r.uc2012 || "0"),
      uc2013: parseInt(r.uc2013 || "0"), uc2014: parseInt(r.uc2014 || "0"),
      uc2015: parseInt(r.uc2015 || "0"), uc2016: parseInt(r.uc2016 || "0"),
      uc2017: parseInt(r.uc2017 || "0"), uc2018: parseInt(r.uc2018 || "0"),
      uc2019: parseInt(r.uc2019 || "0"), uc2020: parseInt(r.uc2020 || "0"),
      uc2021: parseInt(r.uc2021 || "0"), uc2022: parseInt(r.uc2022 || "0"),
      uc2023: parseInt(r.uc2023 || "0"), uc2024: parseInt(r.uc2024 || "0"),
      buildingId: r.buildingid || "",
    };
    dataSources.push("Rent Stabilization");
    dataFreshness["Rent Stabilization"] = "2024";
  }

  // 8. Speculation
  const specRaw = extract(8);
  if (specRaw.length > 0) {
    speculation = {
      onWatchList: true,
      deedDate: specRaw[0].deeddate || "",
      salePrice: parseFloat(specRaw[0].saleprice || "0"),
      capRate: specRaw[0].caprate || "",
      boroughMedianCap: specRaw[0].boroughmedian || "",
    };
    dataSources.push("Speculation Watch List");
  }

  // 9. DOB Job Applications
  dobJobs = extract(9);
  const dobFilings: any[] = [];
  const ownerContacts: { name: string; phone: string; address: string; source: string }[] = [];
  const jobPhoneSeen = new Set<string>();
  dobJobs.forEach((d: any) => {
    const name = (d.owner_s_business_name && d.owner_s_business_name !== "N/A")
      ? d.owner_s_business_name
      : [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim();
    const phone = (d.owner_sphone__ || "").trim();
    const addr = [d.house__, d.street_name].filter(Boolean).join(" ").trim();
    const filingDate = d.latest_action_date || "";
    dobFilings.push({ jobType: d.job_type || "", filingDate, ownerName: [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim(), ownerBusiness: d.owner_s_business_name || "", ownerPhone: phone, permittee: "", permitteePhone: "", units: 0, stories: 0, status: "", cost: "", description: "", source: "DOB BIS" });
    const key = name + phone;
    if (key.length > 3 && !jobPhoneSeen.has(key)) {
      jobPhoneSeen.add(key);
      ownerContacts.push({ name, phone, address: addr, source: "DOB Job Filing" });
    }
    if (phone) rawPhoneEntries.push({ phone, name, isOwnerPhone: true, filingDate, source: "DOB Job Filing" });
  });
  if (dobJobs.length > 0) { dataSources.push("DOB Job Applications"); dataFreshness["DOB Job Applications"] = "Live"; }

  // 10. DOB NOW
  dobNow = extract(10);
  const nowPhoneSeen = new Set<string>();
  dobNow.forEach((d: any) => {
    const ownerName = (d.owner_business_name && d.owner_business_name !== "N/A")
      ? d.owner_business_name
      : [d.owner_first_name, d.owner_last_name].filter(Boolean).join(" ").trim();
    const ownerPhone = (d.owner_phone || "").trim();
    const permittee = (d.permittee_business_name && d.permittee_business_name !== "N/A")
      ? d.permittee_business_name
      : [d.permittee_first_name, d.permittee_last_name].filter(Boolean).join(" ").trim();
    const permitteePhone = (d.permittee_phone || "").trim();
    const filingDate = d.filing_date || "";
    dobFilings.push({ jobType: d.job_type || "", filingDate, ownerName, ownerBusiness: d.owner_business_name || "", ownerPhone, permittee, permitteePhone, units: parseInt(d.proposed_dwelling_units || "0"), stories: parseInt(d.proposed_no_of_stories || "0"), status: d.filing_status || "", cost: d.estimated_job_costs || "", description: d.job_description || "", source: "DOB NOW" });
    const key = ownerName + ownerPhone;
    if (key.length > 3 && !nowPhoneSeen.has(key)) {
      nowPhoneSeen.add(key);
      ownerContacts.push({ name: ownerName, phone: ownerPhone, address: "", source: "DOB NOW Filing" });
    }
    if (ownerPhone) rawPhoneEntries.push({ phone: ownerPhone, name: ownerName, isOwnerPhone: true, filingDate, source: "DOB NOW (Owner)" });
    if (permitteePhone && permitteePhone !== ownerPhone) rawPhoneEntries.push({ phone: permitteePhone, name: permittee, isOwnerPhone: false, filingDate, source: "DOB NOW (Permittee)" });
  });
  if (dobNow.length > 0 && !dataSources.includes("DOB Job Applications")) { dataSources.push("DOB NOW"); dataFreshness["DOB NOW"] = "Live"; }

  // 11. RPIE
  rpieRecords = extract(11);
  if (rpieRecords.length > 0) { dataSources.push("RPIE"); dataFreshness.RPIE = "Live"; }

  // 12. LL84
  const ll84Raw_ = extract(12);
  if (ll84Raw_.length > 0) {
    const d = ll84Raw_[0];
    ll84Raw = {
      bbl: bbl10,
      propertyName: d.property_name || d.largest_property_use_type || "",
      address: d.address_1_self_reported || d.street_address || "",
      primaryUse: d.largest_property_use_type || d.primary_property_type_self_selected || "",
      grossFloorArea: parseFloat(d.property_gfa_self_reported || d.largest_property_use_type_gross_floor_area || "0"),
      yearBuilt: parseInt(d.year_built || "0"),
      energyStarScore: parseInt(d.energy_star_score || "0"),
      energyStarGrade: d.energy_star_certification || d.letter_grade || "",
      siteEui: parseFloat(d.site_eui_kbtu_ft || d.weather_normalized_site_eui_kbtu_ft || "0"),
      sourceEui: parseFloat(d.source_eui_kbtu_ft || d.weather_normalized_source_eui_kbtu_ft || "0"),
      electricityUse: parseFloat(d.electricity_use_grid_purchase_kwh || "0"),
      naturalGasUse: parseFloat(d.natural_gas_use_therms || "0"),
      waterUse: parseFloat(d.water_use_all_water_sources_kgal || d.water_use_kgal || "0"),
      fuelOilUse: parseFloat(d.fuel_oil_2_use_gallons || d.fuel_oil_4_use_gallons || "0"),
      ghgEmissions: parseFloat(d.total_ghg_emissions_metric_tons_co2e || d.direct_ghg_emissions_metric_tons_co2e || "0"),
      ghgIntensity: parseFloat(d.ghg_intensity_kgco2e_ft || "0"),
      reportingYear: parseInt(d.year_ending || "0"),
    };
    dataSources.push("LL84 Energy");
    dataFreshness["LL84 Energy"] = String(ll84Raw.reportingYear || "2023");
  }

  // 13. Rolling Sales (for this specific property)
  rollingSales = extract(13).map((s: any) => ({
    price: parseFloat(s.sale_price || "0"),
    date: s.sale_date || "",
    buyer: "",
    seller: "",
    docType: "Sale",
    units: parseInt(s.residential_units || s.total_units || "0"),
    sqft: parseInt(s.gross_square_feet || "0"),
  })).filter((s: any) => s.price > 0);
  if (rollingSales.length > 0) { dataSources.push("Rolling Sales"); dataFreshness["Rolling Sales"] = "Live"; }

  // ============================================================
  // PHASE 3: Entity Resolution & Cross-Referencing
  // ============================================================

  // Parse HPD contacts into structured data
  const parsedHpdContacts = hpdContacts.map((c: any) => ({
    type: c.type || c.contactdescription || "",
    corporateName: c.corporationname || "",
    firstName: c.firstname || "",
    lastName: c.lastname || "",
    title: c.title || "",
    businessAddress: [c.businesshousenumber, c.businessstreetname].filter(Boolean).join(" "),
    businessCity: c.businesscity || "",
    businessState: c.businessstate || "",
    businessZip: c.businesszip || "",
  }));

  // Extract HPD agent info
  const hpdAgents = parsedHpdContacts.filter(c => c.type === "SiteManager" || c.type === "Agent" || c.type === "ManagingAgent");
  const hpdIndividualOwners = parsedHpdContacts.filter(c => c.type === "IndividualOwner" || c.type === "HeadOfficer").map(c => `${c.firstName} ${c.lastName}`.trim()).filter(n => n.length > 2);
  const hpdCorpOwners = parsedHpdContacts.filter(c => c.type === "CorporateOwner").map(c => c.corporateName).filter(n => n.length > 2);

  const topAgent = hpdAgents[0];
  const agentName = topAgent ? (`${topAgent.firstName} ${topAgent.lastName}`.trim() || topAgent.corporateName) : "";
  const agentAddress = topAgent ? [topAgent.businessAddress, topAgent.businessCity, topAgent.businessState].filter(Boolean).join(", ") : "";

  // Resolve ownership across all sources
  const resolvedOwnership = resolveOwner({
    plutoOwner: plutoData?.ownerName,
    hpdRegistration: {
      owner: hpdCorpOwners[0] || hpdIndividualOwners[0] || "",
      agent: agentName,
      agentPhone: "",
      agentAddress: agentAddress,
      individualOwners: hpdIndividualOwners,
      corpOwners: hpdCorpOwners,
    },
  });

  // ============================================================
  // PHASE 4: Phone Ranking (from building-profile-actions pattern)
  // ============================================================

  const phoneRankings = rankPhones(rawPhoneEntries, hpdIndividualOwners, hpdCorpOwners, plutoData?.ownerName || "");

  // Extract phones from DOB permits for owner contacts
  dobPermitsRaw.forEach((p: any) => {
    const ownerName = [p.owner_s_first_name, p.owner_s_last_name].filter(Boolean).join(" ").trim();
    const ownerPhone = (p.owner_s_phone__ || "").trim();
    const ownerBiz = p.owner_s_business_name || "";
    const key = (ownerName || ownerBiz) + ownerPhone;
    if (key.length > 3 && ownerPhone) {
      const existing = ownerContacts.find(c => c.phone === ownerPhone);
      if (!existing) ownerContacts.push({ name: ownerName || ownerBiz, phone: ownerPhone, address: "", source: "DOB Permit" });
    }
  });

  // HPD agent contacts
  hpdAgents.forEach(a => {
    const name = `${a.firstName} ${a.lastName}`.trim() || a.corporateName;
    if (name.length > 2) {
      const addr = [a.businessAddress, a.businessCity, a.businessState].filter(Boolean).join(", ");
      ownerContacts.push({ name, phone: "", address: addr, source: "HPD Agent/Manager" });
    }
  });

  // Build ranked contacts
  const rankedContacts = buildRankedContacts(ownerContacts, parsedHpdContacts, phoneRankings);

  // ============================================================
  // PHASE 5: Resolve Property Data (conflict resolution)
  // ============================================================

  const totalUnits = resolveValue<number>([
    ...(plutoData ? [{ value: plutoData.unitsTot, source: "PLUTO", priority: 2 }] : []),
    ...(parsedHpdContacts.length > 0 && plutoData ? [{ value: plutoData.unitsRes, source: "HPD", priority: 1 }] : []),
    ...(ll84Raw?.grossFloorArea && plutoData?.bldgArea ? [] : []),
  ].filter(e => e.value > 0));

  const resUnits = resolveValue<number>([
    ...(plutoData ? [{ value: plutoData.unitsRes, source: "PLUTO", priority: 1 }] : []),
  ].filter(e => e.value > 0));

  const commercialUnits = totalUnits && resUnits && totalUnits.value > resUnits.value
    ? { value: totalUnits.value - resUnits.value, source: "Calculated", confidence: 70, alternateValues: undefined }
    : null;

  const grossSqft = resolveValue<number>([
    ...(plutoData?.bldgArea > 0 ? [{ value: plutoData.bldgArea, source: "PLUTO", priority: 2 }] : []),
    ...(ll84Raw?.grossFloorArea > 0 ? [{ value: Math.round(ll84Raw.grossFloorArea), source: "LL84", priority: 1 }] : []),
  ]);

  const yearBuilt = resolveValue<number>([
    ...(plutoData?.yearBuilt > 0 ? [{ value: plutoData.yearBuilt, source: "PLUTO", priority: 1 }] : []),
    ...(ll84Raw?.yearBuilt > 0 ? [{ value: ll84Raw.yearBuilt, source: "LL84", priority: 2 }] : []),
  ]);

  // Rent stabilized units (most recent year)
  let rsUnits = 0;
  if (rentStab) {
    rsUnits = rentStab.uc2024 || rentStab.uc2023 || rentStab.uc2022 || rentStab.uc2021 || 0;
  }

  // Max FAR
  const maxFAR = plutoData ? Math.max(plutoData.residFAR || 0, plutoData.commFAR || 0, plutoData.facilFAR || 0) : 0;

  // ============================================================
  // PHASE 6: Build Energy Intelligence
  // ============================================================

  let energyIntel: BuildingIntelligence["energy"] = null;
  if (ll84Raw) {
    const elecCost = Math.round(ll84Raw.electricityUse * UTILITY_RATES.electricity);
    const gasCost = Math.round(ll84Raw.naturalGasUse * UTILITY_RATES.gas);
    const waterCost = Math.round(ll84Raw.waterUse * UTILITY_RATES.water);
    const fuelCost = Math.round(ll84Raw.fuelOilUse * UTILITY_RATES.fuelOil);
    const totalUtility = elecCost + gasCost + waterCost + fuelCost;

    // LL97 compliance
    let ll97Status: "compliant" | "at_risk_2030" | "non_compliant" = "compliant";
    let ll97Penalty = 0;
    if (ll84Raw.ghgEmissions > 0 && (ll84Raw.grossFloorArea > 0 || (plutoData?.bldgArea || 0) > 0)) {
      const area = ll84Raw.grossFloorArea || plutoData?.bldgArea || 0;
      const type = (ll84Raw.primaryUse || "").toLowerCase().includes("multifamily") || (ll84Raw.primaryUse || "").toLowerCase().includes("residential")
        ? "multifamily" : "_default";
      const limits = LL97_LIMITS[type] || LL97_LIMITS._default;
      const currentPerSqft = ll84Raw.ghgEmissions / area;
      const excess2024 = Math.max(0, ll84Raw.ghgEmissions - limits.limit2024 * area);
      const excess2030 = Math.max(0, ll84Raw.ghgEmissions - limits.limit2030 * area);
      if (excess2024 > 0) { ll97Status = "non_compliant"; ll97Penalty = Math.round(excess2024 * LL97_PENALTY_PER_TON); }
      else if (excess2030 > 0) { ll97Status = "at_risk_2030"; ll97Penalty = Math.round(excess2030 * LL97_PENALTY_PER_TON); }
    }

    energyIntel = {
      energyStarGrade: ll84Raw.energyStarGrade || "",
      energyStarScore: ll84Raw.energyStarScore,
      siteEUI: ll84Raw.siteEui,
      sourceEUI: ll84Raw.sourceEui,
      electricityKwh: ll84Raw.electricityUse,
      gasTherms: ll84Raw.naturalGasUse,
      waterKgal: ll84Raw.waterUse,
      fuelOilGal: ll84Raw.fuelOilUse,
      ghgEmissions: ll84Raw.ghgEmissions,
      estimatedUtilityCost: totalUtility,
      ll97Status,
      ll97PenaltyEstimate: ll97Penalty,
      reportingYear: ll84Raw.reportingYear,
    };
  }

  // ============================================================
  // PHASE 7: Compliance Summary
  // ============================================================

  const violationSummary = {
    total: hpdViolations.length,
    open: hpdViolations.filter(v => v.currentStatus === "VIOLATION OPEN" || v.status === "Open").length,
    classA: hpdViolations.filter(v => v.class === "A").length,
    classB: hpdViolations.filter(v => v.class === "B").length,
    classC: hpdViolations.filter(v => v.class === "C").length,
  };

  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const recentComplaints = hpdComplaints.filter(c => c.receivedDate && new Date(c.receivedDate) > threeYearsAgo).length;
  const typeCounts = new Map<string, number>();
  hpdComplaints.forEach(c => {
    const type = c.type || "Unknown";
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });
  const topComplaintTypes = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const ecbPenalty = dobEcb.reduce((sum, e) => sum + (e.penaltyBalance || 0), 0);

  const litigationOpen = hpdLitigation.filter(l => l.caseStatus === "OPEN" || l.caseStatus === "Open").length;
  const harassmentFinding = hpdLitigation.some(l => l.findingOfHarassment === "YES");

  const rpieYearsMissed = rpieRecords.map((r: any) => r.fiscal_year || r.filing_year || r.year || "").filter(Boolean);

  const compliance: BuildingIntelligence["compliance"] = {
    hpdViolations: { open: violationSummary.open, total: violationSummary.total, classA: violationSummary.classA, classB: violationSummary.classB, classC: violationSummary.classC, recentViolations: hpdViolations.slice(0, 10) },
    dobViolations: { open: dobEcb.filter(e => e.status !== "RESOLVE").length, ecb: dobEcb.length, ecbPenalty },
    dobPermits: { active: dobPermits.length, recent: dobPermits.slice(0, 5) },
    rpieStatus: rpieRecords.length > 0 ? "non_compliant" : "unknown",
    rpieYearsMissed,
    ll84Status: ll84Raw ? "reported" : (plutoData?.bldgArea >= 50000 ? "not_reported" : "not_required"),
    complaints311: hpdComplaints.length,
    recentComplaints,
    topComplaintTypes,
    litigationCount: hpdLitigation.length,
    openLitigation: litigationOpen,
    harassmentFinding,
  };

  // ============================================================
  // PHASE 8: Distress Score Calculation
  // ============================================================

  const distressSignals = calculateDistressScore(compliance, energyIntel, speculation, rentStab, rollingSales, rpieRecords);

  // ============================================================
  // PHASE 9: Investment Score Calculation
  // ============================================================

  const investmentSignals = calculateInvestmentScore(plutoData, compliance, energyIntel, rentStab, rsUnits, maxFAR, null);

  // ============================================================
  // PHASE 10: Financials
  // ============================================================

  const lastSale = rollingSales.length > 0 ? {
    price: rollingSales[0].price,
    date: rollingSales[0].date,
    buyer: rollingSales[0].buyer || "",
    seller: rollingSales[0].seller || "",
    source: "Rolling Sales",
  } : null;

  // Estimate value from assessed value (NYC ratio is ~45% of market)
  const assessedTotal = plutoData?.assessTotal || 0;
  const estimatedMarketValue = assessedTotal > 0 ? Math.round(assessedTotal / 0.45) : 0;

  const financials: BuildingIntelligence["financials"] = {
    assessedValue: assessedTotal > 0 ? { value: assessedTotal, source: "PLUTO/DOF", year: 2024 } : null,
    marketValue: estimatedMarketValue > 0 ? { value: estimatedMarketValue, source: "Estimated (Assessed / 0.45)", year: 2024 } : null,
    annualTax: null,
    taxRate: null,
    lastSale,
    allSales: rollingSales,
    estimatedValue: estimatedMarketValue > 0 ? {
      low: Math.round(estimatedMarketValue * 0.85),
      mid: estimatedMarketValue,
      high: Math.round(estimatedMarketValue * 1.15),
      methodology: "Based on assessed value / NYC equalization ratio (0.45)",
    } : null,
  };

  // ============================================================
  // PHASE 11: Build Addresses
  // ============================================================

  const primaryAddress = normalizeAddress(plutoData?.address || ll84Raw?.address || "");
  const alternateAddresses: NormalizedAddress[] = [];
  if (ll84Raw?.address && plutoData?.address && ll84Raw.address !== plutoData.address) {
    alternateAddresses.push(normalizeAddress(ll84Raw.address));
  }

  // ============================================================
  // PHASE 12: Neighborhood Data (Zillow)
  // ============================================================

  let neighborhoodData: any = null;
  try {
    const regZip = hpdRegistrations?.[0]?.zip || plutoData?.zipCode;
    if (regZip) {
      const { getZillowDataForZip, getNYCAverages } = await import("./zillow-data");
      const zillowData = getZillowDataForZip(regZip);
      if (zillowData && (zillowData.currentHomeValue || zillowData.currentRent)) {
        neighborhoodData = { ...zillowData, nycAverages: getNYCAverages() };
      }
    }
  } catch {}

  // ============================================================
  // PHASE 13: Lead Verification + Apollo Enrichment
  // ============================================================

  let pdlEnrichment: any = null;
  let apolloEnrichment: any = null;
  let apolloOrgEnrichment: any = null;
  let apolloKeyPeople: any[] = [];
  let leadVerification: any = null;

  try {
    // Run enrichment + verification (imports to avoid circular deps)
    const { verifyLead } = await import("@/app/(dashboard)/market-intel/lead-verification");
    const { apolloEnrichPerson, apolloEnrichOrganization, apolloFindPeopleAtOrg } = await import("./apollo");
    const { skipTrace } = await import("@/app/(dashboard)/market-intel/tracerfy");

    const topIndividual = rankedContacts.find(r => !r.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST/) && r.name.includes(" "));
    const topCorp = rankedContacts.find(r => r.name.toUpperCase().match(/LLC|CORP|INC/));

    await Promise.all([
      // PDL if no phones
      (async () => {
        const hasPhone = rankedContacts.some(r => r.phone);
        if (!hasPhone && topIndividual) {
          try {
            const pdl = await skipTrace(topIndividual.name, plutoData?.address || "", plutoData?.borough || "", "NY", "");
            if (pdl && !pdl.error) {
              pdlEnrichment = pdl;
              if (pdl.phones?.[0]?.number) { topIndividual.phone = pdl.phones[0].number; topIndividual.source += " + PDL"; topIndividual.score = 95; }
              if (pdl.emails?.[0]) topIndividual.email = pdl.emails[0];
            }
          } catch {}
        }
      })(),
      // Apollo person + org
      (async () => {
        try {
          if (topIndividual && topIndividual.name.length > 3) {
            const result = await apolloEnrichPerson(topIndividual.name, plutoData?.borough, topCorp?.name);
            if (result) {
              apolloEnrichment = result;
              if (result.phone && !topIndividual.phone) { topIndividual.phone = result.phone; topIndividual.source += " + Apollo"; }
              if (result.email && !topIndividual.email) topIndividual.email = result.email;
            }
          }
          if (topCorp && topCorp.name.length > 3) {
            const orgResult = await apolloEnrichOrganization(topCorp.name);
            if (orgResult) {
              apolloOrgEnrichment = orgResult;
              // Only search for key people if org enrichment found a relevant match
              const keyPeople = await apolloFindPeopleAtOrg(orgResult.name);
              if (keyPeople.length > 0) apolloKeyPeople = keyPeople;
            }
          }
        } catch {}
      })(),
    ]);

    // Lead verification
    if (topIndividual && topIndividual.name.length > 3) {
      try {
        leadVerification = await verifyLead(
          topIndividual.name, topCorp?.name || null,
          plutoData?.address || "", plutoData?.borough || "",
          { pluto: plutoData, violationSummary, complaints: hpdComplaints, permits: dobPermits, hpdContacts: parsedHpdContacts, registrations: hpdRegistrations, rankedContacts, relatedCount: 0 },
        );
      } catch {}
    }
  } catch {}

  // ============================================================
  // PHASE 13.5: Brave Web Intelligence (parallel, non-blocking)
  // ============================================================

  let liveListings: BuildingIntelligence["liveListings"] = null;
  let webIntelligence: BuildingIntelligence["webIntelligence"] = null;

  try {
    const { isBraveSearchAvailable } = await import("./brave-search");
    const braveAvailable = await isBraveSearchAvailable();

    if (braveAvailable && plutoData) {
      const { searchPropertyListings, searchRentalListings } = await import("./brave-listings");
      const { fetchWebComps, buildEnhancedCompSummary } = await import("./brave-comps");
      const { quickEntityCheck } = await import("./brave-entity");

      const propertyAddress = plutoData.address || primaryAddress.raw || "";
      const ownerEntity = resolvedOwnership.entityName || plutoData.ownerName || "";

      // Run all Brave searches in parallel (non-blocking — don't slow down main pipeline)
      const [saleListings, rentalListings, webCompsResult, entityCheckResult] = await Promise.all([
        searchPropertyListings(propertyAddress, boroName).catch(() => ({ listings: [], totalFound: 0, query: "", market: "nyc" as const, searchedAt: "" })),
        searchRentalListings(propertyAddress, boroName).catch(() => []),
        fetchWebComps(propertyAddress, boroName, plutoData.zipCode, plutoData.unitsRes).catch(() => []),
        ownerEntity.length > 3 ? quickEntityCheck(ownerEntity).catch(() => null) : Promise.resolve(null),
      ]);

      // Build enhanced comp summary
      const dofComps = rollingSales.map(s => ({
        pricePerUnit: s.units > 0 ? Math.round(s.price / s.units) : 0,
        pricePerSqft: s.sqft > 0 ? Math.round(s.price / s.sqft) : 0,
      }));
      const enhancedComps = await buildEnhancedCompSummary(webCompsResult, dofComps).catch(() => null);

      if (saleListings.listings.length > 0 || rentalListings.length > 0 || webCompsResult.length > 0) {
        liveListings = {
          forSale: saleListings.listings.map(l => ({
            address: l.address,
            price: l.price,
            priceStr: l.priceStr,
            units: l.units,
            sqft: l.sqft,
            pricePerUnit: l.pricePerUnit,
            pricePerSqft: l.pricePerSqft,
            broker: l.broker,
            brokerage: l.brokerage,
            daysOnMarket: l.daysOnMarket,
            sourceUrl: l.sourceUrl,
            sourceDomain: l.sourceDomain,
            description: l.description,
          })),
          forRent: rentalListings.map(l => ({
            address: l.address,
            price: l.price,
            priceStr: l.priceStr,
            beds: l.beds,
            sourceUrl: l.sourceUrl,
            sourceDomain: l.sourceDomain,
            description: l.description,
          })),
          webComps: webCompsResult.map(c => ({
            address: c.address,
            price: c.price,
            priceStr: c.priceStr,
            units: c.units,
            pricePerUnit: c.pricePerUnit,
            sourceUrl: c.sourceUrl,
            type: c.type,
          })),
          marketTrend: enhancedComps?.marketTrend || "unknown",
          marketInsight: enhancedComps?.marketInsight || "",
        };
        dataSources.push("Brave Web Search");
        dataFreshness["Brave Web Search"] = "Live";
      }

      if (entityCheckResult && (entityCheckResult.articleCount > 0)) {
        webIntelligence = {
          entityName: ownerEntity,
          newsCount: entityCheckResult.articleCount,
          courtFilingCount: entityCheckResult.hasLawsuits ? 1 : 0,
          hasNegativeNews: entityCheckResult.hasNegativeNews,
          hasLawsuits: entityCheckResult.hasLawsuits,
          topArticles: [],
          aiSummary: undefined,
        };
        if (entityCheckResult.topIssue) {
          webIntelligence.topArticles.push({
            title: "Entity check result",
            url: "",
            domain: "",
            snippet: entityCheckResult.topIssue,
            category: entityCheckResult.hasLawsuits ? "court" : "news",
            sentiment: entityCheckResult.hasNegativeNews ? "negative" : "neutral",
          });
        }
      }
    }
  } catch (err) {
    console.warn("Brave integration skipped:", err);
  }

  // ============================================================
  // PHASE 14: Build Contacts
  // ============================================================

  const ownerContactsResolved: ResolvedContact[] = rankedContacts
    .filter(c => c.role === "Owner/Applicant" || c.role === "Individual Owner" || c.role === "Head Officer" || c.role === "Corporate Owner")
    .map(c => ({ ...c, linkedinUrl: apolloEnrichment?.linkedinUrl, title: apolloEnrichment?.title, photoUrl: apolloEnrichment?.photoUrl }));

  const agentContactsResolved: ResolvedContact[] = rankedContacts
    .filter(c => c.role === "Site Manager" || c.role === "Managing Agent")
    .map(c => ({ ...c }));

  // ============================================================
  // PHASE 15: Assemble Final Object
  // ============================================================

  const complaintSummary = { total: hpdComplaints.length, recent: recentComplaints, topTypes: topComplaintTypes };
  const ecbSummary = { total: dobEcb.length, active: dobEcb.filter(e => e.status !== "RESOLVE").length, totalPenalty: ecbPenalty };
  const litigationSummary = {
    total: hpdLitigation.length,
    open: litigationOpen,
    types: (() => {
      const tc = new Map<string, number>();
      hpdLitigation.forEach(l => { const t = l.caseType || "Unknown"; tc.set(t, (tc.get(t) || 0) + 1); });
      return Array.from(tc.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    })(),
  };

  // Overall confidence
  const overallConfidence = Math.min(100, 20 + dataSources.length * 8);

  const result: BuildingIntelligence = {
    bbl: bbl10,
    address: primaryAddress,
    alternateAddresses,

    property: {
      units: totalUnits,
      residentialUnits: resUnits,
      commercialUnits,
      yearBuilt,
      grossSqft,
      lotSqft: plutoData?.lotArea > 0 ? { value: plutoData.lotArea, source: "PLUTO", confidence: 90 } : null,
      stories: plutoData?.numFloors > 0 ? { value: plutoData.numFloors, source: "PLUTO", confidence: 90 } : null,
      buildingClass: plutoData?.bldgClass ? { value: plutoData.bldgClass, source: "PLUTO", confidence: 95 } : null,
      zoning: plutoData?.zoneDist1 ? { value: plutoData.zoneDist1, source: "PLUTO", confidence: 95 } : null,
      builtFAR: plutoData?.builtFAR > 0 ? { value: plutoData.builtFAR, source: "PLUTO", confidence: 95 } : null,
      maxFAR: maxFAR > 0 ? { value: maxFAR, source: "PLUTO", confidence: 95 } : null,
      hasElevator: null,
      rentStabilizedUnits: rsUnits > 0 ? { value: rsUnits, source: "Rent Stabilization DB", confidence: 90 } : null,
    },

    ownership: {
      likelyOwner: resolvedOwnership,
      registeredOwner: plutoData?.ownerName || "",
      hpdRegistration: parsedHpdContacts.length > 0 ? {
        owner: hpdCorpOwners[0] || hpdIndividualOwners[0] || "",
        managingAgent: agentName,
        agentPhone: "",
        agentAddress,
      } : undefined,
      llcName: resolvedOwnership.llcName || undefined,
      corporateAffiliations: [...hpdCorpOwners],
      mailingAddress: resolvedOwnership.mailingAddress || undefined,
      ownerPortfolio: [],
      confidence: resolvedOwnership.confidence,
      sources: resolvedOwnership.sources,
    },

    financials,
    energy: energyIntel,
    compliance,
    distressSignals,
    investmentSignals,
    comps: null,
    liveListings,
    webIntelligence,

    contacts: {
      ownerContacts: ownerContactsResolved,
      managingAgentContacts: agentContactsResolved,
    },

    raw: {
      pluto: plutoData,
      violations: hpdViolations,
      violationSummary,
      complaints: hpdComplaints,
      complaintSummary,
      permits: dobPermits,
      hpdContacts: parsedHpdContacts,
      registrations: hpdRegistrations,
      litigation: hpdLitigation,
      litigationSummary,
      ecbViolations: dobEcb,
      ecbSummary,
      rentStabilized: rentStab,
      speculation,
      dobFilings,
      phoneRankings,
      neighborhoodData,
      pdlEnrichment,
      apolloEnrichment,
      apolloOrgEnrichment,
      apolloKeyPeople,
      leadVerification,
      rankedContacts,
      ownerContacts,
    },

    dataSources,
    dataFreshness,
    overallConfidence,
    lastUpdated: new Date().toISOString(),
  };

  console.log(`=== DATA FUSION COMPLETE === ${dataSources.length} sources, confidence: ${overallConfidence}%, distress: ${distressSignals.score}, investment: ${investmentSignals.score}`);

  setCache(bbl10, result);
  return result;
}

// ============================================================
// Distress Score Calculation
// ============================================================

function calculateDistressScore(
  compliance: BuildingIntelligence["compliance"],
  energy: BuildingIntelligence["energy"],
  speculation: any,
  rentStab: any,
  sales: any[],
  rpieRecords: any[],
): BuildingIntelligence["distressSignals"] {
  let score = 0;
  const signals: BuildingIntelligence["distressSignals"]["signals"] = [];

  // RPIE Non-Compliant: +25
  if (compliance.rpieStatus === "non_compliant") {
    score += 25;
    signals.push({ type: "rpie_non_compliant", severity: "high", description: "RPIE non-compliant — owner not filing income/expense reports", source: "RPIE" });
  }
  // Multiple RPIE years: +10 additional
  if (compliance.rpieYearsMissed.length > 1) {
    score += 10;
    signals.push({ type: "rpie_multi_year", severity: "high", description: `${compliance.rpieYearsMissed.length} years of missed RPIE filings`, source: "RPIE" });
  }

  // HPD Class C > 5: +20
  if (compliance.hpdViolations.classC > 5) {
    score += 20;
    signals.push({ type: "high_violations", severity: "high", description: `${compliance.hpdViolations.classC} hazardous (Class C) violations`, source: "HPD" });
  } else if (compliance.hpdViolations.classC > 2) {
    score += 10;
    signals.push({ type: "moderate_violations", severity: "medium", description: `${compliance.hpdViolations.classC} hazardous (Class C) violations`, source: "HPD" });
  }

  // HPD Total Open > 20: +15
  if (compliance.hpdViolations.open > 20) {
    score += 15;
    signals.push({ type: "high_violations", severity: "high", description: `${compliance.hpdViolations.open} open HPD violations`, source: "HPD" });
  } else if (compliance.hpdViolations.open > 10) {
    score += 10;
    signals.push({ type: "moderate_violations", severity: "medium", description: `${compliance.hpdViolations.open} open HPD violations`, source: "HPD" });
  }

  // HPD Class B > 15: +10
  if (compliance.hpdViolations.classB > 15) {
    score += 10;
    signals.push({ type: "deferred_maintenance", severity: "medium", description: `${compliance.hpdViolations.classB} Class B violations (deferred maintenance)`, source: "HPD" });
  }

  // LL97 Non-Compliant: +20
  if (energy?.ll97Status === "non_compliant") {
    score += 20;
    signals.push({ type: "ll97_penalty", severity: "high", description: `LL97 non-compliant — est. $${energy.ll97PenaltyEstimate.toLocaleString()} annual penalty`, source: "LL84/LL97" });
  } else if (energy?.ll97Status === "at_risk_2030") {
    score += 10;
    signals.push({ type: "ll97_at_risk", severity: "medium", description: `LL97 at risk for 2030 — est. $${energy.ll97PenaltyEstimate.toLocaleString()} future penalty`, source: "LL84/LL97" });
  }

  // Long hold period
  if (sales.length > 0) {
    const lastSaleDate = new Date(sales[0].date);
    const yearsHeld = (Date.now() - lastSaleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsHeld > 25) {
      score += 25;
      signals.push({ type: "estate_transfer", severity: "high", description: `Property held ${Math.round(yearsHeld)} years — estate/retirement likely`, source: "Rolling Sales" });
    } else if (yearsHeld > 15) {
      score += 15;
      signals.push({ type: "long_hold", severity: "medium", description: `Property held ${Math.round(yearsHeld)} years — owner may be ready to exit`, source: "Rolling Sales" });
    }
  }

  // ECB penalties
  if (compliance.dobViolations.ecbPenalty > 10000) {
    score += 10;
    signals.push({ type: "ecb_penalties", severity: "medium", description: `$${Math.round(compliance.dobViolations.ecbPenalty).toLocaleString()} in ECB penalties`, source: "DOB ECB" });
  }

  // Energy Star Grade F: +10
  if (energy?.energyStarGrade === "F") {
    score += 10;
    signals.push({ type: "energy_poor", severity: "medium", description: "Energy Star Grade F — poor energy performance", source: "LL84" });
  } else if (energy?.energyStarGrade === "D") {
    score += 5;
    signals.push({ type: "energy_below_avg", severity: "low", description: "Energy Star Grade D — below average energy performance", source: "LL84" });
  }

  // Speculation watch list
  if (speculation?.onWatchList) {
    score += 15;
    signals.push({ type: "speculation", severity: "high", description: "On HPD Speculation Watch List", source: "HPD" });
  }

  // Litigation
  if (compliance.openLitigation > 0) {
    score += 15;
    signals.push({ type: "litigation", severity: "high", description: `${compliance.openLitigation} open HPD lawsuits`, source: "HPD Litigation" });
  }
  if (compliance.harassmentFinding) {
    score += 15;
    signals.push({ type: "harassment", severity: "high", description: "Finding of tenant harassment", source: "HPD Litigation" });
  }

  // Rent stabilization unit loss
  if (rentStab) {
    const latest = rentStab.uc2024 || rentStab.uc2023 || rentStab.uc2022;
    const earliest = rentStab.uc2007 || rentStab.uc2008;
    if (earliest > 0 && latest > 0 && latest < earliest * 0.7) {
      score += 10;
      signals.push({ type: "rsi_loss", severity: "medium", description: `Lost ${Math.round((1 - latest / earliest) * 100)}% of rent-stabilized units`, source: "Rent Stabilization" });
    }
  }

  // Many complaints
  if (compliance.recentComplaints > 15) {
    score += 10;
    signals.push({ type: "high_complaints", severity: "medium", description: `${compliance.recentComplaints} complaints in last 3 years`, source: "HPD Complaints" });
  }

  return { score: Math.min(100, score), signals };
}

// ============================================================
// Investment Score Calculation
// ============================================================

function calculateInvestmentScore(
  pluto: any,
  compliance: BuildingIntelligence["compliance"],
  energy: BuildingIntelligence["energy"],
  rentStab: any,
  rsUnits: number,
  maxFAR: number,
  comps: BuildingIntelligence["comps"],
): BuildingIntelligence["investmentSignals"] {
  let score = 0;
  const signals: BuildingIntelligence["investmentSignals"]["signals"] = [];

  if (!pluto) return { score, signals };

  // Excess FAR (development potential)
  if (maxFAR > 0 && pluto.builtFAR > 0 && pluto.builtFAR < maxFAR * 0.7) {
    const excessPct = Math.round((1 - pluto.builtFAR / maxFAR) * 100);
    score += 20;
    signals.push({ type: "excess_far", description: `${excessPct}% unused FAR — air rights / development potential`, estimatedUpside: `${excessPct}% additional buildable area` });
  }

  // Energy D/F (value-add energy retrofit)
  if (energy?.energyStarGrade === "D" || energy?.energyStarGrade === "F") {
    score += 10;
    signals.push({ type: "value_add_energy", description: `Energy Star Grade ${energy.energyStarGrade} — energy retrofit opportunity`, estimatedUpside: "Reduce utility costs 20-40% via retrofit" });
  }

  // Rent stabilized > 50% (potential preferential rent resets)
  const totalUnits = pluto.unitsTot || pluto.unitsRes || 0;
  if (rsUnits > 0 && totalUnits > 0 && rsUnits / totalUnits > 0.5) {
    score += 10;
    signals.push({ type: "rsi_opportunity", description: `${Math.round(rsUnits / totalUnits * 100)}% rent stabilized — preferential rent reset potential`, estimatedUpside: "Rents may be below legal maximum" });
  }

  // Low violation count (well maintained)
  if (compliance.hpdViolations.open < 5) {
    score += 10;
    signals.push({ type: "well_maintained", description: "Low violation count — well-maintained building", estimatedUpside: "Lower capex needed" });
  }

  // Building < 30 years old
  if (pluto.yearBuilt > 0 && new Date().getFullYear() - pluto.yearBuilt < 30) {
    score += 10;
    signals.push({ type: "newer_building", description: `Built ${pluto.yearBuilt} — newer construction, less deferred maintenance`, estimatedUpside: "Lower renovation costs" });
  }

  // Mixed-use with ground floor commercial
  if (pluto.landUse === "04" || (pluto.unitsTot > pluto.unitsRes && pluto.unitsRes > 0)) {
    score += 10;
    signals.push({ type: "mixed_use", description: "Mixed-use with commercial component", estimatedUpside: "Income diversification" });
  }

  // Comps discount
  if (comps && comps.subjectVsMarket < -15) {
    score += 15;
    signals.push({ type: "comp_discount", description: `${Math.abs(Math.round(comps.subjectVsMarket))}% below market comps`, estimatedUpside: `${Math.abs(Math.round(comps.subjectVsMarket))}% potential value gap` });
  }

  return { score: Math.min(100, score), signals };
}

// ============================================================
// Phone Ranking (ported from building-profile-actions)
// ============================================================

function rankPhones(
  rawEntries: { phone: string; name: string; isOwnerPhone: boolean; filingDate: string; source: string }[],
  hpdIndividualOwners: string[],
  hpdCorpOwners: string[],
  plutoOwner: string,
): { phone: string; score: number; reason: string; isPrimary: boolean; names: string[]; sources: string[]; filingCount: number }[] {
  if (rawEntries.length === 0) return [];

  const cleanPhone = (p: string) => p.replace(/\D/g, "").slice(-10);
  const plutoUp = plutoOwner.toUpperCase();
  const hpdIndUp = hpdIndividualOwners.map(n => n.toUpperCase());
  const hpdCorpUp = hpdCorpOwners.map(n => n.toUpperCase());

  const groups = new Map<string, typeof rawEntries>();
  for (const entry of rawEntries) {
    const clean = cleanPhone(entry.phone);
    if (clean.length < 7) continue;
    if (!groups.has(clean)) groups.set(clean, []);
    groups.get(clean)!.push(entry);
  }

  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

  const rankings: { phone: string; score: number; reason: string; isPrimary: boolean; names: string[]; sources: string[]; filingCount: number }[] = [];

  for (const [, entries] of groups) {
    let score = 50;
    const reasons: string[] = [];
    const allNames = [...new Set(entries.map(e => e.name).filter(Boolean))];
    const allSources = [...new Set(entries.map(e => e.source))];

    if (entries.some(e => e.isOwnerPhone)) { score += 20; reasons.push("Owner phone on filing"); }
    const nameMatchesInd = allNames.some(n => hpdIndUp.some(ho => { const nu = n.toUpperCase(); const last = ho.split(" ").pop() || ""; return nu === ho || (last.length > 2 && nu.includes(last)); }));
    if (nameMatchesInd) { score += 25; reasons.push("Name matches HPD registered owner"); }
    else {
      const matchesCorp = allNames.some(n => { const nu = n.toUpperCase(); return hpdCorpUp.some(co => nu.includes(co) || co.includes(nu)) || (plutoUp.length > 3 && (nu.includes(plutoUp) || plutoUp.includes(nu))); });
      if (matchesCorp) { score += 15; reasons.push("Name matches entity owner"); }
    }

    const dates = entries.map(e => e.filingDate).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const mostRecent = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    if (mostRecent && mostRecent >= twoYearsAgo) { score += 15; reasons.push("Recent filing (last 2 years)"); }
    else if (mostRecent && mostRecent >= fiveYearsAgo) { score += 10; reasons.push("Filing within last 5 years"); }

    const extra = Math.min(entries.length - 1, 3);
    if (extra > 0) { score += extra * 10; reasons.push(`Found in ${entries.length} filings`); }

    rankings.push({ phone: entries[0].phone, score: Math.min(100, score), reason: reasons.join(", "), isPrimary: false, names: allNames, sources: allSources, filingCount: entries.length });
  }

  rankings.sort((a, b) => b.score - a.score);
  if (rankings.length > 0) rankings[0].isPrimary = true;
  return rankings;
}

// ============================================================
// Ranked Contact Builder
// ============================================================

function buildRankedContacts(
  ownerContacts: { name: string; phone: string; address: string; source: string }[],
  hpdContacts: { type: string; corporateName: string; firstName: string; lastName: string; title: string; businessAddress: string; businessCity: string; businessState: string; businessZip: string }[],
  phoneRankings: { phone: string; score: number }[],
): ResolvedContact[] {
  const ranked: ResolvedContact[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  // 1. DOB contacts with phones
  ownerContacts.filter(c => c.phone).forEach(c => {
    if (!seenPhones.has(c.phone)) {
      seenPhones.add(c.phone);
      ranked.push({ name: c.name, phone: c.phone, email: "", role: "Owner/Applicant", source: c.source, score: 90, address: c.address });
    }
  });

  // 2. HPD Individual Owners / Head Officers
  hpdContacts.filter(c => c.type === "IndividualOwner" || c.type === "HeadOfficer").forEach(c => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    if (name.length > 2 && !seenNames.has(name.toUpperCase())) {
      seenNames.add(name.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({ name, phone: "", email: "", role: c.type === "HeadOfficer" ? "Head Officer" : "Individual Owner", source: "HPD Registration", score: 75, address: addr });
    }
  });

  // 3. HPD Agents / Managers
  hpdContacts.filter(c => c.type === "SiteManager" || c.type === "Agent" || c.type === "ManagingAgent").forEach(c => {
    const name = `${c.firstName} ${c.lastName}`.trim() || c.corporateName;
    if (name && name.length > 2 && !seenNames.has(name.toUpperCase())) {
      seenNames.add(name.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({ name, phone: "", email: "", role: c.type === "SiteManager" ? "Site Manager" : "Managing Agent", source: "HPD Registration", score: 65, address: addr });
    }
  });

  // 4. Corporate owners
  hpdContacts.filter(c => c.type === "CorporateOwner").forEach(c => {
    if (c.corporateName && c.corporateName.length > 2 && !seenNames.has(c.corporateName.toUpperCase())) {
      seenNames.add(c.corporateName.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({ name: c.corporateName, phone: "", email: "", role: "Corporate Owner", source: "HPD Registration", score: 55, address: addr });
    }
  });

  // 5. DOB contacts without phone
  ownerContacts.filter(c => !c.phone).forEach(c => {
    if (c.name.length > 2 && !seenNames.has(c.name.toUpperCase())) {
      seenNames.add(c.name.toUpperCase());
      ranked.push({ name: c.name, phone: "", email: "", role: "Permit Applicant", source: c.source, score: 40, address: c.address });
    }
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ============================================================
// Portfolio Discovery (exported for building profile use)
// ============================================================

export async function findOwnerPortfolio(ownerName: string, currentBBL?: string): Promise<{ bbl: string; address: string; units: number; borough: string; assessedValue: number }[]> {
  if (!ownerName || ownerName.length < 3) return [];

  const searchName = ownerName.toUpperCase().replace(/'/g, "''");
  const results = await queryNYC(DATASETS.PLUTO, `upper(ownername) LIKE '%${searchName}%'`, {
    select: "borocode,block,lot,address,borough,unitsres,assesstot,ownername,bbl",
    limit: 30,
    order: "unitsres DESC",
  });

  const portfolio = results
    .map((d: any) => {
      const bbl = d.bbl || (d.borocode + (d.block || "").padStart(5, "0") + (d.lot || "").padStart(4, "0"));
      return {
        bbl,
        address: d.address || "",
        units: parseInt(d.unitsres || "0"),
        borough: d.borough || "",
        assessedValue: parseFloat(d.assesstot || "0"),
      };
    })
    .filter((p: { bbl: string }) => !currentBBL || p.bbl !== currentBBL);

  // Fuzzy match to remove properties with different owners
  return portfolio.filter((p: any) => {
    const match = isSameEntity(ownerName, results.find((r: any) => (r.bbl || "") === p.bbl)?.ownername || "");
    return match.match;
  });
}

// ============================================================
// Smart Search Ranking
// ============================================================

export async function rankSearchResults(results: { distressScore?: number; investmentScore?: number; units?: number; marketValue?: number }[]): Promise<number[]> {
  return results.map((r, i) => {
    const d = r.distressScore || 0;
    const inv = r.investmentScore || 0;
    const u = Math.min(r.units || 0, 200) / 200;
    const v = Math.min(r.marketValue || 0, 50000000) / 50000000;
    return d * 0.4 + inv * 0.3 + u * 20 + v * 10;
  }).map((score, i) => i).sort((a, b) => {
    const sa = (results[a].distressScore || 0) * 0.4 + (results[a].investmentScore || 0) * 0.3 + Math.min(results[a].units || 0, 200) / 200 * 20 + Math.min(results[a].marketValue || 0, 50000000) / 50000000 * 10;
    const sb = (results[b].distressScore || 0) * 0.4 + (results[b].investmentScore || 0) * 0.3 + Math.min(results[b].units || 0, 200) / 200 * 20 + Math.min(results[b].marketValue || 0, 50000000) / 50000000 * 10;
    return sb - sa;
  });
}
