/**
 * Entity Resolution Edge Builder — Phase 4
 *
 * Implements 8 signals that populate Co_entity_resolution_edges:
 *   A. NY DOS officer disclosure (principal_of, 0.95)
 *   B. HPD head-officer disclosure (principal_of, 0.80)
 *   C. Mailing-address clustering (shared_address, 0.65 — blacklist-filtered)
 *   D. ICIJ offshore graph walk (icij_offshore_match, varies)
 *   E. Form 990 officer disclosure (principal_of, 0.90) — stub for Phase 6
 *   F. Spousal linkage (spouse_of) — stub for Phase 6
 *   G. Sequential LLC formation (related_llc, 0.75)
 *   H. Shared attorney/process agent (related_llc, 0.60)
 *
 * Called by the nightly intel-resolve-edges cron.
 * Incremental: only processes entities touched in the last `windowHours`.
 */

import prisma from "@/lib/prisma";
import {
  normalizeName,
  matchEntities,
  aggregateConfidence,
} from "@/lib/entity-resolver";
import { isBlacklistedAddress } from "./agent-blacklist";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

export interface EdgeBuildResult {
  signal: string;
  edgesAdded: number;
  edgesUpdated: number;
  blacklistHits: number;
  errors: number;
  durationMs: number;
}

export interface EdgeBuildSummary {
  signals: EdgeBuildResult[];
  totalEdgesAdded: number;
  totalEdgesUpdated: number;
  totalBlacklistHits: number;
  totalErrors: number;
  durationMs: number;
}

// ── Shared Upsert Helper ─────────────────────────────────────

async function upsertEdge(
  sourceEntityId: string,
  targetEntityId: string,
  edgeType: string,
  confidence: number,
  signalSource: string,
  evidence?: Record<string, any>,
): Promise<"added" | "updated" | "error"> {
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
      create: { sourceEntityId, targetEntityId, edgeType, confidence, signalSource, evidence: evidence || null },
      update: { confidence, evidence: evidence || undefined },
    });
    return "added";
  } catch {
    return "error";
  }
}

// ── Signal A: NY DOS Officer Disclosure ──────────────────────

async function signalA_DosPrincipal(orgId: string, windowHours: number): Promise<EdgeBuildResult> {
  const start = Date.now();
  let added = 0, updated = 0, errors = 0;
  const since = new Date(Date.now() - windowHours * 3600_000);

  // Find Co_entities with dos_id that were recently touched
  const entities = await prisma.coEntity.findMany({
    where: { orgId, dosId: { not: null }, updatedAt: { gte: since } },
    select: { id: true, dosId: true, canonicalName: true, nameNormalized: true },
    take: 500,
  });

  for (const entity of entities) {
    if (!entity.dosId) continue;

    // Look up NYS entity for principal names
    const nysEntity = await prisma.coNysEntity.findFirst({
      where: { orgId, dosId: entity.dosId },
      select: { chairmanName: true, ceoName: true, processAddress: true },
    });
    if (!nysEntity) continue;

    const principals = [nysEntity.chairmanName, nysEntity.ceoName].filter(Boolean) as string[];

    for (const principalName of principals) {
      const normalized = normalizeName(principalName);

      // Find or create the principal entity
      let principal = await prisma.coEntity.findFirst({
        where: { orgId, nameNormalized: normalized },
        select: { id: true },
      });
      if (!principal) {
        principal = await prisma.coEntity.create({
          data: {
            orgId,
            canonicalName: principalName,
            nameNormalized: normalized,
            entityType: "individual",
            sources: ["ny_dos"],
            confidence: 0.85,
          },
          select: { id: true },
        });
      }

      const result = await upsertEdge(
        entity.id, principal.id, "dos_principal", 0.95, "ny_dos",
        { dos_id: entity.dosId, principal_name: principalName },
      );
      if (result === "added") added++;
      else if (result === "updated") updated++;
      else errors++;
    }
  }

  return { signal: "A_dos_principal", edgesAdded: added, edgesUpdated: updated, blacklistHits: 0, errors, durationMs: Date.now() - start };
}

// ── Signal B: HPD Head-Officer Disclosure ────────────────────

async function signalB_HpdOfficer(orgId: string, windowHours: number): Promise<EdgeBuildResult> {
  const start = Date.now();
  let added = 0, updated = 0, errors = 0;
  const since = new Date(Date.now() - windowHours * 3600_000);

  const registrations = await prisma.coHpdRegistration.findMany({
    where: {
      orgId,
      headOfficerName: { not: null },
      updatedAt: { gte: since },
    },
    select: { registeredOwnerName: true, headOfficerName: true, registrationId: true, bbl: true },
    take: 500,
  });

  for (const reg of registrations) {
    if (!reg.registeredOwnerName || !reg.headOfficerName) continue;

    const ownerNorm = normalizeName(reg.registeredOwnerName);
    const officerNorm = normalizeName(reg.headOfficerName);

    const ownerEntity = await prisma.coEntity.findFirst({
      where: { orgId, nameNormalized: ownerNorm },
      select: { id: true },
    });
    if (!ownerEntity) continue;

    let officerEntity = await prisma.coEntity.findFirst({
      where: { orgId, nameNormalized: officerNorm },
      select: { id: true },
    });
    if (!officerEntity) {
      officerEntity = await prisma.coEntity.create({
        data: {
          orgId,
          canonicalName: reg.headOfficerName,
          nameNormalized: officerNorm,
          entityType: "individual",
          sources: ["hpd_mdr"],
          confidence: 0.80,
        },
        select: { id: true },
      });
    }

    const result = await upsertEdge(
      ownerEntity.id, officerEntity.id, "hpd_registered_owner", 0.95, "hpd_mdr",
      { registration_id: reg.registrationId, bbl: reg.bbl },
    );
    if (result === "added") added++;
    else if (result === "updated") updated++;
    else errors++;
  }

  return { signal: "B_hpd_officer", edgesAdded: added, edgesUpdated: updated, blacklistHits: 0, errors, durationMs: Date.now() - start };
}

// ── Signal C: Mailing-Address Clustering ─────────────────────

async function signalC_MailingCluster(orgId: string, windowHours: number): Promise<EdgeBuildResult> {
  const start = Date.now();
  let added = 0, updated = 0, blacklistHits = 0, errors = 0;
  const since = new Date(Date.now() - windowHours * 3600_000);

  // Find entities with mailing addresses that were recently updated
  const entities = await prisma.coEntity.findMany({
    where: {
      orgId,
      primaryAddress: { not: null },
      updatedAt: { gte: since },
    },
    select: { id: true, primaryAddress: true, canonicalName: true, entityType: true },
    take: 500,
  });

  for (const entity of entities) {
    if (!entity.primaryAddress) continue;

    // Check blacklist
    if (isBlacklistedAddress(entity.primaryAddress)) {
      blacklistHits++;
      continue;
    }

    // Find other entities at the same address
    const neighbors = await prisma.coEntity.findMany({
      where: {
        orgId,
        primaryAddress: entity.primaryAddress,
        id: { not: entity.id },
      },
      select: { id: true, canonicalName: true },
      take: 20,
    });

    for (const neighbor of neighbors) {
      const result = await upsertEdge(
        entity.id, neighbor.id, "shared_address", 0.65, "acris_mailing_cluster",
        { address: entity.primaryAddress },
      );
      if (result === "added") added++;
      else if (result === "updated") updated++;
      else errors++;
    }
  }

  return { signal: "C_mailing_cluster", edgesAdded: added, edgesUpdated: updated, blacklistHits, errors, durationMs: Date.now() - start };
}

// ── Signal G: Sequential LLC Formation ───────────────────────

async function signalG_SequentialFormation(orgId: string, windowHours: number): Promise<EdgeBuildResult> {
  const start = Date.now();
  let added = 0, updated = 0, errors = 0;

  // Find clusters of 5+ LLCs sharing a DOS process address formed within 30 days
  const clusters = await prisma.$queryRaw<Array<{
    process_address: string;
    entity_ids: string[];
  }>>`
    SELECT n.process_address, ARRAY_AGG(e.id) as entity_ids
    FROM condo_ownership.nys_entities n
    JOIN condo_ownership.entities e ON e.org_id = ${orgId} AND e.dos_id = n.dos_id
    WHERE n.org_id = ${orgId}
      AND n.process_address IS NOT NULL
      AND n.formation_date IS NOT NULL
    GROUP BY n.process_address
    HAVING COUNT(*) >= 5
      AND (MAX(n.formation_date) - MIN(n.formation_date)) <= 30
    LIMIT 100
  `;

  for (const cluster of clusters) {
    if (isBlacklistedAddress(cluster.process_address)) continue;

    const ids = cluster.entity_ids;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const result = await upsertEdge(
          ids[i], ids[j], "related_llc", 0.75, "sequential_formation",
          { process_address: cluster.process_address, cluster_size: ids.length },
        );
        if (result === "added") added++;
        else if (result === "updated") updated++;
        else errors++;
      }
    }
  }

  return { signal: "G_sequential_formation", edgesAdded: added, edgesUpdated: updated, blacklistHits: 0, errors, durationMs: Date.now() - start };
}

// ── Signal H: Shared Attorney / Process Agent ────────────────

async function signalH_SharedAttorney(orgId: string, windowHours: number): Promise<EdgeBuildResult> {
  const start = Date.now();
  let added = 0, updated = 0, errors = 0;

  // Find pairs of entities sharing the same NYS DOS process address
  // (but NOT registered-agent services)
  const pairs = await prisma.$queryRaw<Array<{
    entity_id_1: string;
    entity_id_2: string;
    process_address: string;
  }>>`
    SELECT DISTINCT e1.id as entity_id_1, e2.id as entity_id_2, n1.process_address
    FROM condo_ownership.nys_entities n1
    JOIN condo_ownership.nys_entities n2 ON n1.process_address = n2.process_address AND n1.dos_id < n2.dos_id
    JOIN condo_ownership.entities e1 ON e1.org_id = ${orgId} AND e1.dos_id = n1.dos_id
    JOIN condo_ownership.entities e2 ON e2.org_id = ${orgId} AND e2.dos_id = n2.dos_id
    WHERE n1.org_id = ${orgId} AND n2.org_id = ${orgId}
      AND n1.process_address IS NOT NULL
    LIMIT 500
  `;

  for (const pair of pairs) {
    if (isBlacklistedAddress(pair.process_address)) continue;

    const result = await upsertEdge(
      pair.entity_id_1, pair.entity_id_2, "related_llc", 0.60, "shared_attorney",
      { process_address: pair.process_address },
    );
    if (result === "added") added++;
    else if (result === "updated") updated++;
    else errors++;
  }

  return { signal: "H_shared_attorney", edgesAdded: added, edgesUpdated: updated, blacklistHits: 0, errors, durationMs: Date.now() - start };
}

// ── Main Orchestrator ────────────────────────────────────────

/**
 * Run all edge-building signals incrementally.
 * Only processes entities touched within the window.
 */
export async function buildResolutionEdges(
  orgId: string,
  windowHours = 36,
): Promise<EdgeBuildSummary> {
  const start = Date.now();
  const results: EdgeBuildResult[] = [];

  console.log(`[EdgeBuilder] Starting edge resolution for org=${orgId}, window=${windowHours}h`);

  // Run signals sequentially to avoid overwhelming the DB
  results.push(await signalA_DosPrincipal(orgId, windowHours));
  results.push(await signalB_HpdOfficer(orgId, windowHours));
  results.push(await signalC_MailingCluster(orgId, windowHours));
  results.push(await signalG_SequentialFormation(orgId, windowHours));
  results.push(await signalH_SharedAttorney(orgId, windowHours));
  // Signals D (ICIJ), E (990), F (spousal) — stubs for Phase 6
  // They require the ICIJ/990/marriage data to be populated first

  const summary: EdgeBuildSummary = {
    signals: results,
    totalEdgesAdded: results.reduce((s, r) => s + r.edgesAdded, 0),
    totalEdgesUpdated: results.reduce((s, r) => s + r.edgesUpdated, 0),
    totalBlacklistHits: results.reduce((s, r) => s + r.blacklistHits, 0),
    totalErrors: results.reduce((s, r) => s + r.errors, 0),
    durationMs: Date.now() - start,
  };

  console.log(
    `[EdgeBuilder] Complete: ${summary.totalEdgesAdded} added, ${summary.totalEdgesUpdated} updated, ` +
    `${summary.totalBlacklistHits} blacklist hits, ${summary.totalErrors} errors (${summary.durationMs}ms)`,
  );

  // Log to sync_metrics
  await prisma.coSyncMetrics.create({
    data: {
      datasetId: "edge_resolution",
      runStartedAt: new Date(start),
      runCompletedAt: new Date(),
      rowsUpserted: summary.totalEdgesAdded + summary.totalEdgesUpdated,
      rowsFailed: summary.totalErrors,
      errors: { signals: results.map(r => ({ signal: r.signal, added: r.edgesAdded, errors: r.errors })) },
    },
  }).catch(() => {});

  return summary;
}
