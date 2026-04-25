/**
 * OFAC SDN (Specially Designated Nationals) List Ingest
 *
 * Daily snapshot from https://sanctionslist.ofac.treas.gov/
 * Matches against Co_entities by normalized name.
 * Populates Co_entities.ofac_sdn_id + resolution_edge with edge_type='ofac_sanctions_match'.
 *
 * A single match is high-value (sanctioned entity owning NYC real estate).
 *
 * Schedule: weekly refresh
 */

import prisma from "@/lib/prisma";
import { normalizeName, jaroWinklerSimilarity } from "@/lib/entity-resolver";

const MATCH_THRESHOLD = 0.95; // higher threshold than ICIJ — sanctions matches must be very confident
const BATCH_SIZE = 50;

export interface OfacIngestResult {
  entitiesLoaded: number;
  matchesFound: number;
  edgesCreated: number;
  errors: number;
  durationMs: number;
}

/**
 * Ingest OFAC SDN entries from a pre-parsed JSON array.
 * Expected shape: { sdn_id, name, type, program, addresses: [], aliases: [], ... }
 *
 * The caller downloads and parses the XML/CSV from treasury.gov.
 * This function handles DB writes and entity matching.
 */
export async function ingestOfacSdn(
  orgId: string,
  records: Array<{
    sdn_id: string;
    name: string;
    type?: string;
    program?: string;
    country?: string;
    designation_date?: string;
    addresses?: Array<{ address: string; city?: string; country?: string }>;
    aliases?: string[];
    [key: string]: any;
  }>,
): Promise<OfacIngestResult> {
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
          const sdnId = String(r.sdn_id);
          const name = r.name?.trim();
          if (!sdnId || !name) return;

          const normalized = normalizeName(name);

          await prisma.coOfacSdn.upsert({
            where: { sdnId },
            create: {
              sdnId,
              name,
              nameNormalized: normalized,
              aliases: r.aliases ? { aliases: r.aliases } : null,
              addresses: r.addresses ? { addresses: r.addresses } : null,
              country: r.country || null,
              program: r.program || null,
              designationDate: r.designation_date ? new Date(r.designation_date) : null,
              entityType: r.type || null,
              raw: r,
              lastSyncedAt: new Date(),
            },
            update: {
              name,
              nameNormalized: normalized,
              aliases: r.aliases ? { aliases: r.aliases } : undefined,
              program: r.program || undefined,
              raw: r,
              lastSyncedAt: new Date(),
            },
          });
          loaded++;

          // Match against existing Co_entities
          const candidates = await prisma.coEntity.findMany({
            where: { orgId, nameNormalized: { startsWith: normalized.slice(0, 3) } },
            select: { id: true, nameNormalized: true, canonicalName: true },
            take: 50,
          });

          for (const candidate of candidates) {
            const similarity = jaroWinklerSimilarity(normalized, candidate.nameNormalized);
            if (similarity >= MATCH_THRESHOLD) {
              matchesFound++;

              await prisma.coEntity.update({
                where: { id: candidate.id },
                data: { ofacSdnId: sdnId },
              }).catch(() => {});

              try {
                await prisma.coEntityResolutionEdge.create({
                  data: {
                    sourceEntityId: candidate.id,
                    targetEntityId: candidate.id,
                    edgeType: "ofac_sanctions_match",
                    confidence: Number(similarity.toFixed(3)),
                    signalSource: "ofac_sdn",
                    evidence: {
                      sdn_id: sdnId,
                      ofac_name: name,
                      program: r.program,
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

    if (i % 1000 === 0 && i > 0) {
      console.log(`[OFAC] Progress: ${i}/${records.length}, ${matchesFound} matches`);
    }
  }

  console.log(
    `[OFAC] Complete: ${loaded} loaded, ${matchesFound} matches, ` +
    `${edgesCreated} edges, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { entitiesLoaded: loaded, matchesFound, edgesCreated, errors, durationMs: Date.now() - start };
}
