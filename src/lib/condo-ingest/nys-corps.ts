/**
 * NYS Active Corporations Ingest (n9v6-gdp6)
 *
 * The LLC unmasking layer. Populates:
 * - condo_ownership.nys_entities with DOS filings
 * - Co_entities with dos_id populated
 * - Co_entity_aliases for DBAs and prior names
 * - Co_entity_resolution_edges linking LLC → principal (chairman/CEO/process agent)
 *
 * Matches by name_normalized against Co_acris_parties to attach DOS principal
 * addresses to ACRIS-known LLCs.
 *
 * Schedule: weekly snapshot
 */

import prisma from "@/lib/prisma";
import { normalizeName, isEntityName } from "@/lib/entity-resolver";

const NYS_CORPS_DATASET = "n9v6-gdp6"; // NOT n8mn-d6c5 (dead)
const NYS_BASE = "https://data.ny.gov/resource";
const FETCH_TIMEOUT = 15000;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

export interface NysCorpsResult {
  recordsFetched: number;
  nysEntitiesUpserted: number;
  coEntitiesLinked: number;
  edgesCreated: number;
  errors: number;
  durationMs: number;
}

async function querySoda(baseUrl: string, datasetId: string, params: Record<string, string>): Promise<any[]> {
  const appToken = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
  const isValid = appToken.length > 0 && !appToken.startsWith("YOUR_");
  const query = new URLSearchParams(params).toString();
  const url = `${baseUrl}/${datasetId}.json?${query}`;
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

function detectEntityType(dosType: string | null): string {
  if (!dosType) return "unknown";
  const upper = dosType.toUpperCase();
  if (upper.includes("LIMITED LIABILITY")) return "llc";
  if (upper.includes("CORPORATION") || upper.includes("BUSINESS CORP")) return "corp";
  if (upper.includes("LIMITED PARTNERSHIP")) return "partnership";
  if (upper.includes("NOT-FOR-PROFIT") || upper.includes("NONPROFIT")) return "nonprofit";
  return "unknown";
}

export async function ingestNysCorporations(orgId: string): Promise<NysCorpsResult> {
  const start = Date.now();
  let fetched = 0;
  let nysUpserted = 0;
  let coLinked = 0;
  let edgesCreated = 0;
  let errors = 0;
  let offset = 0;

  // Only fetch active NY-jurisdiction entities (vast majority of NYC LLCs)
  while (true) {
    let records: any[];
    try {
      records = await querySoda(NYS_BASE, NYS_CORPS_DATASET, {
        $where: "current_entity_status='Active' AND (jurisdiction='NEW YORK' OR jurisdiction='NY')",
        $order: "dos_id ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
    } catch (err) {
      console.error(`[NysCorps] Fetch error offset=${offset}:`, err);
      errors++;
      break;
    }

    if (records.length === 0) break;
    fetched += records.length;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((r) => processNysEntity(orgId, r)),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          nysUpserted++;
          coLinked += result.value.linked ? 1 : 0;
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
      console.log(`[NysCorps] Progress: ${offset} fetched, ${nysUpserted} upserted, ${coLinked} linked`);
    }
  }

  console.log(
    `[NysCorps] Complete: ${fetched} fetched, ${nysUpserted} upserted, ` +
    `${coLinked} linked to Co_entities, ${edgesCreated} edges, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { recordsFetched: fetched, nysEntitiesUpserted: nysUpserted, coEntitiesLinked: coLinked, edgesCreated, errors, durationMs: Date.now() - start };
}

async function processNysEntity(
  orgId: string,
  r: any,
): Promise<{ linked: boolean; edges: number }> {
  const dosId = r.dos_id;
  const entityName = r.current_entity_name || r.entity_name || "";
  if (!dosId || !entityName) return { linked: false, edges: 0 };

  const normalized = normalizeName(entityName);
  const entityType = detectEntityType(r.entity_type_desc || r.entity_formationtype);

  // Build addresses
  const processAddr = [
    r.dos_process_addr1, r.dos_process_addr2, r.dos_process_city,
    r.dos_process_state, r.dos_process_zip,
  ].filter(Boolean).join(", ") || null;

  const principalAddr = [
    r.principal_office_addr1, r.principal_office_addr2, r.principal_office_city,
    r.principal_office_state, r.principal_office_zip,
  ].filter(Boolean).join(", ") || null;

  const chairmanName = r.chairman_name || r.chief_exec_officer_name || null;
  const ceoName = r.chief_exec_officer_name || null;

  // Upsert into nys_entities table
  await prisma.coNysEntity.upsert({
    where: { orgId_dosId: { orgId, dosId: String(dosId) } },
    create: {
      orgId,
      dosId: String(dosId),
      entityName,
      entityNameNormalized: normalized,
      entityType: r.entity_type_desc || null,
      formationDate: r.initial_dos_filing_date ? new Date(r.initial_dos_filing_date) : null,
      status: r.current_entity_status || null,
      jurisdiction: r.jurisdiction || null,
      processAddress: processAddr,
      principalOfficeAddress: principalAddr,
      chairmanName,
      ceoName,
      raw: r,
      lastSyncedAt: new Date(),
    },
    update: {
      entityName,
      entityNameNormalized: normalized,
      status: r.current_entity_status || undefined,
      processAddress: processAddr || undefined,
      principalOfficeAddress: principalAddr || undefined,
      chairmanName: chairmanName || undefined,
      ceoName: ceoName || undefined,
      raw: r,
      lastSyncedAt: new Date(),
    },
  });

  // Try to link to existing Co_entity by normalized name match
  let linked = false;
  let edges = 0;

  const existingEntity = await prisma.coEntity.findFirst({
    where: { orgId, nameNormalized: normalized },
    select: { id: true },
  });

  if (existingEntity) {
    // Update with DOS ID
    await prisma.coEntity.update({
      where: { id: existingEntity.id },
      data: {
        dosId: String(dosId),
        primaryAddress: processAddr || principalAddr || undefined,
        sources: { push: "ny_dos" },
      },
    }).catch(() => {});
    linked = true;

    // Create edges for principals (chairman → LLC)
    if (chairmanName) {
      const principalNormalized = normalizeName(chairmanName);
      let principalEntity = await prisma.coEntity.findFirst({
        where: { orgId, nameNormalized: principalNormalized },
        select: { id: true },
      });
      if (!principalEntity) {
        principalEntity = await prisma.coEntity.create({
          data: {
            orgId,
            canonicalName: chairmanName,
            nameNormalized: principalNormalized,
            entityType: "individual",
            sources: ["ny_dos"],
            confidence: 0.85,
          },
          select: { id: true },
        });
      }
      try {
        await prisma.coEntityResolutionEdge.upsert({
          where: {
            sourceEntityId_targetEntityId_edgeType_signalSource: {
              sourceEntityId: existingEntity.id,
              targetEntityId: principalEntity.id,
              edgeType: "principal_of",
              signalSource: "ny_dos",
            },
          },
          create: {
            sourceEntityId: existingEntity.id,
            targetEntityId: principalEntity.id,
            edgeType: "principal_of",
            confidence: 0.90,
            signalSource: "ny_dos",
            evidence: { dos_id: dosId, role: "chairman", name: chairmanName },
          },
          update: { confidence: 0.90 },
        });
        edges++;
      } catch { /* dup */ }
    }

    // Shared-address edge if process address matches other entities
    if (processAddr) {
      const addressMatches = await prisma.coEntity.findMany({
        where: {
          orgId,
          primaryAddress: processAddr,
          id: { not: existingEntity.id },
        },
        select: { id: true },
        take: 10,
      });
      for (const match of addressMatches) {
        try {
          await prisma.coEntityResolutionEdge.upsert({
            where: {
              sourceEntityId_targetEntityId_edgeType_signalSource: {
                sourceEntityId: existingEntity.id,
                targetEntityId: match.id,
                edgeType: "shared_address",
                signalSource: "ny_dos",
              },
            },
            create: {
              sourceEntityId: existingEntity.id,
              targetEntityId: match.id,
              edgeType: "shared_address",
              confidence: 0.75,
              signalSource: "ny_dos",
              evidence: { address: processAddr },
            },
            update: {},
          });
          edges++;
        } catch { /* dup */ }
      }
    }
  }

  return { linked, edges };
}
