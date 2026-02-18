"use server";

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

const BORO_CODE: Record<string, string> = {
  Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5",
};

// ============================================================
// PROPERTY SEARCH
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
    url.searchParams.set("$where", "borough='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
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
