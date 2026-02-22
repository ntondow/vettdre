"use server";

const PUBLIC_OWNERS_LIST = [
  "NYC HOUSING AUTHORITY", "NYCHA", "NEW YORK CITY HOUSING AUTH",
  "CITY OF NEW YORK", "DEPT OF HOUSING PRESERV", "HPD",
  "NYC DEPT OF ED", "NYC DEPARTMENT OF EDUCATION", "BOARD OF EDUCATION",
  "NYC TRANSIT AUTHORITY", "MTA", "METROPOLITAN TRANS AUTH",
  "NYC HEALTH & HOSPITALS", "HEALTH & HOSP CORP",
  "DEPARTMENT OF PARKS", "PARKS & RECREATION",
  "NYC SCHOOL CONSTRUCTION", "SCHOOL CONSTRUCTION AUTH",
  "FIRE DEPT CITY OF NY", "POLICE DEPT CITY OF NY",
  "DEPT OF CITYWIDE ADMIN", "DCAS",
  "STATE OF NEW YORK", "UNITED STATES GOVERNMENT", "US GOVT",
  "NYC ECONOMIC DEVELOPMENT", "DEPT OF SANITATION",
  "DEPT OF TRANSPORTATION", "HOUSING PRESERVATION",
  "HOUSING DEVELOPMENT CORP", "DORMITORY AUTHORITY",
  "PORT AUTHORITY", "ROOSEVELT ISLAND",
];

export async function isPublicOwner(name: string): Promise<boolean> {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return PUBLIC_OWNERS_LIST.some(p => upper.includes(p)) ||
    upper.startsWith("NYC ") ||
    upper.startsWith("CITY OF ") ||
    upper.startsWith("STATE OF ") ||
    upper.startsWith("UNITED STATES") ||
    upper.includes("HOUSING AUTHORITY") ||
    upper.includes("CITY UNIVERSITY") ||
    upper.includes("STATE UNIVERSITY") ||
    /^(DEPT|DEPARTMENT) OF /.test(upper);
}

const BASE = "https://data.cityofnewyork.us/resource";
const SALES_ID = "usep-8jbt";
const VIOLATIONS_ID = "3h2n-5cm9";
const PERMITS_ID = "ic3t-wcy2";
const HPD_REGISTRATIONS = "tesw-yqqr";
const HPD_CONTACTS = "feu5-w2e2";
const PLUTO_ID = "64uk-42ks";
const ACRIS_LEGALS = "8h5j-fqxa";
const ACRIS_MASTER = "bnx9-e6tj";
const ACRIS_PARTIES = "636b-3b5g";
const NYS_ENTITY_NAMES = "ekwr-p59j";
const NYS_ENTITY_FILINGS = "63wc-4exh";
const NYS_BASE = "https://data.ny.gov/resource";

const BORO_CODE: Record<string, string> = {
  Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5",
};

// ============================================================
// ADDRESS ABBREVIATION NORMALIZATION
// ============================================================
const STREET_ABBREVS: Record<string, string> = {
  "ST": "STREET", "AVE": "AVENUE", "AV": "AVENUE", "BLVD": "BOULEVARD",
  "DR": "DRIVE", "PL": "PLACE", "CT": "COURT", "RD": "ROAD",
  "LN": "LANE", "TER": "TERRACE", "PKWY": "PARKWAY", "CIR": "CIRCLE",
  "HWY": "HIGHWAY", "SQ": "SQUARE", "EXPY": "EXPRESSWAY", "TPKE": "TURNPIKE",
  "N": "NORTH", "S": "SOUTH", "E": "EAST", "W": "WEST",
};

function normalizeAddress(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return upper.split(/\s+/).map(w => STREET_ABBREVS[w] || w).join(" ");
}

// ============================================================
// ADDRESS TYPEAHEAD — PLUTO-powered search
// ============================================================
export interface AddressSuggestion {
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  zip: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  bldgClass: string;
  ownerName: string;
  assessTotal: number;
  bldgArea: number;
  lotArea: number;
  zoneDist: string;
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  // Detect BBL format: 10-digit number (e.g., 1006340001) or B-Block-Lot (e.g., 1-634-1)
  const bblMatch = trimmed.match(/^(\d)[\s-]?(\d{1,5})[\s-]?(\d{1,4})$/);
  const bbl10 = trimmed.match(/^(\d)(\d{5})(\d{4})$/);

  if (bblMatch || bbl10) {
    const m = bblMatch || bbl10;
    const boro = m![1];
    const block = bblMatch ? m![2] : m![2];
    const lot = bblMatch ? m![3] : m![3];
    try {
      const url = new URL(`${BASE}/${PLUTO_ID}.json`);
      url.searchParams.set("$where", `borocode='${boro}' AND block='${block.replace(/^0+/, "")}' AND lot='${lot.replace(/^0+/, "")}'`);
      url.searchParams.set("$select", "address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgclass,zonedist1,borocode,block,lot,zipcode,bldgarea,lotarea");
      url.searchParams.set("$limit", "5");
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((p: any) => ({
        address: p.address || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(p.borocode)] || "",
        boroCode: p.borocode || "",
        block: p.block || "",
        lot: p.lot || "",
        zip: p.zipcode || "",
        unitsRes: parseInt(p.unitsres || "0"),
        yearBuilt: parseInt(p.yearbuilt || "0"),
        numFloors: parseInt(p.numfloors || "0"),
        bldgClass: p.bldgclass || "",
        ownerName: p.ownername || "",
        assessTotal: parseInt(p.assesstot || "0"),
        bldgArea: parseInt(p.bldgarea || "0"),
        lotArea: parseInt(p.lotarea || "0"),
        zoneDist: p.zonedist1 || "",
      }));
    } catch { return []; }
  }

  // Normal address search — normalize abbreviations
  const normalized = normalizeAddress(trimmed);
  const parts = normalized.split(/\s+/);
  const houseNum = parts[0];
  const streetPart = parts.slice(1).join(" ");

  // Build search: try house number match + street name fragment
  const conditions: string[] = [];
  if (/^\d+$/.test(houseNum) && streetPart.length > 0) {
    // User typed something like "350 PARK AVENUE"
    conditions.push(`upper(address) like '${houseNum} ${streetPart}%'`);
  } else {
    // User typed just a street name or partial
    conditions.push(`upper(address) like '%${normalized}%'`);
  }

  try {
    const url = new URL(`${BASE}/${PLUTO_ID}.json`);
    url.searchParams.set("$where", conditions.join(" AND "));
    url.searchParams.set("$select", "address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgclass,zonedist1,borocode,block,lot,zipcode,bldgarea,lotarea");
    url.searchParams.set("$limit", "12");
    url.searchParams.set("$order", "unitsres DESC");
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();

    // Deduplicate by address+borough
    const seen = new Set<string>();
    return data
      .map((p: any) => ({
        address: p.address || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(p.borocode)] || "",
        boroCode: p.borocode || "",
        block: p.block || "",
        lot: p.lot || "",
        zip: p.zipcode || "",
        unitsRes: parseInt(p.unitsres || "0"),
        yearBuilt: parseInt(p.yearbuilt || "0"),
        numFloors: parseInt(p.numfloors || "0"),
        bldgClass: p.bldgclass || "",
        ownerName: p.ownername || "",
        assessTotal: parseInt(p.assesstot || "0"),
        bldgArea: parseInt(p.bldgarea || "0"),
        lotArea: parseInt(p.lotarea || "0"),
        zoneDist: p.zonedist1 || "",
      }))
      .filter((s: AddressSuggestion) => {
        const key = `${s.address}-${s.boroCode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch {
    return [];
  }
}

// ============================================================
// PROPERTY LOOKUP BY BBL — direct block/lot query
// ============================================================
export async function lookupPropertyByBBL(boroCode: string, block: string, lot: string) {
  const borough = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(boroCode)] || "";

  // Get PLUTO data for this lot
  let pluto: any = null;
  try {
    const url = new URL(`${BASE}/${PLUTO_ID}.json`);
    url.searchParams.set("$where", `borocode='${boroCode}' AND block='${block}' AND lot='${lot}'`);
    url.searchParams.set("$limit", "1");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) pluto = data[0];
    }
  } catch {}

  const address = pluto?.address || `Block ${block}, Lot ${lot}`;
  const streetName = (pluto?.address || "").replace(/^\d+\s*/, "").toUpperCase();
  const houseNum = (pluto?.address || "").split(/\s+/)[0] || "";

  let sales: any[] = [], permits: any[] = [], violations: any[] = [];

  // SALES by borough + block/lot
  try {
    const url = new URL(`${BASE}/${SALES_ID}.json`);
    url.searchParams.set("$where", `borough='${boroCode}' AND block='${block}' AND lot='${lot}'`);
    url.searchParams.set("$order", "sale_date DESC");
    url.searchParams.set("$limit", "25");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      sales = data.filter((r: any) => parseInt((r.sale_price || "0").replace(/,/g, "")) > 1000).map((r: any) => ({
        address: r.address || "", apartmentNumber: r.apartment_number || null, neighborhood: r.neighborhood || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || "",
        buildingClass: r.building_class_category || "", salePrice: parseInt((r.sale_price || "0").replace(/,/g, "")),
        saleDate: r.sale_date || "", grossSqft: parseInt((r.gross_square_feet || "0").replace(/,/g, "")),
        landSqft: parseInt((r.land_square_feet || "0").replace(/,/g, "")), yearBuilt: parseInt(r.year_built || "0"),
        totalUnits: parseInt(r.total_units || "0"), residentialUnits: parseInt(r.residential_units || "0"),
        commercialUnits: parseInt(r.commercial_units || "0"), zipCode: r.zip_code || "", block: r.block || "", lot: r.lot || "",
      }));
    }
  } catch (err) { console.error("BBL Sales error:", err); }

  // PERMITS by address
  if (houseNum && streetName) {
    try {
      const url = new URL(`${BASE}/${PERMITS_ID}.json`);
      url.searchParams.set("$where", `house__='${houseNum}' AND upper(street_name) like '%${streetName}%'`);
      url.searchParams.set("$order", "filing_date DESC");
      url.searchParams.set("$limit", "20");
      const res = await fetch(url.toString());
      if (res.ok) {
        permits = (await res.json()).map((r: any) => ({
          jobNumber: r.job__ || "", jobType: r.job_type || "", jobDescription: r.job_description || r.job_status_descrp || "",
          filingDate: r.filing_date || r.latest_action_date || "", issuanceDate: r.issuance_date || null,
          expirationDate: r.expiration_date || null, status: r.job_status_descrp || r.job_status || "",
          ownerName: r.owner_s_last_name ? `${r.owner_s_first_name || ""} ${r.owner_s_last_name}`.trim() : (r.owner_s_business_name || null),
          estimatedCost: r.estimated_job_cost ? parseFloat(String(r.estimated_job_cost).replace(/,/g, "")) : null,
        }));
      }
    } catch (err) { console.error("BBL Permits error:", err); }
  }

  // VIOLATIONS by address
  if (houseNum && streetName) {
    try {
      const url = new URL(`${BASE}/${VIOLATIONS_ID}.json`);
      url.searchParams.set("$where", `house_number='${houseNum}' AND upper(street) like '%${streetName}%'`);
      url.searchParams.set("$order", "issue_date DESC");
      url.searchParams.set("$limit", "20");
      const res = await fetch(url.toString());
      if (res.ok) {
        violations = (await res.json()).map((r: any) => ({
          violationNumber: r.violation_number || r.isn_dob_bis_viol || "", violationType: r.violation_type || r.violation_type_code || "",
          violationCategory: r.violation_category || "", description: r.description || "", issueDate: r.issue_date || "",
          dispositionDate: r.disposition_date || null, dispositionComments: r.disposition_comments || null,
          status: r.disposition_date ? "Resolved" : "Open",
        }));
      }
    } catch (err) { console.error("BBL Violations error:", err); }
  }

  const buildingMap = new Map<string, any>();
  // Create a building entry from PLUTO if we have it
  if (pluto) {
    buildingMap.set(address, {
      address, neighborhood: "", borough, zipCode: pluto.zipcode || "",
      buildingClass: pluto.bldgclass || "", yearBuilt: parseInt(pluto.yearbuilt || "0"),
      totalUnits: parseInt(pluto.unitstotal || pluto.unitsres || "0"),
      grossSqft: parseInt(pluto.bldgarea || "0"), landSqft: parseInt(pluto.lotarea || "0"),
      block, lot, salesCount: 0, lastSalePrice: 0, lastSaleDate: "", sales: [] as any[],
    });
  }

  sales.forEach(s => {
    const key = s.address.replace(/,.*$/, "").trim() || address;
    if (!buildingMap.has(key)) {
      buildingMap.set(key, { address: key, neighborhood: s.neighborhood, borough: s.borough, zipCode: s.zipCode,
        buildingClass: s.buildingClass, yearBuilt: s.yearBuilt, totalUnits: s.totalUnits, grossSqft: s.grossSqft,
        landSqft: s.landSqft, block: s.block, lot: s.lot, salesCount: 0, lastSalePrice: 0, lastSaleDate: "", sales: [] as any[] });
    }
    const b = buildingMap.get(key)!;
    b.salesCount++; b.sales.push(s);
    if (!b.lastSaleDate || s.saleDate > b.lastSaleDate) { b.lastSalePrice = s.salePrice; b.lastSaleDate = s.saleDate; }
    if (s.yearBuilt > b.yearBuilt) b.yearBuilt = s.yearBuilt;
    if (s.totalUnits > b.totalUnits) b.totalUnits = s.totalUnits;
    if (s.grossSqft > b.grossSqft) b.grossSqft = s.grossSqft;
  });

  return { sales, permits, violations, buildings: Array.from(buildingMap.values()).sort((a, b) => b.salesCount - a.salesCount), query: { address, borough, zip: pluto?.zipcode || "" } };
}

// ============================================================
// PROPERTY SEARCH (legacy form-based)
// ============================================================
export async function lookupProperty(formData: FormData) {
  const rawAddress = (formData.get("address") as string).trim();
  const borough = formData.get("borough") as string;
  if (!rawAddress || !borough) throw new Error("Address and borough are required");

  const parts = rawAddress.split(/\s+/);
  const houseNum = parts[0];
  const streetName = parts.slice(1).join(" ").toUpperCase();
  const boroCode = BORO_CODE[borough] || "1";

  let sales: any[] = [], permits: any[] = [], violations: any[] = [];

  // SALES
  try {
    const url = new URL(`${BASE}/${SALES_ID}.json`);
    url.searchParams.set("$where", `borough='${boroCode}' AND upper(address) like '%${streetName}%'`);
    url.searchParams.set("$order", "sale_date DESC"); url.searchParams.set("$limit", "25");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      sales = data.filter((r: any) => parseInt((r.sale_price || "0").replace(/,/g, "")) > 1000).map((r: any) => ({
        address: r.address || "", apartmentNumber: r.apartment_number || null, neighborhood: r.neighborhood || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || "",
        buildingClass: r.building_class_category || "", salePrice: parseInt((r.sale_price || "0").replace(/,/g, "")),
        saleDate: r.sale_date || "", grossSqft: parseInt((r.gross_square_feet || "0").replace(/,/g, "")),
        landSqft: parseInt((r.land_square_feet || "0").replace(/,/g, "")), yearBuilt: parseInt(r.year_built || "0"),
        totalUnits: parseInt(r.total_units || "0"), residentialUnits: parseInt(r.residential_units || "0"),
        commercialUnits: parseInt(r.commercial_units || "0"), zipCode: r.zip_code || "", block: r.block || "", lot: r.lot || "",
      }));
    }
  } catch (err) { console.error("Sales error:", err); }

  // PERMITS
  try {
    const url = new URL(`${BASE}/${PERMITS_ID}.json`);
    url.searchParams.set("$where", `house__='${houseNum}' AND upper(street_name) like '%${streetName}%'`);
    url.searchParams.set("$order", "filing_date DESC"); url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      permits = (await res.json()).map((r: any) => ({
        jobNumber: r.job__ || "", jobType: r.job_type || "", jobDescription: r.job_description || r.job_status_descrp || "",
        filingDate: r.filing_date || r.latest_action_date || "", issuanceDate: r.issuance_date || null,
        expirationDate: r.expiration_date || null, status: r.job_status_descrp || r.job_status || "",
        ownerName: r.owner_s_last_name ? `${r.owner_s_first_name || ""} ${r.owner_s_last_name}`.trim() : (r.owner_s_business_name || null),
        estimatedCost: r.estimated_job_cost ? parseFloat(String(r.estimated_job_cost).replace(/,/g, "")) : null,
      }));
    }
  } catch (err) { console.error("Permits error:", err); }

  // VIOLATIONS
  try {
    const url = new URL(`${BASE}/${VIOLATIONS_ID}.json`);
    url.searchParams.set("$where", `house_number='${houseNum}' AND upper(street) like '%${streetName}%'`);
    url.searchParams.set("$order", "issue_date DESC"); url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      violations = (await res.json()).map((r: any) => ({
        violationNumber: r.violation_number || r.isn_dob_bis_viol || "", violationType: r.violation_type || r.violation_type_code || "",
        violationCategory: r.violation_category || "", description: r.description || "", issueDate: r.issue_date || "",
        dispositionDate: r.disposition_date || null, dispositionComments: r.disposition_comments || null,
        status: r.disposition_date ? "Resolved" : "Open",
      }));
    }
  } catch (err) { console.error("Violations error:", err); }

  const buildingMap = new Map<string, any>();
  sales.forEach(s => {
    const key = s.address.replace(/,.*$/, "").trim();
    if (!buildingMap.has(key)) {
      buildingMap.set(key, { address: key, neighborhood: s.neighborhood, borough: s.borough, zipCode: s.zipCode,
        buildingClass: s.buildingClass, yearBuilt: s.yearBuilt, totalUnits: s.totalUnits, grossSqft: s.grossSqft,
        landSqft: s.landSqft, block: s.block, lot: s.lot, salesCount: 0, lastSalePrice: 0, lastSaleDate: "", sales: [] as any[] });
    }
    const b = buildingMap.get(key)!;
    b.salesCount++; b.sales.push(s);
    if (!b.lastSaleDate || s.saleDate > b.lastSaleDate) { b.lastSalePrice = s.salePrice; b.lastSaleDate = s.saleDate; }
    if (s.yearBuilt > b.yearBuilt) b.yearBuilt = s.yearBuilt;
    if (s.totalUnits > b.totalUnits) b.totalUnits = s.totalUnits;
    if (s.grossSqft > b.grossSqft) b.grossSqft = s.grossSqft;
  });

  return { sales, permits, violations, buildings: Array.from(buildingMap.values()).sort((a, b) => b.salesCount - a.salesCount), query: { address: rawAddress, borough, zip: "" } };
}

// ============================================================
// OWNERSHIP / LANDLORD SEARCH
// ============================================================
export async function searchOwnership(formData: FormData) {
  const borough = formData.get("borough") as string;
  const zip = (formData.get("zip") as string)?.trim();
  const streetName = (formData.get("street") as string)?.trim().toUpperCase();
  const minUnits = parseInt((formData.get("minUnits") as string) || "0");
  const ownerName = (formData.get("ownerName") as string)?.trim().toUpperCase();
  const houseNumber = (formData.get("houseNumber") as string)?.trim();

  if (!borough && !zip && !ownerName) throw new Error("Please provide at least a borough, ZIP code, or owner name");

  const boroCode = BORO_CODE[borough] || "";

  console.log("=== OWNERSHIP SEARCH ===");
  console.log("Borough:", borough, "| ZIP:", zip, "| Street:", streetName, "| Min units:", minUnits, "| Owner:", ownerName);

  let registrations: any[] = [];
  let contacts: any[] = [];

  // --- If searching by owner name, start with contacts ---
  if (ownerName) {
    try {
      const url = new URL(`${BASE}/${HPD_CONTACTS}.json`);
      url.searchParams.set("$where", `upper(corporationname) like '%${ownerName}%' OR upper(lastname) like '%${ownerName}%'`);
      url.searchParams.set("$limit", "100");
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        contacts = data.map((r: any) => ({
          registrationId: r.registrationid || "", type: r.type || "", contactDescription: r.contactdescription || "",
          corporateName: r.corporationname || "", firstName: r.firstname || "", lastName: r.lastname || "",
          businessAddress: [r.businesshousenumber, r.businessstreetname, r.businessapartment].filter(Boolean).join(" ").trim(),
          businessCity: r.businesscity || "", businessState: r.businessstate || "", businessZip: r.businesszip || "",
        }));

        // Now get registrations for these contacts
        const regIds = [...new Set(contacts.map(c => c.registrationId).filter(Boolean))];
        if (regIds.length > 0) {
          const regUrl = new URL(`${BASE}/${HPD_REGISTRATIONS}.json`);
          regUrl.searchParams.set("$where", `registrationid in(${regIds.slice(0, 50).map(id => `'${id}'`).join(",")})`);
          regUrl.searchParams.set("$limit", "200");
          const regRes = await fetch(regUrl.toString());
          if (regRes.ok) registrations = await regRes.json();
        }
      }
    } catch (err) { console.error("Owner search error:", err); }

  } else {
    // --- Search by location ---
    try {
      const url = new URL(`${BASE}/${HPD_REGISTRATIONS}.json`);
      const conditions: string[] = [];
      if (zip) conditions.push(`zip='${zip}'`);
      if (streetName) conditions.push(`upper(streetname) like '%${streetName}%'`);
      if (boroCode && !zip) conditions.push(`boroid='${boroCode}'`);

      if (houseNumber) conditions.push(`housenumber='${houseNumber}'`);
      if (conditions.length === 0) throw new Error("Need at least one search field");
      url.searchParams.set("$where", conditions.join(" AND "));
      url.searchParams.set("$limit", "200");
      url.searchParams.set("$order", "registrationenddate DESC");

      console.log("HPD Reg URL:", url.toString());
      const res = await fetch(url.toString());
      if (res.ok) {
        registrations = await res.json();
        console.log("HPD Reg count:", registrations.length);
      }
    } catch (err) { console.error("HPD Reg error:", err); }

    // Get contacts for these registrations
    const regIds = registrations.slice(0, 50).map((r: any) => r.registrationid).filter(Boolean);
    if (regIds.length > 0) {
      try {
        const url = new URL(`${BASE}/${HPD_CONTACTS}.json`);
        url.searchParams.set("$where", `registrationid in(${regIds.map(id => `'${id}'`).join(",")})`);
        url.searchParams.set("$limit", "500");
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          contacts = data.map((r: any) => ({
            registrationId: r.registrationid || "", type: r.type || "", contactDescription: r.contactdescription || "",
            corporateName: r.corporationname || "", firstName: r.firstname || "", lastName: r.lastname || "",
            businessAddress: [r.businesshousenumber, r.businessstreetname, r.businessapartment].filter(Boolean).join(" ").trim(),
            businessCity: r.businesscity || "", businessState: r.businessstate || "", businessZip: r.businesszip || "",
          }));
        }
      } catch (err) { console.error("HPD Contacts error:", err); }
    }
  }

  // --- Enrich with PLUTO data for unit counts, year built, etc. ---
  // Get block/lot combos from registrations to look up in PLUTO
  const blockLots = registrations.slice(0, 30).map((r: any) => ({ block: r.block, lot: r.lot, boro: r.boroid })).filter(bl => bl.block && bl.lot);
  let plutoData = new Map<string, any>();

  if (blockLots.length > 0) {
    try {
      // Batch query PLUTO by block+lot
      const boroId = blockLots[0].boro || boroCode;
      const blockLotConditions = blockLots.map(bl => `(block='${bl.block}' AND lot='${bl.lot}')`).join(" OR ");
      const url = new URL(`${BASE}/${PLUTO_ID}.json`);
      url.searchParams.set("$where", `borocode='${boroId}' AND (${blockLotConditions})`);
      url.searchParams.set("$limit", "100");

      console.log("PLUTO URL:", url.toString());
      const res = await fetch(url.toString());
      console.log("PLUTO status:", res.status);

      if (res.ok) {
        const data = await res.json();
        console.log("PLUTO count:", data.length);
        if (data.length > 0) console.log("PLUTO fields:", Object.keys(data[0]).slice(0, 25).join(", "));
        data.forEach((p: any) => {
          const key = `${p.block}-${p.lot}`;
          plutoData.set(key, {
            unitsRes: parseInt(p.unitsres || "0"),
            unitsTotal: parseInt(p.unitstotal || "0"),
            yearBuilt: parseInt(p.yearbuilt || "0"),
            numFloors: parseInt(p.numfloors || "0"),
            buildingClass: p.bldgclass || "",
            landUse: p.landuse || "",
            ownerName: p.ownername || "",
            lotArea: parseInt(p.lotarea || "0"),
            bldgArea: parseInt(p.bldgarea || "0"),
            address: p.address || "",
            zoneDist: p.zonedist1 || "",
            assessTotal: parseInt(p.assesstot || "0"),
          });
        });
      } else {
        console.log("PLUTO error:", (await res.text()).substring(0, 200));
      }
    } catch (err) { console.error("PLUTO error:", err); }
  }

  // --- Build final building list ---
  const buildings = registrations.map((r: any) => {
    const regId = r.registrationid;
    const plutoKey = `${r.block}-${r.lot}`;
    const pluto = plutoData.get(plutoKey);
    const owners = contacts.filter(c => c.registrationId === regId);

    return {
      registrationId: regId,
      address: r.housenumber ? `${r.housenumber} ${r.streetname || ""}`.trim() : (pluto?.address || `Block ${r.block}, Lot ${r.lot}`),
      zip: r.zip || "",
      block: r.block || "",
      lot: r.lot || "",
      bin: r.bin || "",
      boro: r.boro || "",
      lastRegistration: r.registrationenddate || r.lastregistrationdate || "",
      // PLUTO enrichment
      totalUnits: pluto?.unitsTotal || pluto?.unitsRes || 0,
      residentialUnits: pluto?.unitsRes || 0,
      yearBuilt: pluto?.yearBuilt || 0,
      numFloors: pluto?.numFloors || 0,
      buildingClass: pluto?.buildingClass || "",
      landUse: pluto?.landUse || "",
      ownerNamePluto: pluto?.ownerName || "",
      lotArea: pluto?.lotArea || 0,
      bldgArea: pluto?.bldgArea || 0,
      zoneDist: pluto?.zoneDist || "",
      assessedValue: pluto?.assessTotal || 0,
      // Contacts
      owners,
    };
  })
  .filter(b => minUnits === 0 || b.totalUnits >= minUnits)
  .sort((a, b) => b.totalUnits - a.totalUnits);

  console.log(`=== OWNERSHIP RESULTS: ${buildings.length} buildings (after filter), ${contacts.length} contacts ===`);
  return { buildings, totalRegistrations: registrations.length, totalContacts: contacts.length };
}


// ============================================================
// ACRIS LOOKUP - Deeds, Mortgages, Party Names
// ============================================================
export async function lookupACRIS(borough: string, block: string, lot: string) {
  const boroCode = BORO_CODE[borough] || borough;
  console.log("=== ACRIS LOOKUP === Borough:", boroCode, "Block:", block, "Lot:", lot);

  // Step 1: Find all document IDs for this property
  let docIds: string[] = [];
  let legals: any[] = [];
  try {
    const url = new URL(BASE + "/" + ACRIS_LEGALS + ".json");
    const acrisBoroMap: Record<string, string> = {"MANHATTAN":"1","BRONX":"2","BROOKLYN":"3","QUEENS":"4","STATEN ISLAND":"5","1":"1","2":"2","3":"3","4":"4","5":"5"};
    const acrisBoro = acrisBoroMap[boroCode.toUpperCase()] || boroCode;
    url.searchParams.set("$where", "borough='" + acrisBoro + "' AND block='" + block + "' AND lot='" + lot + "'");
    url.searchParams.set("$limit", "50");
    url.searchParams.set("$order", "good_through_date DESC");
    console.log("ACRIS Legals URL:", url.toString());
    const res = await fetch(url.toString());
    if (res.ok) {
      legals = await res.json();
      docIds = [...new Set(legals.map((l: any) => l.document_id))];
      console.log("ACRIS Legals count:", legals.length, "Unique docs:", docIds.length);
    }
  } catch (err) { console.error("ACRIS Legals error:", err); }

  if (docIds.length === 0) return { documents: [], parties: [] };

  // Step 2: Get document details (type, amount, date)
  let documents: any[] = [];
  try {
    const docList = docIds.slice(0, 30).map(id => "'" + id + "'").join(",");
    const url = new URL(BASE + "/" + ACRIS_MASTER + ".json");
    url.searchParams.set("$where", "document_id in(" + docList + ")");
    url.searchParams.set("$limit", "100");
    url.searchParams.set("$order", "recorded_datetime DESC");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      console.log("ACRIS Master count:", data.length);
      documents = data.map((d: any) => ({
        documentId: d.document_id,
        docType: d.doc_type || "",
        documentDate: d.document_date || "",
        recordedDate: d.recorded_datetime || "",
        amount: parseInt(d.document_amt || "0"),
        borough: d.recorded_borough || "",
        percentTrans: d.percent_trans || "",
      }));
    }
  } catch (err) { console.error("ACRIS Master error:", err); }

  // Step 3: Get all party names for these documents
  let parties: any[] = [];
  try {
    const docList = docIds.slice(0, 30).map(id => "'" + id + "'").join(",");
    const url = new URL(BASE + "/" + ACRIS_PARTIES + ".json");
    url.searchParams.set("$where", "document_id in(" + docList + ")");
    url.searchParams.set("$limit", "200");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      console.log("ACRIS Parties count:", data.length);
      parties = data.map((p: any) => ({
        documentId: p.document_id,
        partyType: p.party_type === "1" ? "Buyer/Grantee" : p.party_type === "2" ? "Seller/Grantor" : "Other",
        name: p.name || "",
        address1: p.address_1 || "",
        address2: p.address_2 || "",
        city: p.city || "",
        state: p.state || "",
        zip: p.zip || "",
      }));
    }
  } catch (err) { console.error("ACRIS Parties error:", err); }

  // Merge documents with their parties
  const merged = documents.map(doc => ({
    ...doc,
    parties: parties.filter(p => p.documentId === doc.documentId),
    streetAddress: legals.find((l: any) => l.document_id === doc.documentId)?.street_number
      ? legals.find((l: any) => l.document_id === doc.documentId).street_number + " " + (legals.find((l: any) => l.document_id === doc.documentId).street_name || "")
      : "",
  }));

  console.log("=== ACRIS RESULTS:", merged.length, "documents with", parties.length, "parties ===");
  return { documents: merged, parties };
}


// ============================================================
// NYS SECRETARY OF STATE - LLC/ENTITY LOOKUP
// ============================================================
export async function lookupEntity(entityName: string) {
  const raw = entityName.trim().toUpperCase();
  const name = raw.replace(/[,.'"’]/g, "").replace(/\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|PARTNERSHIP)\b/g, "").replace(/\s+/g, " ").trim();
  console.log("=== NYS ENTITY LOOKUP ===", name);

  let entities: any[] = [];
  let filings: any[] = [];

  // Step 1: Search by entity name
  try {
    const url = new URL(NYS_BASE + "/" + NYS_ENTITY_NAMES + ".json");
    url.searchParams.set("$where", "upper(corp_name) like '%" + name + "%'");
    url.searchParams.set("$limit", "20");
    url.searchParams.set("$order", "date_filed DESC");
    console.log("NYS Names URL:", url.toString());
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      console.log("NYS Names count:", data.length);
      entities = data.map((r: any) => ({
        corpId: r.corpid_num || "",
        filmNum: r.film_num || "",
        dateFiled: r.date_filed || "",
        nameType: r.name_type === "A" ? "Active Name" : r.name_type === "F" ? "Former Name" : r.name_type || "",
        nameStatus: r.name_status === "A" ? "Active" : r.name_status === "I" ? "Inactive" : r.name_status || "",
        corpName: r.corp_name || "",
      }));
    }
  } catch (err) { console.error("NYS Names error:", err); }

  // Step 2: Get filing details for found entities
  const filmNums = [...new Set(entities.map(e => e.filmNum).filter(Boolean))];
  if (filmNums.length > 0) {
    try {
      const filmList = filmNums.slice(0, 20).map(f => "'" + f + "'").join(",");
      const url = new URL(NYS_BASE + "/" + NYS_ENTITY_FILINGS + ".json");
      url.searchParams.set("$where", "film_num in(" + filmList + ")");
      url.searchParams.set("$limit", "50");
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        console.log("NYS Filings count:", data.length);
        filings = data.map((r: any) => ({
          filmNum: r.film_num || "",
          dateFiled: r.date_filed || "",
          approvedDate: r.approved_date || "",
          effDate: r.eff_date || "",
          entityType: r.entitytype || "",
          documentType: r.documenttype || "",
          county: r.county || "",
          jurisdiction: r.jurisdiction || "",
        }));
      }
    } catch (err) { console.error("NYS Filings error:", err); }
  }

  // Step 3: Also search for entities that might be related
  // (e.g., search for just the address part of an LLC name like "143 N 11" from "143 N11 LLC")
  const words = name.replace(/\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|PARTNERSHIP|REALTY|PROPERTIES|MANAGEMENT|HOLDINGS|GROUP|ENTERPRISES|ASSOCIATES)\b/g, "").trim();

  let relatedEntities: any[] = [];
  if (words.length > 3 && words !== name) {
    try {
      const url = new URL(NYS_BASE + "/" + NYS_ENTITY_NAMES + ".json");
      url.searchParams.set("$where", "upper(corp_name) like '%" + words + "%'");
      url.searchParams.set("$limit", "10");
      url.searchParams.set("$order", "date_filed DESC");
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        relatedEntities = data
          .filter((r: any) => r.corp_name !== name)
          .map((r: any) => ({
            corpId: r.corpid_num || "",
            corpName: r.corp_name || "",
            nameStatus: r.name_status === "A" ? "Active" : "Inactive",
            dateFiled: r.date_filed || "",
          }));
      }
    } catch (err) {}
  }

  // Merge entities with their filings
  const merged = entities.map(e => ({
    ...e,
    filings: filings.filter(f => f.filmNum === e.filmNum),
  }));

  // Group by corpId to show unique entities
  const corpMap = new Map();
  merged.forEach(e => {
    const key = e.corpId || e.filmNum;
    if (!corpMap.has(key)) {
      corpMap.set(key, {
        corpId: e.corpId,
        corpName: e.corpName,
        nameStatus: e.nameStatus,
        dateFiled: e.dateFiled,
        entityType: e.filings[0]?.entityType || "",
        documentType: e.filings[0]?.documentType || "",
        county: e.filings[0]?.county || "",
        allFilings: [],
      });
    }
    corpMap.get(key).allFilings.push(...e.filings);
  });

  const results = Array.from(corpMap.values());
  console.log("=== NYS ENTITY RESULTS:", results.length, "entities,", relatedEntities.length, "related ===");

  return { entities: results, relatedEntities };
}

// ============================================================
// NAME / ENTITY SEARCH — Find all properties tied to a name
// ============================================================
export async function searchByName(name: string) {
  const searchName = name.trim().toUpperCase();
  console.log("=== NAME SEARCH ===", searchName);

  let properties: any[] = [];

  // Search ACRIS parties for this name
  try {
    const url = new URL(BASE + "/" + ACRIS_PARTIES + ".json");
    url.searchParams.set("$where", "upper(name) like '%" + searchName + "%'");
    url.searchParams.set("$limit", "100");
    const res = await fetch(url.toString());
    if (res.ok) {
      const parties = await res.json();
      console.log("ACRIS parties found:", parties.length);

      // Get document IDs
      const docIds = [...new Set(parties.map((p: any) => p.document_id))] as string[];

      if (docIds.length > 0) {
        // Get legals to find block/l for each document
        const docList = docIds.slice(0, 40).map((id: string) => "'" + id + "'").join(",");
        const legUrl = new URL(BASE + "/" + ACRIS_LEGALS + ".json");
        legUrl.searchParams.set("$where", "document_id in(" + docList + ")");
        legUrl.searchParams.set("$limit", "200");
        const legRes = await fetch(legUrl.toString());

        if (legRes.ok) {
          const legals = await legRes.json();

          // Get master docs for amounts/dates
          const masterUrl = new URL(BASE + "/" + ACRIS_MASTER + ".json");
          masterUrl.searchParams.set("$where", "document_id in(" + docList + ")");
          masterUrl.searchParams.set("$limit", "200");
          masterUrl.searchParams.set("$order", "recorded_datetime DESC");
          const masterRes = await fetch(masterUrl.toString());
          const masters = masterRes.ok ? await masterRes.json() : [];

          // Build property list
          const propMap = new Map();
          legals.forEach((l: any) => {
            const key = l.borough + "-" + l.block + "-" + l.lot;
            const master = masters.find((m: any) => m.document_id === l.document_id);
            const party = parties.find((p: any) => p.document_id === l.document_id);

            if (!propMap.has(key)) {
              propMap.set(key, {
                borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(l.borough)] || l.borough,
                boroCode: l.borough,
                block: l.block,
                lot: l.lot,
                address: l.street_number ? l.street_number + " " + (l.street_name || "") : "",
                unit: l.unit || null,
                documents: [],
              });
            }
            propMap.get(key).documents.push({
              documentId: l.document_id,
              docType: master?.doc_type || "",
              amount: parseInt(master?.document_amt || "0"),
              recordedDate: master?.recorded_datetime || "",
              role: party?.party_type === "1" ? "Grantee" : "Grantor",
              name: party?.name || "",
            });
          });

          properties = Array.from(propMap.values());
          // Sort by most recent transaction
          properties.sort((a: any, b: any) => {
            const aDate = Math.max(...a.documents.map((d: any) => new Date(d.recordedDate || 0).getTime()));
            const bDate = Math.max(...b.documents.map((d: any) => new Date(d.recordedDate || 0).getTime()));
            return bDate - aDate;
          });
        }
      }
    }
  } catch (err) { console.error("Name search ACRIS error:", err); }

  // Also search HPD contacts
  let hpdProperties: any[] = [];
  try {
    const url = new URL(BASE + "/" + HPD_CONTACTS + ".json");
    url.searchParams.set("$where", "upper(corporationname) like '%" + searchName + "%' OR upper(lastname) like '%" + searchName + "%'");
    url.searchParams.set("$limit", "50");
    const res = await fetch(url.toString());
    if (res.ok) {
      const contacts = await res.json();
      const regIds = [...new Set(contacts.map((c: any) => c.registrationid))] as string[];

      if (regIds.length > 0) {
        const regList = regIds.slice(0, 30).map((id: string) => "'" + id + "'").join(",");
        const regUrl = new URL(BASE + "/" + HPD_REGISTRATIONS + ".json");
        regUrl.searchParams.set("$where", "registrationid in(" + regList + ")");
        regUrl.searchParams.set("$limit", "100");
        const regRes = await fetch(regUrl.toString());
        if (regRes.ok) {
          const regs = await regRes.json();
          hpdProperties = regs.map((r: any) => ({
            borough: r.boro || "",
            boroCode: r.boroid || "",
            block: r.block || "",
            lot: r.lot || "",
            address: r.housenumber ? r.housenumber + " " + (r.streetname || "") : "",
            zip: r.zip || "",
            source: "HPD",
            registrationId: r.registrationid,
          }));
        }
      }
    }
  } catch (err) { console.error("Name search HPD error:", err); }

  // Merge: add HPD properties that aren't already in ACRIS results
  hpdProperties.forEach((hp: any) => {
    const key = hp.boroCode + "-" + hp.block + "-" + hp.lot;
    const existing = properties.find((p: any) => p.boroCode + "-" + p.block + "-" + p.lot === key);
    if (!existing) {
      properties.push({
        ...hp,
        documents: [{ docType: "HPD REG", role: "Registered Owner", recordedDate: "", name: searchName }],
      });
    }
  });

  // Enrich with PLUTO for full addresses and building data
  if (properties.length > 0) {
    try {
      const boroGroups = new Map();
      properties.forEach((p) => {
        const boro = p.boroCode || "3";
        if (!boroGroups.has(boro)) boroGroups.set(boro, []);
        boroGroups.get(boro).push(p);
      });

      const plutoPromises = Array.from(boroGroups.entries()).map(async ([boro, props]: [string, any[]]) => {
        const conditions = props.slice(0, 25).map((p: any) => "(block='" + p.block + "' AND lot='" + p.lot + "')").join(" OR ");
        try {
          const url = new URL(BASE + "/64uk-42ks.json");
          url.searchParams.set("$where", "borocode='" + boro + "' AND (" + conditions + ")");
          url.searchParams.set("$select", "block,lot,address,ownername,unitsres,yearbuilt,assesstot");
          url.searchParams.set("$limit", "50");
          const res = await fetch(url.toString());
          if (res.ok) {
            const plutoData = await res.json();
            plutoData.forEach((pl: any) => {
              const match = props.find((p: any) => p.block === pl.block && p.lot === pl.lot);
              if (match) {
                if (pl.address && (!match.address || match.address.trim().length < 5)) match.address = pl.address;
                match.ownerName = pl.ownername || "";
                match.units = parseInt(pl.unitsres || "0");
                match.yearBuilt = parseInt(pl.yearbuilt || "0");
                match.assessedValue = parseInt(pl.assesstot || "0");
              }
            });
          }
        } catch {}
      });
      await Promise.all(plutoPromises);
    } catch {}
  }

  console.log("=== NAME SEARCH RESULTS:", properties.length, "properties ===");
  return { properties, searchName };
}
