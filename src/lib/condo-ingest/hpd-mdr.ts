/**
 * HPD Multiple Dwelling Registration Ingest (tesw-yqqr + feu5-w2e2)
 *
 * Populates condo_ownership.hpd_registrations and feeds Co_entities + Co_entity_aliases
 * for registered owners, head officers, and managing agents.
 *
 * Creates entity_resolution_edges with edge_type = "hpd_registered_owner" / "hpd_managing_agent"
 * at 0.95 confidence (sworn filings).
 *
 * Schedule: daily incremental
 */

import prisma from "@/lib/prisma";
import { normalizeName, isEntityName } from "@/lib/entity-resolver";

const HPD_REGISTRATIONS_ID = "tesw-yqqr";
const HPD_CONTACTS_ID = "feu5-w2e2";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

export interface HpdMdrResult {
  registrations: number;
  entitiesCreated: number;
  edgesCreated: number;
  errors: number;
  durationMs: number;
}

async function querySoda(datasetId: string, params: Record<string, string>): Promise<any[]> {
  const appToken = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
  const isValid = appToken.length > 0 && !appToken.startsWith("YOUR_");
  const query = new URLSearchParams(params).toString();
  const url = `${NYC_BASE}/${datasetId}.json?${query}`;
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (isValid) headers["X-App-Token"] = appToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  const res = await fetch(url, { headers, signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`SODA ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function padBbl(boro: number, block: number, lot: number): string | null {
  if (!boro || boro < 1 || boro > 5 || !block || !lot) return null;
  return `${boro}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
}

function detectEntityType(name: string): string {
  const upper = name.toUpperCase();
  if (/\bLLC\b/.test(upper)) return "llc";
  if (/\b(INC|CORP|CORPORATION)\b/.test(upper)) return "corp";
  if (/\bTRUST\b/.test(upper)) return "trust";
  if (/\b(LP|LLP|PARTNERSHIP)\b/.test(upper)) return "partnership";
  if (/\bESTATE\b/.test(upper)) return "estate";
  if (isEntityName(name)) return "unknown";
  return "individual";
}

/**
 * Resolve or create a Co_entity for a name from HPD MDR.
 * Returns the entity ID.
 */
async function resolveOrCreateEntity(
  orgId: string,
  name: string,
  source: string,
): Promise<string> {
  const normalized = normalizeName(name);
  const entityType = detectEntityType(name);

  const existing = await prisma.coEntity.findFirst({
    where: { orgId, nameNormalized: normalized },
    select: { id: true },
  });
  if (existing) {
    // Add alias if not already present
    await prisma.coEntityAlias.upsert({
      where: { entityId_aliasNormalized: { entityId: existing.id, aliasNormalized: normalized } },
      create: { entityId: existing.id, alias: name, aliasNormalized: normalized, source },
      update: {},
    });
    return existing.id;
  }

  const created = await prisma.coEntity.create({
    data: {
      orgId,
      canonicalName: name,
      nameNormalized: normalized,
      entityType,
      sources: [source],
      confidence: 0.85,
    },
    select: { id: true },
  });

  // Also create the alias
  await prisma.coEntityAlias.create({
    data: { entityId: created.id, alias: name, aliasNormalized: normalized, source },
  }).catch(() => {}); // ignore dup

  return created.id;
}

/**
 * Create an entity_resolution_edge linking two entities (e.g., LLC → head officer).
 */
async function createEdge(
  sourceEntityId: string,
  targetEntityId: string,
  edgeType: string,
  signalSource: string,
  evidence?: Record<string, any>,
): Promise<boolean> {
  try {
    await prisma.coEntityResolutionEdge.upsert({
      where: {
        sourceEntityId_targetEntityId_edgeType_signalSource: {
          sourceEntityId,
          targetEntityId,
          edgeType,
          signalSource,
        },
      },
      create: {
        sourceEntityId,
        targetEntityId,
        edgeType,
        confidence: 0.95, // sworn filing = high confidence
        signalSource,
        evidence: evidence || null,
      },
      update: {
        confidence: 0.95,
        evidence: evidence || undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function ingestHpdMdr(orgId: string): Promise<HpdMdrResult> {
  const start = Date.now();
  let registrations = 0;
  let entitiesCreated = 0;
  let edgesCreated = 0;
  let errors = 0;
  let offset = 0;

  while (true) {
    let records: any[];
    try {
      records = await querySoda(HPD_REGISTRATIONS_ID, {
        $order: "registrationid ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
    } catch (err) {
      console.error(`[HpdMdr] Fetch error offset=${offset}:`, err);
      errors++;
      break;
    }

    if (records.length === 0) break;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((r) => processRegistration(orgId, r)),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          registrations++;
          entitiesCreated += result.value.entities;
          edgesCreated += result.value.edges;
        } else {
          errors++;
        }
      }
      if (i + BATCH_SIZE < records.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    offset += records.length;
    if (records.length < PAGE_SIZE) break;

    if (offset % 5000 === 0) {
      console.log(`[HpdMdr] Progress: ${offset} registrations, ${entitiesCreated} entities`);
    }
  }

  console.log(
    `[HpdMdr] Complete: ${registrations} registrations, ${entitiesCreated} entities, ` +
    `${edgesCreated} edges, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { registrations, entitiesCreated, edgesCreated, errors, durationMs: Date.now() - start };
}

async function processRegistration(
  orgId: string,
  r: any,
): Promise<{ entities: number; edges: number }> {
  let entities = 0;
  let edges = 0;

  const regId = r.registrationid || r.registration_id;
  if (!regId) return { entities: 0, edges: 0 };

  const boro = parseInt(r.boroid || r.boro || "0");
  const block = parseInt(r.block || "0");
  const lot = parseInt(r.lot || "0");
  const bbl = padBbl(boro, block, lot);

  // Resolve building
  let buildingId: string | null = null;
  if (bbl) {
    const building = await prisma.coBuilding.findFirst({
      where: { orgId, bbl },
      select: { id: true },
    });
    buildingId = building?.id || null;
  }

  const ownerName = r.corporationname || r.ownername || null;
  const agentName = r.managementagent || r.managingagent || null;
  const officerName = r.headofficerfirstname && r.headofficerlastname
    ? `${r.headofficerfirstname} ${r.headofficerlastname}`.trim()
    : null;

  // Upsert registration
  await prisma.coHpdRegistration.upsert({
    where: { orgId_registrationId: { orgId, registrationId: String(regId) } },
    create: {
      orgId,
      buildingId,
      registrationId: String(regId),
      bbl,
      borough: boro || null,
      block: block || null,
      lot: lot || null,
      registeredOwnerName: ownerName,
      registeredOwnerType: r.ownertypechar || null,
      managingAgentName: agentName,
      managingAgentAddress: r.managementagentaddress || null,
      headOfficerName: officerName,
      headOfficerAddress: r.headofficerbusinessaddress || null,
      lastRegistrationDate: r.registrationenddate ? new Date(r.registrationenddate) : null,
      raw: r,
    },
    update: {
      buildingId: buildingId || undefined,
      registeredOwnerName: ownerName || undefined,
      managingAgentName: agentName || undefined,
      headOfficerName: officerName || undefined,
      raw: r,
      updatedAt: new Date(),
    },
  });

  // Create entities and edges for owner, agent, officer
  let ownerEntityId: string | null = null;
  if (ownerName) {
    ownerEntityId = await resolveOrCreateEntity(orgId, ownerName, "hpd_mdr_owner");
    entities++;
  }

  if (agentName) {
    const agentEntityId = await resolveOrCreateEntity(orgId, agentName, "hpd_mdr_agent");
    entities++;
    if (ownerEntityId) {
      const ok = await createEdge(ownerEntityId, agentEntityId, "hpd_managing_agent", "hpd_mdr", {
        registration_id: regId,
        bbl,
      });
      if (ok) edges++;
    }
  }

  if (officerName && ownerEntityId) {
    const officerEntityId = await resolveOrCreateEntity(orgId, officerName, "hpd_mdr_officer");
    entities++;
    const ok = await createEdge(ownerEntityId, officerEntityId, "principal_of", "hpd_mdr", {
      registration_id: regId,
      role: "head_officer",
      bbl,
    });
    if (ok) edges++;
  }

  return { entities, edges };
}
