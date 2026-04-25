/**
 * ICIJ Offshore Leaks Database Ingest
 *
 * One-time bulk download from https://offshoreleaks.icij.org/pages/database
 * Fuzzy-matches against Co_entities (Jaro-Winkler > 0.92).
 * Populates Co_entities.icij_node_id + resolution_edge with edge_type='icij_offshore_match'.
 *
 * ── RUNBOOK ──
 * This is NOT a cron job. Run manually:
 *   1. Download the ICIJ bulk data JSON from https://offshoreleaks.icij.org/pages/database
 *   2. Parse the entities JSON file(s) into an array of records
 *   3. Call ingestIcijEntities(orgId, records) from a script
 *   4. Refresh quarterly — re-download and re-run
 *
 * No /api/intel/icij-sync route exists by design. The bulk data is ~5GB
 * and requires manual download (no stable API endpoint for automated fetch).
 */

import prisma from "@/lib/prisma";
import { normalizeName, jaroWinklerSimilarity } from "@/lib/entity-resolver";

const MATCH_THRESHOLD = 0.92;
const BATCH_SIZE = 50;

export interface IcijIngestResult {
  entitiesLoaded: number;
  matchesFound: number;
  edgesCreated: number;
  errors: number;
  durationMs: number;
}

/**
 * Ingest ICIJ entities from a pre-downloaded JSON array.
 * Expected shape per record: { node_id, name, entity_type, jurisdiction, source, address, ... }
 *
 * The caller is responsible for downloading and parsing the ICIJ bulk data.
 * This function handles the DB writes and entity matching.
 */
export async function ingestIcijEntities(
  orgId: string,
  records: Array<{
    node_id: string;
    name: string;
    entity_type?: string;
    jurisdiction?: string;
    source?: string;
    address?: string;
    officers?: any;
    intermediaries?: any;
    [key: string]: any;
  }>,
): Promise<IcijIngestResult> {
  const start = Date.now();
  let loaded = 0;
  let matchesFound = 0;
  let edgesCreated = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (r) => {
        try {
          const nodeId = String(r.node_id);
          const name = r.name?.trim();
          if (!nodeId || !name) return;

          const normalized = normalizeName(name);

          // Upsert ICIJ entity
          await prisma.coIcijEntity.upsert({
            where: { nodeId },
            create: {
              nodeId,
              entityName: name,
              nameNormalized: normalized,
              entityType: r.entity_type || null,
              jurisdiction: r.jurisdiction || null,
              sourceLeak: r.source || "unknown",
              address: r.address || null,
              officers: r.officers || null,
              intermediaries: r.intermediaries || null,
              raw: r,
            },
            update: {
              entityName: name,
              nameNormalized: normalized,
              address: r.address || undefined,
              raw: r,
            },
          });
          loaded++;

          // Fuzzy match against existing Co_entities
          const candidates = await prisma.coEntity.findMany({
            where: { orgId, nameNormalized: { startsWith: normalized.slice(0, 3) } },
            select: { id: true, canonicalName: true, nameNormalized: true },
            take: 100,
          });

          for (const candidate of candidates) {
            const similarity = jaroWinklerSimilarity(normalized, candidate.nameNormalized);
            if (similarity >= MATCH_THRESHOLD) {
              matchesFound++;

              // Update Co_entity with ICIJ node ID
              await prisma.coEntity.update({
                where: { id: candidate.id },
                data: { icijNodeId: nodeId },
              }).catch(() => {});

              // Create resolution edge
              try {
                await prisma.coEntityResolutionEdge.create({
                  data: {
                    sourceEntityId: candidate.id,
                    targetEntityId: candidate.id, // self-reference: the match IS the same entity
                    edgeType: "icij_offshore_match",
                    confidence: Number(similarity.toFixed(3)),
                    signalSource: "icij",
                    evidence: {
                      icij_node_id: nodeId,
                      icij_name: name,
                      source_leak: r.source,
                      jaro_winkler: similarity,
                    },
                  },
                });
                edgesCreated++;
              } catch { /* dup */ }
            }
          }
        } catch {
          errors++;
        }
      }),
    );

    if (i % 500 === 0 && i > 0) {
      console.log(`[ICIJ] Progress: ${i}/${records.length}, ${matchesFound} matches`);
    }
  }

  console.log(
    `[ICIJ] Complete: ${loaded} loaded, ${matchesFound} matches, ` +
    `${edgesCreated} edges, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { entitiesLoaded: loaded, matchesFound, edgesCreated, errors, durationMs: Date.now() - start };
}
