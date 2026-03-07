"use server";

import { cacheManager, SOURCE_CONFIG } from "@/lib/cache-manager";
import { pierceEntityVeil, findRelatedEntities, findEntitiesByAddress } from "@/lib/ny-corporations";
import { normalizeName, isEntityName, isPersonName, isSameEntity } from "@/lib/entity-resolver";

// ============================================================
// Types
// ============================================================

export interface OwnershipEvent {
  documentId: string;
  docType: string;
  docTypeLabel: string;
  recordedDate: string;
  documentDate: string;
  amount: number;
  parties: { name: string; role: "grantor" | "grantee" | "borrower" | "lender" | "other"; address?: string }[];
}

export interface OwnershipChain {
  currentOwner: { name: string; acquiredDate: string; acquiredPrice: number; deedDocId: string } | null;
  previousOwners: { name: string; acquiredDate: string; soldDate: string; holdingPeriod: string; acquiredPrice: number; soldPrice: number }[];
  timeline: OwnershipEvent[];
  activeMortgages: { lender: string; amount: number; date: string; isSatisfied: boolean; satisfiedDate?: string }[];
  lispendens: { filedDate: string; parties: string[]; documentId: string }[];
  uccFilings: { filedDate: string; parties: string[]; amount: number; documentId: string }[];
  totalTransactions: number;
  estimatedEquity: number | null;
}

export interface DeepEntityResult {
  primaryEntity: { name: string; dosId: string; entityType: string; filingDate: string; county: string } | null;
  piercingChain: { step: number; fromEntity: string; toEntity: string; relationship: string; address?: string }[];
  ultimatePerson: string | null;
  ultimatePersonConfidence: number;
  relatedLLCs: { name: string; dosId: string; entityType: string; filingDate: string; sharedVia: string; propertyCount?: number }[];
  addressLinkedEntities: { name: string; dosId: string; address: string }[];
  totalRelatedEntities: number;
}

export interface PortfolioDiscovery {
  properties: { bbl: string; address: string; borough: string; units: number; yearBuilt: number; assessedValue: number; numFloors: number; ownerName: string; matchedVia: string }[];
  matchedNames: string[];
  expandedNames: string[];
  totalUnits: number;
  totalAssessedValue: number;
}

// ============================================================
// Constants
// ============================================================

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const ACRIS_LEGALS = "8h5j-fqxa";
const ACRIS_MASTER = "bnx9-e6tj";
const ACRIS_PARTIES = "636b-3b5g";
const PLUTO = "64uk-42ks";

const DOC_TYPE_LABELS: Record<string, string> = {
  DEED: "Deed Transfer",
  DEEDO: "Deed Transfer",
  "DEED P/S": "Purchase & Sale Deed",
  "DEED TS": "Transfer/Surrender Deed",
  "DEED RC": "Deed (Record & Correct)",
  MTGE: "Mortgage",
  SAT: "Satisfaction",
  AGMT: "Agreement",
  ASST: "Assignment",
  RPTT: "Transfer Tax",
  "AL&R": "Assignment of Leases",
  MCON: "Consolidation",
  UCC1: "UCC Filing",
  ALIS: "Lis Pendens",
};

const DEED_TYPES = new Set(["DEED", "DEEDO", "DEED P/S", "DEED TS", "DEED RC", "RPTT"]);
const LIS_PENDENS_TYPES = new Set(["ALIS", "LIS PENDENS"]);
const UCC_TYPES = new Set(["UCC1", "UCC3"]);

const REGISTERED_AGENT_SERVICES = new Set([
  "NATIONAL REGISTERED AGENTS",
  "CT CORPORATION",
  "UNITED STATES CORPORATION AGENTS",
  "REGISTERED AGENT SOLUTIONS",
  "INCORP SERVICES",
  "CSC",
  "COGENCY GLOBAL",
  "LEGALINC",
]);

const BORO_MAP: Record<string, string> = {
  MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5",
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
};

const BORO_NAMES: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

// ============================================================
// Helpers
// ============================================================

function parseBBL(bbl: string): { boroCode: string; block: string; lot: string } {
  return {
    boroCode: bbl.charAt(0),
    block: bbl.substring(1, 6).replace(/^0+/, ""),
    lot: bbl.substring(6, 10).replace(/^0+/, ""),
  };
}

function formatHoldingPeriod(fromDate: string, toDate: string): string {
  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? "s" : ""}`;
    if (remainingMonths === 0) return `${years} year${years !== 1 ? "s" : ""}`;
    return `${years} year${years !== 1 ? "s" : ""}, ${remainingMonths} month${remainingMonths !== 1 ? "s" : ""}`;
  } catch {
    return "—";
  }
}

function isRegisteredAgentService(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  for (const service of REGISTERED_AGENT_SERVICES) {
    if (upper.includes(service)) return true;
  }
  return false;
}

function mapPartyRole(partyType: string, docType: string): "grantor" | "grantee" | "borrower" | "lender" | "other" {
  if (docType === "MTGE" || docType === "SAT") {
    return partyType === "1" ? "borrower" : partyType === "2" ? "lender" : "other";
  }
  return partyType === "1" ? "grantee" : partyType === "2" ? "grantor" : "other";
}

// ============================================================
// Action 1: getOwnershipChain
// ============================================================

export async function getOwnershipChain(bbl: string): Promise<OwnershipChain | null> {
  if (!bbl || bbl.length < 10) return null;

  // Check cache
  const cached = cacheManager.getSource(bbl, "ACRIS_CHAIN") as OwnershipChain | null;
  if (cached) return cached;

  const { boroCode, block, lot } = parseBBL(bbl);

  try {
    // Step 1: Query ACRIS Legals for this BBL (increased limit for deeper chain)
    const legUrl = new URL(`${NYC_BASE}/${ACRIS_LEGALS}.json`);
    legUrl.searchParams.set("$where", `borough='${boroCode}' AND block='${block}' AND lot='${lot}'`);
    legUrl.searchParams.set("$limit", "100");
    const legRes = await fetch(legUrl.toString());
    if (!legRes.ok) return null;
    const legals = await legRes.json();
    if (!Array.isArray(legals) || legals.length === 0) return null;

    const docIds = [...new Set(legals.map((l: any) => l.document_id))] as string[];
    if (docIds.length === 0) return null;

    // Step 2: Batch fetch Master + Parties in parallel (increased cap to 50 docs)
    const docList = docIds.slice(0, 50).map((id: string) => `'${id}'`).join(",");

    const [masterRes, partiesRes] = await Promise.all([
      fetch((() => {
        const u = new URL(`${NYC_BASE}/${ACRIS_MASTER}.json`);
        u.searchParams.set("$where", `document_id in(${docList})`);
        u.searchParams.set("$limit", "300");
        u.searchParams.set("$order", "recorded_datetime DESC");
        return u.toString();
      })()),
      fetch((() => {
        const u = new URL(`${NYC_BASE}/${ACRIS_PARTIES}.json`);
        u.searchParams.set("$where", `document_id in(${docList})`);
        u.searchParams.set("$limit", "400");
        return u.toString();
      })()),
    ]);

    const masters: any[] = masterRes.ok ? await masterRes.json() : [];
    const parties: any[] = partiesRes.ok ? await partiesRes.json() : [];
    if (!Array.isArray(masters)) return null;

    // Step 3: Join by document_id and build timeline
    const partyByDoc = new Map<string, any[]>();
    for (const p of (Array.isArray(parties) ? parties : [])) {
      if (!partyByDoc.has(p.document_id)) partyByDoc.set(p.document_id, []);
      partyByDoc.get(p.document_id)!.push(p);
    }

    const timeline: OwnershipEvent[] = [];
    for (const m of masters) {
      const docType = (m.doc_type || "").toUpperCase();
      const docParties = partyByDoc.get(m.document_id) || [];
      const addr = (p: any) => [p.address_1, p.city, p.state, p.zip].filter(Boolean).join(", ") || undefined;

      timeline.push({
        documentId: m.document_id,
        docType,
        docTypeLabel: DOC_TYPE_LABELS[docType] || docType,
        recordedDate: m.recorded_datetime || "",
        documentDate: m.document_date || "",
        amount: parseInt(m.document_amt || "0") || 0,
        parties: docParties.map((p: any) => ({
          name: p.name || "",
          role: mapPartyRole(p.party_type, docType),
          address: addr(p),
        })),
      });
    }

    // Sort newest first
    timeline.sort((a, b) => new Date(b.recordedDate).getTime() - new Date(a.recordedDate).getTime());

    // Step 4: Build ownership chain from deed documents
    const deedEvents = timeline.filter(e => DEED_TYPES.has(e.docType));

    let currentOwner: OwnershipChain["currentOwner"] = null;
    const previousOwners: OwnershipChain["previousOwners"] = [];

    if (deedEvents.length > 0) {
      const latest = deedEvents[0];
      const grantee = latest.parties.find(p => p.role === "grantee");
      if (grantee) {
        currentOwner = {
          name: grantee.name,
          acquiredDate: latest.recordedDate,
          acquiredPrice: latest.amount,
          deedDocId: latest.documentId,
        };
      }

      // Walk backwards to build previous owners
      for (let i = 0; i < deedEvents.length - 1; i++) {
        const sellerEvent = deedEvents[i];
        const buyerEvent = deedEvents[i + 1];
        const grantor = sellerEvent.parties.find(p => p.role === "grantor");
        const prevGrantee = buyerEvent.parties.find(p => p.role === "grantee");
        const ownerName = grantor?.name || prevGrantee?.name || "Unknown";

        previousOwners.push({
          name: ownerName,
          acquiredDate: buyerEvent.recordedDate,
          soldDate: sellerEvent.recordedDate,
          holdingPeriod: formatHoldingPeriod(buyerEvent.recordedDate, sellerEvent.recordedDate),
          acquiredPrice: buyerEvent.amount,
          soldPrice: sellerEvent.amount,
        });
      }

      // Last deed's grantor is the earliest known owner
      if (deedEvents.length > 0) {
        const earliest = deedEvents[deedEvents.length - 1];
        const grantor = earliest.parties.find(p => p.role === "grantor");
        if (grantor && !previousOwners.some(o => normalizeName(o.name) === normalizeName(grantor.name))) {
          previousOwners.push({
            name: grantor.name,
            acquiredDate: "",
            soldDate: earliest.recordedDate,
            holdingPeriod: "—",
            acquiredPrice: 0,
            soldPrice: earliest.amount,
          });
        }
      }
    }

    // Step 5: Enhanced mortgage matching — by lender name AND by chronological proximity
    const mortgageEvents = timeline.filter(e => e.docType === "MTGE");
    const satisfactionEvents = timeline.filter(e => e.docType === "SAT");
    const assignmentEvents = timeline.filter(e => e.docType === "ASST");

    // Build a map of mortgage assignments: original lender → assigned lender
    const assignedLenders = new Map<string, string>();
    for (const asst of assignmentEvents) {
      const from = asst.parties.find(p => p.role === "grantor");
      const to = asst.parties.find(p => p.role === "grantee");
      if (from && to) assignedLenders.set(normalizeName(from.name), to.name);
    }

    const activeMortgages: OwnershipChain["activeMortgages"] = mortgageEvents.map(mtge => {
      const lender = mtge.parties.find(p => p.role === "lender");
      const lenderName = lender?.name || "Unknown Lender";
      const normalizedLender = normalizeName(lenderName);

      // Check assigned lender name too (mortgage may have been assigned to different entity)
      const assignedName = assignedLenders.get(normalizedLender);

      // Match satisfaction by: original lender name, assigned lender name, or amount+date proximity
      let isSatisfied = false;
      let satisfiedDate: string | undefined;
      for (const sat of satisfactionEvents) {
        const satLender = sat.parties.find(p => p.role === "lender");
        if (!satLender) continue;

        const nameMatch = isSameEntity(lenderName, satLender.name).match
          || (assignedName && isSameEntity(assignedName, satLender.name).match);

        // Also match by amount if amounts are similar (within 5%) and satisfaction is after mortgage
        const amountMatch = mtge.amount > 0 && sat.amount > 0
          && Math.abs(mtge.amount - sat.amount) / mtge.amount < 0.05
          && new Date(sat.recordedDate) > new Date(mtge.recordedDate);

        if (nameMatch || amountMatch) {
          isSatisfied = true;
          satisfiedDate = sat.recordedDate;
          break;
        }
      }

      return {
        lender: lenderName,
        amount: mtge.amount,
        date: mtge.recordedDate,
        isSatisfied,
        satisfiedDate,
      };
    });

    // Step 6: Lis Pendens — distress signal
    const lispendens: OwnershipChain["lispendens"] = timeline
      .filter(e => LIS_PENDENS_TYPES.has(e.docType))
      .map(lp => ({
        filedDate: lp.recordedDate,
        parties: lp.parties.map(p => p.name),
        documentId: lp.documentId,
      }));

    // Step 7: UCC Filings — liens/security interests
    const uccFilings: OwnershipChain["uccFilings"] = timeline
      .filter(e => UCC_TYPES.has(e.docType))
      .map(ucc => ({
        filedDate: ucc.recordedDate,
        parties: ucc.parties.map(p => p.name),
        amount: ucc.amount,
        documentId: ucc.documentId,
      }));

    // Estimated equity computed in UI using assessed value passed from the profile
    const result: OwnershipChain = {
      currentOwner,
      previousOwners,
      timeline,
      activeMortgages,
      lispendens,
      uccFilings,
      totalTransactions: timeline.length,
      estimatedEquity: null,
    };

    cacheManager.setSource(bbl, "ACRIS_CHAIN", result);
    return result;
  } catch (err) {
    console.error("getOwnershipChain error:", err);
    return null;
  }
}

// ============================================================
// Action 2: deepPierceEntity
// ============================================================

export async function deepPierceEntity(entityName: string): Promise<DeepEntityResult | null> {
  if (!entityName || entityName.length < 3) return null;

  const normalized = normalizeName(entityName);
  const cacheKey = "entity:" + normalized;
  const cached = cacheManager.getSource(cacheKey, "ENTITY_DEEP") as DeepEntityResult | null;
  if (cached) return cached;

  try {
    // Step 1: Pierce the LLC via ny-corporations.ts
    const intel = await pierceEntityVeil(entityName);

    if (!intel) {
      const emptyResult: DeepEntityResult = {
        primaryEntity: null,
        piercingChain: [],
        ultimatePerson: null,
        ultimatePersonConfidence: 30,
        relatedLLCs: [],
        addressLinkedEntities: [],
        totalRelatedEntities: 0,
      };
      cacheManager.setSource(cacheKey, "ENTITY_DEEP", emptyResult);
      return emptyResult;
    }

    const piercingChain: DeepEntityResult["piercingChain"] = [];
    let ultimatePerson: string | null = null;
    let ultimatePersonConfidence = 30;

    // Step 2: Build piercing chain — entity → processName/registeredAgent
    const agentName = intel.registeredAgent || intel.processName;
    const agentAddress = intel.registeredAgentAddress || intel.processAddress;

    if (agentName && agentName.length > 2) {
      if (isRegisteredAgentService(agentName)) {
        // Known registered agent service
        piercingChain.push({
          step: 1,
          fromEntity: intel.llcName,
          toEntity: agentName,
          relationship: "Registered Agent Service",
          address: agentAddress || undefined,
        });
        ultimatePersonConfidence = 40;

        // Try to find the actual person by looking at process name (often the real person)
        if (intel.processName && !isRegisteredAgentService(intel.processName) && intel.processName !== agentName) {
          if (isPersonName(intel.processName)) {
            ultimatePerson = intel.processName;
            ultimatePersonConfidence = 80;
            piercingChain.push({
              step: 2,
              fromEntity: intel.llcName,
              toEntity: intel.processName,
              relationship: "Process Name (Individual)",
              address: intel.processAddress || undefined,
            });
          } else if (isEntityName(intel.processName)) {
            // Process name is another entity — try to pierce it
            piercingChain.push({
              step: 2,
              fromEntity: intel.llcName,
              toEntity: intel.processName,
              relationship: "Process Entity",
              address: intel.processAddress || undefined,
            });
            try {
              const level2 = await pierceEntityVeil(intel.processName);
              if (level2) {
                const agent2 = level2.registeredAgent || level2.processName;
                if (agent2 && isPersonName(agent2)) {
                  ultimatePerson = agent2;
                  ultimatePersonConfidence = 60;
                  piercingChain.push({
                    step: 3,
                    fromEntity: intel.processName,
                    toEntity: agent2,
                    relationship: "Individual (3-hop)",
                    address: level2.registeredAgentAddress || level2.processAddress || undefined,
                  });
                }
              }
            } catch { /* Level 2 piercing failed */ }
          }
        }
      } else if (isPersonName(agentName)) {
        // Agent is a person
        piercingChain.push({
          step: 1,
          fromEntity: intel.llcName,
          toEntity: agentName,
          relationship: intel.registeredAgent ? "Registered Agent (Individual)" : "Process Name (Individual)",
          address: agentAddress || undefined,
        });
        ultimatePerson = agentName;
        ultimatePersonConfidence = intel.registeredAgent ? 85 : 80;

        // Cross-validate: if both registered agent and process name are persons and they differ,
        // prefer the process name as the actual owner (registered agent is sometimes an attorney)
        if (intel.registeredAgent && intel.processName
            && intel.registeredAgent !== intel.processName
            && isPersonName(intel.processName)
            && !isRegisteredAgentService(intel.processName)) {
          piercingChain.push({
            step: 2,
            fromEntity: intel.llcName,
            toEntity: intel.processName,
            relationship: "Process Name (Cross-validation)",
            address: intel.processAddress || undefined,
          });
          // If both are persons, process name is more likely the principal
          ultimatePerson = intel.processName;
          ultimatePersonConfidence = 85;
        }
      } else if (isEntityName(agentName)) {
        // Agent is another entity — recurse up to 3 levels
        piercingChain.push({
          step: 1,
          fromEntity: intel.llcName,
          toEntity: agentName,
          relationship: "Parent Entity",
          address: agentAddress || undefined,
        });

        try {
          const level2 = await pierceEntityVeil(agentName);
          if (level2) {
            const agent2 = level2.registeredAgent || level2.processName;
            if (agent2 && agent2.length > 2) {
              if (isPersonName(agent2)) {
                ultimatePerson = agent2;
                ultimatePersonConfidence = 65;
                piercingChain.push({
                  step: 2,
                  fromEntity: agentName,
                  toEntity: agent2,
                  relationship: "Individual (2-hop)",
                  address: level2.registeredAgentAddress || level2.processAddress || undefined,
                });
              } else if (isEntityName(agent2) && !isRegisteredAgentService(agent2)) {
                piercingChain.push({
                  step: 2,
                  fromEntity: agentName,
                  toEntity: agent2,
                  relationship: "Entity (2-hop)",
                  address: level2.registeredAgentAddress || level2.processAddress || undefined,
                });

                // 3rd level — final attempt
                try {
                  const level3 = await pierceEntityVeil(agent2);
                  if (level3) {
                    const agent3 = level3.registeredAgent || level3.processName;
                    if (agent3 && isPersonName(agent3)) {
                      ultimatePerson = agent3;
                      ultimatePersonConfidence = 55;
                      piercingChain.push({
                        step: 3,
                        fromEntity: agent2,
                        toEntity: agent3,
                        relationship: "Individual (3-hop)",
                        address: level3.registeredAgentAddress || level3.processAddress || undefined,
                      });
                    }
                  }
                } catch { /* Level 3 failed */ }
              } else {
                piercingChain.push({
                  step: 2,
                  fromEntity: agentName,
                  toEntity: agent2,
                  relationship: isRegisteredAgentService(agent2) ? "Registered Agent Service" : "Entity",
                  address: level2.registeredAgentAddress || level2.processAddress || undefined,
                });
                if (isRegisteredAgentService(agent2)) {
                  ultimatePersonConfidence = 40;
                }

                // When agent service is at level 2, check process name of parent entity
                if (isRegisteredAgentService(agent2) && level2.processName
                    && isPersonName(level2.processName)
                    && !isRegisteredAgentService(level2.processName)) {
                  ultimatePerson = level2.processName;
                  ultimatePersonConfidence = 60;
                  piercingChain.push({
                    step: 3,
                    fromEntity: agentName,
                    toEntity: level2.processName,
                    relationship: "Process Name (Individual)",
                    address: level2.processAddress || undefined,
                  });
                }
              }
            }
          }
        } catch {
          // Level 2 piercing failed
        }
      } else {
        // Unknown classification
        piercingChain.push({
          step: 1,
          fromEntity: intel.llcName,
          toEntity: agentName,
          relationship: intel.registeredAgent ? "Registered Agent" : "Process Name",
          address: agentAddress || undefined,
        });
        ultimatePersonConfidence = 50;
      }
    }

    // Step 3: Related LLCs — query ACRIS for property counts on top 5
    const relatedLLCs: DeepEntityResult["relatedLLCs"] = [];
    const relatedSlice = intel.relatedEntities.slice(0, 15);

    // Get property counts for top 5 related entities
    const propertyCountPromises = relatedSlice.slice(0, 5).map(async (entity) => {
      try {
        const searchName = entity.currentEntityName.toUpperCase().replace(/'/g, "''");
        const url = new URL(`${NYC_BASE}/${ACRIS_PARTIES}.json`);
        url.searchParams.set("$where", `upper(name) like '%${searchName}%'`);
        url.searchParams.set("$select", "document_id");
        url.searchParams.set("$limit", "50");
        const res = await fetch(url.toString());
        if (!res.ok) return 0;
        const data = await res.json();
        if (!Array.isArray(data)) return 0;
        const uniqueDocs = new Set(data.map((d: any) => d.document_id));
        return uniqueDocs.size;
      } catch {
        return 0;
      }
    });

    const propertyCounts = await Promise.all(propertyCountPromises);

    for (let i = 0; i < relatedSlice.length; i++) {
      const entity = relatedSlice[i];
      relatedLLCs.push({
        name: entity.currentEntityName,
        dosId: entity.dosId,
        entityType: entity.entityType,
        filingDate: entity.initialFilingDate,
        sharedVia: agentName || "process agent",
        propertyCount: i < 5 ? propertyCounts[i] : undefined,
      });
    }

    // Step 4: Address cross-referencing — find other entities at the same process address
    let addressLinkedEntities: DeepEntityResult["addressLinkedEntities"] = [];
    const processAddr = intel.processAddress || intel.registeredAgentAddress;
    if (processAddr && processAddr.length > 10 && !isRegisteredAgentService(agentName || "")) {
      try {
        const addrEntities = await findEntitiesByAddress(processAddr);
        addressLinkedEntities = addrEntities
          .filter(e => e.dosId !== intel.dosId) // Exclude self
          .filter(e => !relatedLLCs.some(r => r.dosId === e.dosId)) // Exclude already-related
          .slice(0, 10)
          .map(e => ({
            name: e.currentEntityName,
            dosId: e.dosId,
            address: e.processAddress,
          }));
      } catch { /* Address search failed */ }
    }

    const result: DeepEntityResult = {
      primaryEntity: {
        name: intel.llcName,
        dosId: intel.dosId,
        entityType: intel.entityType,
        filingDate: intel.filingDate,
        county: intel.county,
      },
      piercingChain,
      ultimatePerson,
      ultimatePersonConfidence,
      relatedLLCs,
      addressLinkedEntities,
      totalRelatedEntities: intel.totalRelatedEntities,
    };

    cacheManager.setSource(cacheKey, "ENTITY_DEEP", result);
    return result;
  } catch (err) {
    console.error("deepPierceEntity error:", err);
    return null;
  }
}

// ============================================================
// Action 3: discoverFullPortfolio
// ============================================================

export async function discoverFullPortfolio(
  names: string[],
  currentBBL?: string,
  expandedNames?: string[],
): Promise<PortfolioDiscovery | null> {
  if (!names || names.length === 0) return null;

  // Merge original names + expanded names from entity piercing
  const allInputNames = [...names, ...(expandedNames || [])];
  const uniqueNames = [...new Set(allInputNames.map(n => n.trim()).filter(n => n.length >= 3))].slice(0, 8);
  if (uniqueNames.length === 0) return null;

  const sortedKey = uniqueNames.map(n => normalizeName(n)).sort().join("|");
  const cacheKey = "portfolio:" + sortedKey;
  const cached = cacheManager.getSource(cacheKey, "PORTFOLIO_FULL") as PortfolioDiscovery | null;
  if (cached) return cached;

  try {
    const bblSet = new Map<string, { bbl: string; boroCode: string; block: string; lot: string; matchedVia: string }>();

    // For each name, search ACRIS Parties + PLUTO + HPD Registrations in parallel
    const searchPromises = uniqueNames.flatMap(name => {
      const escapedName = name.toUpperCase().replace(/'/g, "''");

      // ACRIS Parties search
      const acrisPromise = (async () => {
        try {
          const url = new URL(`${NYC_BASE}/${ACRIS_PARTIES}.json`);
          url.searchParams.set("$where", `upper(name) like '%${escapedName}%'`);
          url.searchParams.set("$limit", "80");
          const res = await fetch(url.toString());
          if (!res.ok) return;
          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) return;

          // Get document IDs → lookup legals for BBLs
          const docIds = [...new Set(data.map((p: any) => p.document_id))] as string[];
          if (docIds.length === 0) return;
          const docList = docIds.slice(0, 40).map((id: string) => `'${id}'`).join(",");

          const legUrl = new URL(`${NYC_BASE}/${ACRIS_LEGALS}.json`);
          legUrl.searchParams.set("$where", `document_id in(${docList})`);
          legUrl.searchParams.set("$limit", "200");
          const legRes = await fetch(legUrl.toString());
          if (!legRes.ok) return;
          const legals = await legRes.json();
          if (!Array.isArray(legals)) return;

          for (const l of legals) {
            const bbl = l.borough + (l.block || "").padStart(5, "0") + (l.lot || "").padStart(4, "0");
            if (!bblSet.has(bbl)) {
              bblSet.set(bbl, { bbl, boroCode: l.borough, block: l.block, lot: l.lot, matchedVia: "ACRIS" });
            }
          }
        } catch {}
      })();

      // PLUTO search
      const plutoPromise = (async () => {
        try {
          const url = new URL(`${NYC_BASE}/${PLUTO}.json`);
          url.searchParams.set("$where", `upper(ownername) like '%${escapedName}%'`);
          url.searchParams.set("$select", "bbl,borocode,block,lot,address,ownername,unitsres,yearbuilt,assesstot,numfloors,borough");
          url.searchParams.set("$limit", "50");
          const res = await fetch(url.toString());
          if (!res.ok) return;
          const data = await res.json();
          if (!Array.isArray(data)) return;

          for (const d of data) {
            const bbl = d.bbl || (d.borocode + (d.block || "").padStart(5, "0") + (d.lot || "").padStart(4, "0"));
            if (!bblSet.has(bbl)) {
              bblSet.set(bbl, { bbl, boroCode: d.borocode, block: d.block, lot: d.lot, matchedVia: "PLUTO" });
            }
          }
        } catch {}
      })();

      // HPD Registration search — find buildings where this name appears as owner/agent
      const hpdPromise = (async () => {
        // Only search HPD for entity names (LLC/Corp) — individual names are too common
        if (!isEntityName(name)) return;
        try {
          const HPD_CONTACTS = "feu5-w2e2";
          const url = new URL(`${NYC_BASE}/${HPD_CONTACTS}.json`);
          url.searchParams.set("$where", `upper(corporationname) like '%${escapedName}%'`);
          url.searchParams.set("$select", "boroid,block,lot");
          url.searchParams.set("$limit", "50");
          const res = await fetch(url.toString());
          if (!res.ok) return;
          const data = await res.json();
          if (!Array.isArray(data)) return;

          for (const d of data) {
            const boroCode = String(d.boroid || "");
            const block = String(d.block || "");
            const lot = String(d.lot || "");
            if (!boroCode || !block || !lot) continue;
            const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
            if (!bblSet.has(bbl)) {
              bblSet.set(bbl, { bbl, boroCode, block, lot, matchedVia: "HPD" });
            }
          }
        } catch {}
      })();

      return [acrisPromise, plutoPromise, hpdPromise];
    });

    await Promise.all(searchPromises);

    // Exclude currentBBL
    if (currentBBL) bblSet.delete(currentBBL);

    // Enrich with PLUTO data
    const bblEntries = [...bblSet.values()];
    const properties: PortfolioDiscovery["properties"] = [];

    // Group by borough for batch PLUTO queries
    const boroGroups = new Map<string, typeof bblEntries>();
    for (const entry of bblEntries) {
      const boro = entry.boroCode || "3";
      if (!boroGroups.has(boro)) boroGroups.set(boro, []);
      boroGroups.get(boro)!.push(entry);
    }

    const enrichPromises = Array.from(boroGroups.entries()).map(async ([boro, entries]) => {
      const conditions = entries.slice(0, 25).map(e => `(block='${e.block}' AND lot='${e.lot}')`).join(" OR ");
      try {
        const url = new URL(`${NYC_BASE}/${PLUTO}.json`);
        url.searchParams.set("$where", `borocode='${boro}' AND (${conditions})`);
        url.searchParams.set("$select", "bbl,block,lot,address,ownername,unitsres,yearbuilt,assesstot,numfloors,borough");
        url.searchParams.set("$limit", "50");
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        for (const d of data) {
          const bbl = d.bbl || (boro + (d.block || "").padStart(5, "0") + (d.lot || "").padStart(4, "0"));
          const entry = bblSet.get(bbl);
          properties.push({
            bbl,
            address: d.address || "",
            borough: d.borough || BORO_NAMES[boro] || "",
            units: parseInt(d.unitsres || "0") || 0,
            yearBuilt: parseInt(d.yearbuilt || "0") || 0,
            assessedValue: parseInt(d.assesstot || "0") || 0,
            numFloors: parseInt(d.numfloors || "0") || 0,
            ownerName: d.ownername || "",
            matchedVia: entry?.matchedVia || "PLUTO",
          });
        }
      } catch {}
    });

    await Promise.all(enrichPromises);

    // Also add BBLs we didn't find in PLUTO (ACRIS-only or HPD-only matches)
    for (const [bbl, entry] of bblSet) {
      if (!properties.some(p => p.bbl === bbl)) {
        properties.push({
          bbl,
          address: "",
          borough: BORO_NAMES[entry.boroCode] || "",
          units: 0,
          yearBuilt: 0,
          assessedValue: 0,
          numFloors: 0,
          ownerName: "",
          matchedVia: entry.matchedVia,
        });
      }
    }

    // Sort by units descending, then assessed value
    properties.sort((a, b) => (b.units - a.units) || (b.assessedValue - a.assessedValue));

    const totalUnits = properties.reduce((sum, p) => sum + p.units, 0);
    const totalAssessedValue = properties.reduce((sum, p) => sum + p.assessedValue, 0);

    const result: PortfolioDiscovery = {
      properties,
      matchedNames: names.map(n => n.trim()).filter(n => n.length >= 3),
      expandedNames: (expandedNames || []).filter(n => n.length >= 3),
      totalUnits,
      totalAssessedValue,
    };

    cacheManager.setSource(cacheKey, "PORTFOLIO_FULL", result);
    return result;
  } catch (err) {
    console.error("discoverFullPortfolio error:", err);
    return null;
  }
}

// ============================================================
// Action 4: getOwnershipIntelligence (orchestrator)
// ============================================================

export async function getOwnershipIntelligence(
  bbl: string,
  ownerName?: string,
  llcName?: string,
): Promise<{ chain: OwnershipChain | null; entityIntel: DeepEntityResult | null; portfolio: PortfolioDiscovery | null }> {
  // Phase 1: Run ACRIS chain + entity piercing in parallel
  // These complete first and inform the portfolio search
  const [chain, entityIntel] = await Promise.all([
    getOwnershipChain(bbl).catch(() => null),
    llcName ? deepPierceEntity(llcName).catch(() => null) : Promise.resolve(null),
  ]);

  // Phase 2: Expanded portfolio — use Phase 1 results to discover more properties
  // Collect names from entity piercing to expand the search
  const baseNames: string[] = [];
  if (ownerName) baseNames.push(ownerName);
  if (llcName && llcName !== ownerName) baseNames.push(llcName);

  // Add current owner from ACRIS chain (may differ from PLUTO owner name)
  if (chain?.currentOwner?.name) {
    const chainOwner = chain.currentOwner.name;
    if (!baseNames.some(n => isSameEntity(n, chainOwner).match)) {
      baseNames.push(chainOwner);
    }
  }

  // Expand with related LLC names from entity piercing (top 3 with property counts > 0)
  const expandedNames: string[] = [];
  if (entityIntel?.relatedLLCs) {
    const withProperties = entityIntel.relatedLLCs
      .filter(llc => llc.propertyCount && llc.propertyCount > 0)
      .sort((a, b) => (b.propertyCount || 0) - (a.propertyCount || 0))
      .slice(0, 3);
    for (const llc of withProperties) {
      if (!baseNames.some(n => isSameEntity(n, llc.name).match)) {
        expandedNames.push(llc.name);
      }
    }
  }

  // Add ultimate person name from piercing (useful for person-based PLUTO searches)
  if (entityIntel?.ultimatePerson && entityIntel.ultimatePersonConfidence >= 65) {
    const person = entityIntel.ultimatePerson;
    if (!baseNames.some(n => isSameEntity(n, person).match)
        && !expandedNames.some(n => isSameEntity(n, person).match)) {
      expandedNames.push(person);
    }
  }

  const portfolio = baseNames.length > 0
    ? await discoverFullPortfolio(baseNames, bbl, expandedNames).catch(() => null)
    : null;

  return { chain, entityIntel, portfolio };
}
