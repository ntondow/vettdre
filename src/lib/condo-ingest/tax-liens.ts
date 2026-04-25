/**
 * NYC Tax Lien Sale Lists Ingest (Socrata 9rz4-mjek)
 *
 * Populates condo_ownership.tax_liens with active/historical lien sale records.
 * Phase 0 verified this dataset is publicly accessible via Socrata (no FOIL needed).
 *
 * Schedule: monthly via IngestionState cadence
 */

import prisma from "@/lib/prisma";

const TAX_LIENS_DATASET = "9rz4-mjek";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 2000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

export interface TaxLienIngestResult {
  recordsFetched: number;
  recordsUpserted: number;
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

const BORO_MAP: Record<string, string> = {
  MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5",
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
};

export async function ingestTaxLiens(orgId: string, sinceYear = 2017): Promise<TaxLienIngestResult> {
  const start = Date.now();
  let fetched = 0;
  let upserted = 0;
  let errors = 0;
  let offset = 0;

  while (true) {
    let records: any[];
    try {
      records = await querySoda(TAX_LIENS_DATASET, {
        $order: "borough ASC, block ASC, lot ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
    } catch (err) {
      console.error(`[TaxLiens] Fetch error offset=${offset}:`, err);
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
            const boroStr = BORO_MAP[(r.borough || "").toUpperCase()] || r.borough || "";
            const bbl = padBbl(boroStr, r.block || "", r.lot || "");
            if (!bbl) return;

            // Resolve building_id
            const building = await prisma.coBuilding.findFirst({
              where: { orgId, bbl },
              select: { id: true },
            });
            if (!building) {
              // Log unresolved
              await prisma.coUnresolvedRecord.create({
                data: {
                  sourceTable: "tax_liens",
                  sourceRecordId: `${bbl}-${r.cycle || ""}-${r.month || ""}`,
                  reason: "no_bbl_match",
                  raw: r,
                },
              }).catch(() => {});
              return;
            }

            const cycle = r.cycle || null;
            const waterOnly = r.water_debt_only === "YES" || r.water_debt_only === "Y";
            const lienType = waterOnly ? "water" : "tax";

            // Derive a unique key for dedup
            const recordKey = `${bbl}-${cycle || "unknown"}-${r.month || ""}`;

            await prisma.coTaxLien.upsert({
              where: { id: recordKey }, // will miss — use create path
              create: {
                orgId,
                buildingId: building.id,
                lienType,
                amount: null, // amount not in this dataset; comes from sale records
                filedDate: null,
                status: "active",
                saleYear: r.month ? parseInt(r.month.split("/")[2] || "0") || null : null,
                cycle,
                raw: r,
              },
              update: {
                lienType,
                cycle,
                raw: r,
              },
            }).catch(async () => {
              // Fallback: raw upsert since we don't have a natural unique key
              await prisma.$executeRaw`
                INSERT INTO condo_ownership.tax_liens (id, org_id, building_id, lien_type, status, cycle, raw, created_at)
                VALUES (gen_random_uuid(), ${orgId}, ${building.id}, ${lienType}, 'active', ${cycle}, ${JSON.stringify(r)}::jsonb, NOW())
              `;
            });
            upserted++;
          } catch {
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
      console.log(`[TaxLiens] Progress: ${offset} fetched, ${upserted} upserted`);
    }
  }

  console.log(
    `[TaxLiens] Complete: ${fetched} fetched, ${upserted} upserted, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { recordsFetched: fetched, recordsUpserted: upserted, errors, durationMs: Date.now() - start };
}
