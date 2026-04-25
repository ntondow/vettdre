/**
 * DOF Property Exemption Detail Ingest (muvi-b6kx)
 *
 * Populates condo_ownership.property_exemptions with STAR/SCRIE/DRIE/421a/J-51 data.
 * Derives primary_residence_flag and propagates to unit_ownership_current.
 *
 * Schedule: weekly snapshot
 */

import prisma from "@/lib/prisma";

const DOF_EXEMPTIONS_DATASET = "muvi-b6kx";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 2000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

/** Exemption codes that indicate primary residence / owner-occupied */
const PRIMARY_RESIDENCE_CODES = new Set([
  "41101", "41111", "41121", "41131", // STAR basic
  "41401", "41411", "41421", "41431", // STAR enhanced
  "41801",                             // SCRIE (Senior Citizen Rent Increase Exemption)
  "41901",                             // DRIE (Disabled Rent Increase Exemption)
]);

/** Exemption type categories for display */
function classifyExemption(code: string): string {
  if (code.startsWith("411")) return "STAR";
  if (code.startsWith("414")) return "STAR_ENHANCED";
  if (code.startsWith("418")) return "SCRIE";
  if (code.startsWith("419")) return "DRIE";
  if (code.startsWith("421")) return "421a";
  if (code.startsWith("420") || code.startsWith("422")) return "J-51";
  return "OTHER";
}

export interface ExemptionIngestResult {
  recordsFetched: number;
  recordsUpserted: number;
  residenceFlagsSet: number;
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

function padBbl(boro: string, block: string, lot: string): string | null {
  const b = parseInt(boro);
  if (!b || b < 1 || b > 5) return null;
  const blk = block?.replace(/^0+/, "") || "";
  const lt = lot?.replace(/^0+/, "") || "";
  if (!blk || !lt) return null;
  return `${b}${blk.padStart(5, "0")}${lt.padStart(4, "0")}`;
}

export async function ingestPropertyExemptions(orgId: string): Promise<ExemptionIngestResult> {
  const start = Date.now();
  let fetched = 0;
  let upserted = 0;
  let residenceFlags = 0;
  let errors = 0;
  let offset = 0;

  // Track BBLs with primary residence exemptions for batch update
  const primaryResidenceBbls = new Set<string>();

  while (true) {
    let records: any[];
    try {
      records = await querySoda(DOF_EXEMPTIONS_DATASET, {
        $order: "boro ASC, block ASC, lot ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
    } catch (err) {
      console.error(`[Exemptions] Fetch error offset=${offset}:`, err);
      errors++;
      break;
    }

    if (records.length === 0) break;
    fetched += records.length;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (r) => {
          try {
            const bbl = padBbl(
              r.boro || r.borough || "",
              r.block || "",
              r.lot || "",
            );
            if (!bbl) return;

            const code = r.exmp_code || r.exemption_code || "";
            const taxYear = parseInt(r.tax_year || r.fy || "0") || null;
            const isPrimary = PRIMARY_RESIDENCE_CODES.has(code);
            const exemptionType = classifyExemption(code);

            // Resolve building_id
            const building = await prisma.coBuilding.findFirst({
              where: { orgId, bbl },
              select: { id: true },
            });

            await prisma.coPropertyExemption.upsert({
              where: {
                orgId_bbl_exemptionCode_taxYear: {
                  orgId,
                  bbl,
                  exemptionCode: code,
                  taxYear: taxYear || 0,
                },
              },
              create: {
                orgId,
                buildingId: building?.id || null,
                bbl,
                exemptionCode: code,
                exemptionType,
                taxYear,
                ownerName: r.owner_name || null,
                primaryResidence: isPrimary,
                raw: r,
              },
              update: {
                exemptionType,
                ownerName: r.owner_name || undefined,
                primaryResidence: isPrimary,
                raw: r,
              },
            });
            upserted++;

            if (isPrimary) primaryResidenceBbls.add(bbl);
          } catch (err) {
            errors++;
          }
        }),
      );

      if (i + BATCH_SIZE < records.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    offset += records.length;
    if (records.length < PAGE_SIZE) break;

    if (offset % 10000 === 0) {
      console.log(`[Exemptions] Progress: ${offset} fetched, ${upserted} upserted`);
    }
  }

  // Propagate primary_residence_flag to unit_ownership_current
  for (const bbl of primaryResidenceBbls) {
    try {
      const result = await prisma.$executeRaw`
        UPDATE condo_ownership.unit_ownership_current uoc
        SET primary_residence_flag = TRUE
        FROM condo_ownership.units u
        WHERE uoc.unit_id = u.id
          AND u.unit_bbl = ${bbl}
          AND uoc.org_id = ${orgId}
          AND (uoc.primary_residence_flag IS NULL OR uoc.primary_residence_flag = FALSE)
      `;
      if (result > 0) residenceFlags += result;
    } catch { /* continue */ }
  }

  console.log(
    `[Exemptions] Complete: ${fetched} fetched, ${upserted} upserted, ` +
    `${residenceFlags} residence flags set, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { recordsFetched: fetched, recordsUpserted: upserted, residenceFlagsSet: residenceFlags, errors, durationMs: Date.now() - start };
}
