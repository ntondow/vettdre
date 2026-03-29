"use server";

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const NYS_BASE = "https://data.ny.gov/resource";

const ACRIS_LEGALS = "8h5j-fqxa";
const ACRIS_MASTER = "bnx9-e6tj";
const ACRIS_PARTIES = "636b-3b5g";
const NYS_ENTITY_NAMES = "ekwr-p59j";

interface OwnerCandidate {
  name: string;
  confidence: number;
  signals: { source: string; role: string; date: string; detail?: string }[];
  contactInfo: { type: string; value: string; source: string }[];
  isEntity: boolean;
  linkedEntities: string[];
  recommendation: string;
}

// Borough name to ACRIS code
const BORO_MAP: Record<string, string> = {
  MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5",
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
};

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[,.'"\u2019]/g, "").replace(/\s+/g, " ").trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check reversed name "SMITH JOHN" vs "JOHN SMITH"
  const aParts = na.split(" ");
  const bParts = nb.split(" ");
  if (aParts.length === 2 && bParts.length === 2) {
    if (aParts[0] === bParts[1] && aParts[1] === bParts[0]) return true;
  }
  return false;
}

function isLLCOrCorp(name: string): boolean {
  return /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|PARTNERSHIP|TRUST|ASSOC|ASSOCIATES)\b/i.test(name);
}

export async function enrichBuilding(building: {
  block: string;
  lot: string;
  boro: string;
  address: string;
  ownerNamePluto?: string;
  owners?: any[];
  totalUnits?: number;
  yearBuilt?: number;
  assessedValue?: number;
}) {
  const { block, lot, boro, address } = building;
  const boroCode = BORO_MAP[boro?.toUpperCase()] || boro || "3";

  console.log("=== ENRICHMENT START ===", address, "Block:", block, "Lot:", lot, "Boro:", boroCode);

  // ============================================================
  // PARALLEL FETCH: ACRIS + NYS Entity for known owner names
  // ============================================================

  // Collect all known names from HPD/PLUTO
  const knownNames: string[] = [];
  if (building.ownerNamePluto) knownNames.push(building.ownerNamePluto);
  if (building.owners) {
    building.owners.forEach((o: any) => {
      if (o.corporateName) knownNames.push(o.corporateName);
      const fullName = [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
      if (fullName) knownNames.push(fullName);
    });
  }

  // ACRIS: Get all documents for this block/lot
  let acrisDocs: any[] = [];
  let acrisParties: any[] = [];

  const acrisPromise = (async () => {
    if (!block || !lot) return;
    try {
      // Step 1: Legals
      const legUrl = new URL(NYC_BASE + "/" + ACRIS_LEGALS + ".json");
      legUrl.searchParams.set("$where", "borough='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      legUrl.searchParams.set("$limit", "50");
      const legRes = await fetch(legUrl.toString());
      if (!legRes.ok) return;
      const legals = await legRes.json();
      const docIds = [...new Set(legals.map((l: any) => l.document_id))] as string[];
      if (docIds.length === 0) return;

      // Step 2+3: Master + Parties in parallel
      const docList = docIds.slice(0, 30).map((id: string) => "'" + id + "'").join(",");

      const [masterRes, partiesRes] = await Promise.all([
        fetch((() => { const u = new URL(NYC_BASE + "/" + ACRIS_MASTER + ".json"); u.searchParams.set("$where", "document_id in(" + docList + ")"); u.searchParams.set("$limit", "100"); u.searchParams.set("$order", "recorded_datetime DESC"); return u.toString(); })()),
        fetch((() => { const u = new URL(NYC_BASE + "/" + ACRIS_PARTIES + ".json"); u.searchParams.set("$where", "document_id in(" + docList + ")"); u.searchParams.set("$limit", "200"); return u.toString(); })()),
      ]);

      if (masterRes.ok) {
        acrisDocs = (await masterRes.json()).map((d: any) => ({
          documentId: d.document_id, docType: d.doc_type || "", amount: parseInt(d.document_amt || "0"),
          recordedDate: d.recorded_datetime || "", documentDate: d.document_date || "",
        }));
      }
      if (partiesRes.ok) {
        acrisParties = (await partiesRes.json()).map((p: any) => ({
          documentId: p.document_id,
          partyType: p.party_type === "1" ? "Grantee" : p.party_type === "2" ? "Grantor" : "Other",
          name: p.name || "",
          address1: p.address_1 || "", address2: p.address_2 || "",
          city: p.city || "", state: p.state || "", zip: p.zip || "",
        }));
      }
      console.log("ACRIS:", acrisDocs.length, "docs,", acrisParties.length, "parties");
    } catch (err) { console.error("ACRIS enrichment error:", err); }
  })();

  // NYS Entity: Look up any LLC/Corp names
  const entityNames = knownNames.filter(n => isLLCOrCorp(n));
  let nysEntities: any[] = [];

  const nysPromise = (async () => {
    for (const entityName of entityNames.slice(0, 3)) {
      try {
        const clean = normalizeName(entityName).replace(/\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|PARTNERSHIP)\b/g, "").replace(/\s+/g, " ").trim();
        if (clean.length < 3) continue;
        const url = new URL(NYS_BASE + "/" + NYS_ENTITY_NAMES + ".json");
        url.searchParams.set("$where", "upper(corp_name) like '%" + clean + "%'");
        url.searchParams.set("$limit", "10");
        url.searchParams.set("$order", "date_filed DESC");
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          nysEntities.push(...data.map((r: any) => ({
            corpId: r.corpid_num || "", corpName: r.corp_name || "",
            nameStatus: r.name_status === "A" ? "Active" : "Inactive",
            dateFiled: r.date_filed || "",
          })));
        }
      } catch {}
    }
    console.log("NYS:", nysEntities.length, "entities");
  })();

  // Wait for all fetches
  await Promise.all([acrisPromise, nysPromise]);

  // ============================================================
  // AI SCORING: Build candidate owner profiles
  // ============================================================
  const candidateMap = new Map<string, OwnerCandidate>();

  function getOrCreate(name: string): OwnerCandidate {
    const normalized = normalizeName(name);
    // Check if we already have a match
    for (const [key, candidate] of candidateMap) {
      if (namesMatch(key, normalized)) return candidate;
    }
    const candidate: OwnerCandidate = {
      name: normalized, confidence: 0, signals: [], contactInfo: [],
      isEntity: isLLCOrCorp(name), linkedEntities: [], recommendation: "",
    };
    candidateMap.set(normalized, candidate);
    return candidate;
  }

  // Signal 1: PLUTO owner (weight: 15)
  if (building.ownerNamePluto) {
    const c = getOrCreate(building.ownerNamePluto);
    c.signals.push({ source: "PLUTO", role: "Tax Record Owner", date: "current" });
  }

  // Signal 2: HPD contacts (weight: 10-20 depending on type)
  if (building.owners) {
    building.owners.forEach((o: any) => {
      const name = o.corporateName || [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
      if (!name) return;
      const c = getOrCreate(name);
      const role = o.contactDescription || o.type || "Contact";
      c.signals.push({ source: "HPD", role, date: "current" });
      // Add contact info from HPD
      if (o.businessAddress || o.businessCity) {
        const addr = [o.businessAddress, o.businessCity, o.businessState, o.businessZip].filter(Boolean).join(", ");
        if (addr && !c.contactInfo.find(ci => ci.value === addr)) {
          c.contactInfo.push({ type: "address", value: addr, source: "HPD Registration" });
        }
      }
    });
  }

  // Signal 3: ACRIS parties (weight: 20-30 depending on doc type)
  acrisParties.forEach(p => {
    if (!p.name) return;
    const c = getOrCreate(p.name);
    const doc = acrisDocs.find(d => d.documentId === p.documentId);
    const docType = doc?.docType || "Unknown";
    const role = p.partyType === "Grantee"
      ? (docType === "DEED" ? "Deed Grantee (Buyer)" : docType === "MTGE" ? "Mortgage Borrower" : "Grantee on " + docType)
      : (docType === "DEED" ? "Deed Grantor (Seller)" : "Grantor on " + docType);
    c.signals.push({
      source: "ACRIS", role, date: doc?.recordedDate || "",
      detail: doc?.amount > 0 ? "$" + doc.amount.toLocaleString() : undefined,
    });
    // Add contact info from ACRIS party address
    if (p.address1 || p.city) {
      const addr = [p.address1, p.address2, p.city, p.state, p.zip].filter(Boolean).join(", ");
      if (addr && !c.contactInfo.find(ci => ci.value === addr)) {
        c.contactInfo.push({ type: "address", value: addr, source: "ACRIS Filing" });
      }
    }
  });

  // Signal 4: NYS Entity data
  nysEntities.forEach(e => {
    const c = getOrCreate(e.corpName);
    c.signals.push({ source: "NYS DoS", role: "Registered Entity (" + e.nameStatus + ")", date: e.dateFiled });
    if (e.corpId) {
      c.signals.push({ source: "NYS DoS", role: "DOS ID: " + e.corpId, date: e.dateFiled });
    }
  });

  // ============================================================
  // SCORE CANDIDATES
  // ============================================================
  const candidates = Array.from(candidateMap.values());

  candidates.forEach(c => {
    let score = 0;
    const sourceSet = new Set(c.signals.map(s => s.source));

    // Frequency: appears in multiple sources (0-25 pts)
    score += Math.min(sourceSet.size * 8, 25);

    // MAJOR BOOST: Individuals rank above entities
    if (!c.isEntity) score += 20;
    if (c.isEntity) score -= 10;

    // MAJOR BOOST: Individuals rank above entities
    if (!c.isEntity) score += 20;
    // Penalty for being just an LLC/Corp
    if (c.isEntity) score -= 10;

    // Role authority (0-30 pts)
    const hasDeployGrantee = c.signals.some(s => s.role.includes("Deed Grantee"));
    const hasMortgageBorrower = c.signals.some(s => s.role.includes("Mortgage Borrower"));
    const hasHPDOwner = c.signals.some(s => s.source === "HPD" && (s.role.includes("Owner") || s.role.includes("CorporateOwner") || s.role.includes("IndividualOwner")));
    const hasPLUTO = c.signals.some(s => s.source === "PLUTO");
    const hasNYS = c.signals.some(s => s.source === "NYS DoS");

    if (hasDeployGrantee) score += 30;
    else if (hasMortgageBorrower) score += 25;
    else if (hasHPDOwner) score += 20;
    else if (hasPLUTO) score += 15;

    // Recency (0-20 pts)
    const dates = c.signals.map(s => s.date).filter(d => d && d !== "current").map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (dates.length > 0) {
      const mostRecent = Math.max(...dates);
      const yearsAgo = (Date.now() - mostRecent) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsAgo < 1) score += 20;
      else if (yearsAgo < 3) score += 15;
      else if (yearsAgo < 5) score += 10;
      else score += 5;
    }

    // Contact info available (0-10 pts)
    score += Math.min(c.contactInfo.length * 5, 10);

    // Entity linking (0-15 pts)
    if (hasNYS) score += 10;
    if (!c.isEntity && hasDeployGrantee) score += 5; // Individual on deed is very strong

    // Penalty: if this is a seller/grantor only (previous owner)
    const onlyGrantor = c.signals.every(s => s.role.includes("Grantor") || s.role.includes("Seller"));
    if (onlyGrantor) score -= 20;

    // Penalty: if this is just an agent
    const onlyAgent = c.signals.every(s => s.role.includes("Agent"));
    if (onlyAgent) score -= 15;

    c.confidence = Math.max(0, Math.min(100, score));

    // Link entities
    if (c.isEntity) {
      // Find individuals that might be linked
      candidates.forEach(other => {
        if (other.name !== c.name && !other.isEntity) {
          // Check if they share an address
          const cAddrs = c.contactInfo.map(ci => ci.value);
          const oAddrs = other.contactInfo.map(ci => ci.value);
          if (cAddrs.some(a => oAddrs.includes(a))) {
            c.linkedEntities.push(other.name);
            other.linkedEntities.push(c.name);
          }
        }
      });
    }

    // Boost individuals linked to entities
    if (!c.isEntity && c.linkedEntities.length > 0) score += 10;

    // Boost individuals linked to entities
    if (!c.isEntity && c.linkedEntities.length > 0) score += 10;

    // Generate recommendation
    if (c.confidence >= 75) {
      c.recommendation = c.isEntity
        ? "Registered entity. " + (c.linkedEntities.length > 0 ? "Likely controlled by: " + c.linkedEntities.join(", ") + ". " : "Individual owner not yet identified. ") + "Appears across " + sourceSet.size + " sources."
        : "LIKELY TRUE OWNER. " + (hasDeployGrantee ? "Named on deed. " : "") + (hasMortgageBorrower ? "Named on mortgage. " : "") + (c.linkedEntities.length > 0 ? "Controls: " + c.linkedEntities.join(", ") + ". " : "") + (c.contactInfo.length > 0 ? "Contact info available." : "");
    } else if (c.confidence >= 50) {
      c.recommendation = "Moderate confidence. " + (c.isEntity ? "Registered entity" : "Individual") + " with " + c.signals.length + " signals across " + sourceSet.size + " sources.";
    } else if (c.confidence >= 25) {
      c.recommendation = "Low confidence. Limited data — may be agent, previous owner, or related party.";
    } else {
      c.recommendation = "Unlikely current owner. Possibly previous owner or third party.";
    }
  });

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Build transaction timeline from ACRIS
  const transactions = acrisDocs
    .filter(d => d.docType === "DEED" || d.docType === "MTGE" || d.docType === "ASST" || d.docType === "AGMT")
    .map(d => ({
      ...d,
      parties: acrisParties.filter(p => p.documentId === d.documentId),
    }))
    .sort((a, b) => new Date(b.recordedDate).getTime() - new Date(a.recordedDate).getTime());

  console.log("=== ENRICHMENT COMPLETE ===", candidates.length, "candidates, top:", candidates[0]?.name, candidates[0]?.confidence);

  return {
    candidates,
    transactions,
    nysEntities,
    dataSources: {
      acrisDocs: acrisDocs.length,
      acrisParties: acrisParties.length,
      nysEntities: nysEntities.length,
      hpdContacts: building.owners?.length || 0,
    },
  };
}


// ============================================================
// PORTFOLIO DISCOVERY - Find all properties for top candidates
// ============================================================
export async function discoverPortfolio(candidates: { name: string; isEntity: boolean; contactInfo: { type: string; value: string; source: string }[] }[]) {
  console.log("=== PORTFOLIO DISCOVERY START ===");

  const ACRIS_PARTIES_ID = "636b-3b5g";
  const ACRIS_LEGALS_ID = "8h5j-fqxa";
  const ACRIS_MASTER_ID = "bnx9-e6tj";
  const HPD_CONTACTS_ID = "feu5-w2e2";
  const HPD_REG_ID = "tesw-yqqr";
  const NYC = "https://data.cityofnewyork.us/resource";

  // Collect unique names to search (top 3 individuals + top 2 entities)
  const individuals = candidates.filter(c => !c.isEntity).slice(0, 3);
  const entities = candidates.filter(c => c.isEntity).slice(0, 2);
  const searchNames = [...individuals, ...entities].map(c => c.name);

  // Also collect unique business addresses for address-based discovery
  const addresses = new Set<string>();
  candidates.slice(0, 5).forEach(c => {
    c.contactInfo.forEach(ci => {
      if (ci.type === "address" && ci.value.length > 10) {
        addresses.add(ci.value.split(",")[0].trim().toUpperCase());
      }
    });
  });

  console.log("Searching names:", searchNames);
  console.log("Searching addresses:", [...addresses]);

  interface PortfolioProperty {
    borough: string;
    boroCode: string;
    block: string;
    lot: string;
    address: string;
    matchedVia: string;
    documents: { docType: string; role: string; amount: number; recordedDate: string; name: string }[];
    ownerName?: string;
    units?: number;
    yearBuilt?: number;
    assessedValue?: number;
    numFloors?: number;
    bldgArea?: number;
    zoning?: string;
  }

  const allProperties = new Map<string, PortfolioProperty>();

  // Search ACRIS for each name
  const namePromises = searchNames.map(async (name) => {
    try {
      const url = new URL(NYC + "/" + ACRIS_PARTIES_ID + ".json");
      url.searchParams.set("$where", "upper(name) like '%" + name + "%'");
      url.searchParams.set("$limit", "80");
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const parties = await res.json();
      if (parties.length === 0) return;

      const docIds = [...new Set(parties.map((p: any) => p.document_id))] as string[];
      const docList = docIds.slice(0, 40).map((id: string) => "'" + id + "'").join(",");

      // Fetch legals + master in parallel
      const [legRes, masterRes] = await Promise.all([
        fetch((() => { const u = new URL(NYC + "/" + ACRIS_LEGALS_ID + ".json"); u.searchParams.set("$where", "document_id in(" + docList + ")"); u.searchParams.set("$limit", "200"); return u.toString(); })()),
        fetch((() => { const u = new URL(NYC + "/" + ACRIS_MASTER_ID + ".json"); u.searchParams.set("$where", "document_id in(" + docList + ")"); u.searchParams.set("$limit", "200"); return u.toString(); })()),
      ]);

      const legals = legRes.ok ? await legRes.json() : [];
      const masters = masterRes.ok ? await masterRes.json() : [];

      legals.forEach((l: any) => {
        const key = l.borough + "-" + l.block + "-" + l.lot;
        const master = masters.find((m: any) => m.document_id === l.document_id);
        const party = parties.find((p: any) => p.document_id === l.document_id);

        if (!allProperties.has(key)) {
          allProperties.set(key, {
            borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(l.borough)] || l.borough,
            boroCode: l.borough,
            block: l.block,
            lot: l.lot,
            address: l.street_number ? l.street_number + " " + (l.street_name || "") : "",
            matchedVia: name,
            documents: [],
          });
        }

        allProperties.get(key)!.documents.push({
          docType: master?.doc_type || "",
          role: party?.party_type === "1" ? "Grantee" : "Grantor",
          amount: parseInt(master?.document_amt || "0"),
          recordedDate: master?.recorded_datetime || "",
          name: party?.name || name,
        });
      });
    } catch (err) { console.error("Portfolio ACRIS error for", name, err); }
  });

  // Search HPD contacts for each name
  const hpdPromises = searchNames.map(async (name) => {
    try {
      const isEntity = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP)\b/i.test(name);
      const field = isEntity ? "corporationname" : "lastname";
      const searchTerm = isEntity ? name : name.split(" ").pop() || name;

      const url = new URL(NYC + "/" + HPD_CONTACTS_ID + ".json");
      url.searchParams.set("$where", "upper(" + field + ") like '%" + searchTerm + "%'");
      url.searchParams.set("$limit", "50");
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const contacts = await res.json();

      const regIds = [...new Set(contacts.map((c: any) => c.registrationid))] as string[];
      if (regIds.length === 0) return;

      const regList = regIds.slice(0, 30).map((id: string) => "'" + id + "'").join(",");
      const regUrl = new URL(NYC + "/" + HPD_REG_ID + ".json");
      regUrl.searchParams.set("$where", "registrationid in(" + regList + ")");
      regUrl.searchParams.set("$limit", "100");
      const regRes = await fetch(regUrl.toString());
      if (!regRes.ok) return;
      const regs = await regRes.json();

      regs.forEach((r: any) => {
        const key = r.boroid + "-" + r.block + "-" + r.lot;
        if (!allProperties.has(key)) {
          allProperties.set(key, {
            borough: r.boro || "",
            boroCode: r.boroid || "",
            block: r.block || "",
            lot: r.lot || "",
            address: r.housenumber ? r.housenumber + " " + (r.streetname || "") : "",
            matchedVia: name + " (HPD)",
            documents: [{ docType: "HPD", role: "Registered", amount: 0, recordedDate: "", name }],
          });
        }
      });
    } catch (err) { console.error("Portfolio HPD error for", name, err); }
  });

  await Promise.all([...namePromises, ...hpdPromises]);

  const properties = Array.from(allProperties.values());
  properties.sort((a, b) => {
    const aDate = Math.max(...a.documents.map(d => new Date(d.recordedDate || 0).getTime()), 0);
    const bDate = Math.max(...b.documents.map(d => new Date(d.recordedDate || 0).getTime()), 0);
    return bDate - aDate;
  });

  // Enrich properties with PLUTO data to get full addresses
  const propsNeedingAddr = properties.filter(p => !p.address || p.address.trim().length < 5);
  if (propsNeedingAddr.length > 0) {
    try {
      // Group by borough for batch PLUTO queries
      const boroGroups = new Map<string, typeof propsNeedingAddr>();
      propsNeedingAddr.forEach(p => {
        const boro = p.boroCode || "3";
        if (!boroGroups.has(boro)) boroGroups.set(boro, []);
        boroGroups.get(boro)!.push(p);
      });

      const plutoPromises = Array.from(boroGroups.entries()).map(async ([boro, props]) => {
        const conditions = props.slice(0, 20).map(p => "(block='" + p.block + "' AND lot='" + p.lot + "')").join(" OR ");
        try {
          const url = new URL(NYC + "/64uk-42ks.json");
          url.searchParams.set("$where", "borocode='" + boro + "' AND (" + conditions + ")");
          url.searchParams.set("$select", "block,lot,address,ownername,unitsres,yearbuilt,assesstot,numfloors,bldgarea,zonedist1");
          url.searchParams.set("$limit", "50");
          const res = await fetch(url.toString());
          if (res.ok) {
            const plutoData = await res.json();
            plutoData.forEach((pl: any) => {
              const match = props.find(p => p.block === pl.block && p.lot === pl.lot);
              if (match) {
                if (pl.address) match.address = pl.address;
                match.ownerName = pl.ownername || "";
                match.units = parseInt(pl.unitsres || "0");
                match.yearBuilt = parseInt(pl.yearbuilt || "0");
                match.assessedValue = parseInt(pl.assesstot || "0");
                match.numFloors = parseInt(pl.numfloors || "0");
                match.bldgArea = parseInt(pl.bldgarea || "0");
                match.zoning = pl.zonedist1 || "";
              }
            });
          }
        } catch {}
      });
      await Promise.all(plutoPromises);
    } catch (err) { console.error("Portfolio PLUTO enrichment error:", err); }
  }

  // Also enrich properties that have addresses from ACRIS but no other data
  const propsWithAddr = properties.filter(p => p.address && p.address.trim().length >= 5 && !p.units);
  if (propsWithAddr.length > 0) {
    try {
      const boroGroups = new Map<string, typeof propsWithAddr>();
      propsWithAddr.forEach(p => {
        const boro = p.boroCode || "3";
        if (!boroGroups.has(boro)) boroGroups.set(boro, []);
        boroGroups.get(boro)!.push(p);
      });

      const plutoPromises2 = Array.from(boroGroups.entries()).map(async ([boro, props]) => {
        const conditions = props.slice(0, 20).map(p => "(block='" + p.block + "' AND lot='" + p.lot + "')").join(" OR ");
        try {
          const url = new URL(NYC + "/64uk-42ks.json");
          url.searchParams.set("$where", "borocode='" + boro + "' AND (" + conditions + ")");
          url.searchParams.set("$select", "block,lot,address,ownername,unitsres,yearbuilt,assesstot,numfloors,bldgarea,zonedist1");
          url.searchParams.set("$limit", "50");
          const res = await fetch(url.toString());
          if (res.ok) {
            const plutoData = await res.json();
            plutoData.forEach((pl: any) => {
              const match = props.find(p => p.block === pl.block && p.lot === pl.lot);
              if (match) {
                if (pl.address && (!match.address || match.address.length < pl.address.length)) match.address = pl.address;
                match.ownerName = pl.ownername || "";
                match.units = parseInt(pl.unitsres || "0");
                match.yearBuilt = parseInt(pl.yearbuilt || "0");
                match.assessedValue = parseInt(pl.assesstot || "0");
                match.numFloors = parseInt(pl.numfloors || "0");
                match.bldgArea = parseInt(pl.bldgarea || "0");
                match.zoning = pl.zonedist1 || "";
              }
            });
          }
        } catch {}
      });
      await Promise.all(plutoPromises2);
    } catch {}
  }

  console.log("=== PORTFOLIO DISCOVERY COMPLETE ===", properties.length, "properties found");
  return { properties, searchedNames: searchNames, searchedAddresses: [...addresses] };
}


// ============================================================
// PORTFOLIO DISCOVERY - Find all properties for top candidates
// ============================================================
