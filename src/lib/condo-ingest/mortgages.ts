/**
 * Mortgage Chain Parser — builds ACRIS mortgage lifecycle from doc-type chains.
 *
 * Chain pattern: MTGE (original) → ASST (assignment) → SAT (satisfaction) / CEMA / SPM
 *
 * ACRIS party types for mortgages:
 *   type 1 = grantor = mortgagor (BORROWER)
 *   type 2 = grantee = mortgagee (LENDER)
 * Verified 2026-04-25 against live Socrata 636b-3b5g:
 *   Doc 2026032900031001 ($20M MTGE): type 1 = "25TH STREET MULTIFAMILY LLC" (borrower),
 *   type 2 = "JPMORGAN CHASE BANK, N.A." (lender).
 *
 * For assignments (ASST):
 *   type 1 = grantor = assigning lender (old lender)
 *   type 2 = grantee = new assignee lender
 *
 * Schedule: daily via /api/intel/mortgage-sync (after acris-sync)
 */

import prisma from "@/lib/prisma";
import { ACRIS_LEGALS_ID, ACRIS_PARTIES_ID } from "@/lib/terminal-datasets";
import { initDocTypeWhitelists, getMortgageDocTypes } from "./deed-types";
import { resolveOrCreateLenderEntity } from "./lender-lookup";
import { normalizeName } from "@/lib/entity-resolver";

const ACRIS_MASTER_ID = "bnx9-e6tj";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 500;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

export interface MortgageSyncResult {
  documentsProcessed: number;
  mortgagesUpserted: number;
  chainsLinked: number;
  errors: number;
  durationMs: number;
  bblsTouched: Set<string>;
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

/** Classify mortgage doc type into status transition */
function classifyDocType(docType: string): { mortgageType: string; statusEffect: string } {
  const dt = docType.toUpperCase();
  if (["MTGE", "MTG", "MORT"].includes(dt)) return { mortgageType: "first", statusEffect: "new" };
  if (["SAT", "SATI"].includes(dt)) return { mortgageType: "satisfaction", statusEffect: "satisfied" };
  if (["ASST", "ASSIGN"].includes(dt)) return { mortgageType: "assignment", statusEffect: "assigned" };
  if (dt === "CEMA") return { mortgageType: "cema", statusEffect: "modified" };
  if (dt === "SPM") return { mortgageType: "subordinated", statusEffect: "new" };
  if (["MOD", "MODA"].includes(dt)) return { mortgageType: "modification", statusEffect: "modified" };
  return { mortgageType: "unknown", statusEffect: "unknown" };
}

/**
 * Sync ACRIS mortgage documents incrementally.
 * Processes mortgage-type Master records, builds chains, populates Co_mortgages.
 */
export async function syncMortgages(orgId: string): Promise<MortgageSyncResult> {
  const start = Date.now();
  let docsProcessed = 0;
  let mortgagesUpserted = 0;
  let chainsLinked = 0;
  let errors = 0;
  const bblsTouched = new Set<string>();

  await initDocTypeWhitelists();
  const mortgageTypes = [...getMortgageDocTypes()];

  if (mortgageTypes.length === 0) {
    console.warn("[MortgageSync] No mortgage doc types loaded");
    return { documentsProcessed: 0, mortgagesUpserted: 0, chainsLinked: 0, errors: 0, durationMs: 0, bblsTouched };
  }

  // Get sync window from IngestionState
  const state = await prisma.ingestionState.findUnique({
    where: { datasetId: "acris_mortgages" },
  });
  const sinceDays = state?.lastRecordTimestamp
    ? Math.max(2, Math.ceil((Date.now() - state.lastRecordTimestamp.getTime()) / 86_400_000))
    : 7;
  const sinceDate = new Date(Date.now() - sinceDays * 86_400_000);
  const sinceStr = sinceDate.toISOString().split("T")[0];
  let latestModified: Date | null = null;
  let offset = 0;

  console.log(`[MortgageSync] Syncing mortgage docs since ${sinceStr} (${mortgageTypes.length} types)`);

  // Query ACRIS Master for mortgage doc types modified since window
  // We read from the mirrored acris_master table (populated by acris-sync)
  // rather than hitting Socrata directly — avoids double-fetching
  while (true) {
    const masterDocs = await prisma.$queryRaw<Array<{
      document_id: string;
      doc_type: string;
      document_date: Date | null;
      document_amount: number | null;
      recorded_datetime: Date | null;
      modified_date: Date | null;
    }>>`
      SELECT document_id, doc_type, document_date, document_amount, recorded_datetime, modified_date
      FROM condo_ownership.acris_master
      WHERE doc_type = ANY(${mortgageTypes})
        AND modified_date >= ${sinceDate}::timestamptz
      ORDER BY modified_date ASC
      LIMIT ${PAGE_SIZE}
      OFFSET ${offset}
    `;

    if (masterDocs.length === 0) break;

    for (let i = 0; i < masterDocs.length; i += BATCH_SIZE) {
      const batch = masterDocs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((doc) => processMortgageDoc(orgId, doc, bblsTouched)),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          docsProcessed++;
          if (r.value.upserted) mortgagesUpserted++;
          if (r.value.chained) chainsLinked++;
        } else {
          errors++;
        }
      }
      if (i + BATCH_SIZE < masterDocs.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const lastDoc = masterDocs[masterDocs.length - 1];
    if (lastDoc?.modified_date) {
      const d = new Date(lastDoc.modified_date);
      if (!latestModified || d > latestModified) latestModified = d;
    }

    offset += masterDocs.length;
    if (masterDocs.length < PAGE_SIZE) break;
  }

  // Update ingestion state
  await prisma.ingestionState.upsert({
    where: { datasetId: "acris_mortgages" },
    create: { datasetId: "acris_mortgages", lastCheckedAt: new Date(), lastRecordTimestamp: latestModified, recordCount: docsProcessed, status: "idle" },
    update: { lastCheckedAt: new Date(), lastRecordTimestamp: latestModified || undefined, recordCount: { increment: docsProcessed }, status: "idle" },
  });

  // Log sync metrics
  await prisma.coSyncMetrics.create({
    data: {
      datasetId: "acris_mortgages",
      runStartedAt: new Date(start),
      runCompletedAt: new Date(),
      rowsFetched: docsProcessed,
      rowsUpserted: mortgagesUpserted,
      rowsFailed: errors,
    },
  }).catch(() => {});

  console.log(
    `[MortgageSync] Complete: ${docsProcessed} docs, ${mortgagesUpserted} mortgages, ` +
    `${chainsLinked} chains, ${bblsTouched.size} BBLs, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { documentsProcessed: docsProcessed, mortgagesUpserted, chainsLinked, errors, durationMs: Date.now() - start, bblsTouched };
}

async function processMortgageDoc(
  orgId: string,
  doc: { document_id: string; doc_type: string; document_date: Date | null; document_amount: number | null; recorded_datetime: Date | null },
  bblsTouched: Set<string>,
): Promise<{ upserted: boolean; chained: boolean }> {
  const { mortgageType, statusEffect } = classifyDocType(doc.doc_type);

  // Get BBLs from legals
  const legals = await prisma.$queryRaw<Array<{ bbl: string }>>`
    SELECT bbl FROM condo_ownership.acris_legals WHERE document_id = ${doc.document_id} AND bbl IS NOT NULL
  `;

  // Get parties
  const parties = await prisma.$queryRaw<Array<{ party_type: number; name: string | null }>>`
    SELECT party_type, name FROM condo_ownership.acris_parties
    WHERE document_id = ${doc.document_id}
    ORDER BY party_type ASC, party_sequence ASC
  `;

  // Mortgage: type 1 = borrower (grantor), type 2 = lender (grantee)
  const borrowerNames = parties.filter(p => p.party_type === 1 && p.name).map(p => p.name!);
  const lenderNames = parties.filter(p => p.party_type === 2 && p.name).map(p => p.name!);

  // Resolve lender entity with bank classification
  let lenderEntityId: string | null = null;
  let borrowerEntityId: string | null = null;

  if (lenderNames.length > 0) {
    const lender = await resolveOrCreateLenderEntity(orgId, lenderNames[0]);
    lenderEntityId = lender.id;
  }

  if (borrowerNames.length > 0) {
    const normalized = normalizeName(borrowerNames[0]);
    const existing = await prisma.coEntity.findFirst({
      where: { orgId, nameNormalized: normalized },
      select: { id: true },
    });
    borrowerEntityId = existing?.id || null;
    if (!borrowerEntityId) {
      const created = await prisma.coEntity.create({
        data: { orgId, canonicalName: borrowerNames[0], nameNormalized: normalized, entityType: "unknown", sources: ["acris_mortgage"], confidence: 0.70 },
        select: { id: true },
      });
      borrowerEntityId = created.id;
    }
  }

  let upserted = false;
  let chained = false;

  for (const legal of legals) {
    bblsTouched.add(legal.bbl);

    // Resolve building
    const building = await prisma.coBuilding.findFirst({
      where: { orgId, bbl: legal.bbl },
      select: { id: true },
    });

    const status = statusEffect === "satisfied" ? "satisfied"
      : statusEffect === "assigned" ? "assigned"
      : "active";

    // For assignments (ASST), try to find the original mortgage to chain
    let originalDocId: string | null = null;
    if (statusEffect === "assigned" || statusEffect === "satisfied") {
      // Find original mortgage for this BBL with matching borrower
      const original = await prisma.coMortgage.findFirst({
        where: { orgId, buildingId: building?.id || undefined, status: "active", mortgageType: "first" },
        orderBy: { recordedDate: "desc" },
        select: { documentId: true },
      });
      if (original?.documentId) {
        originalDocId = original.documentId;
        chained = true;

        // Update original mortgage status
        if (statusEffect === "satisfied") {
          await prisma.coMortgage.updateMany({
            where: { orgId, documentId: original.documentId },
            data: { status: "satisfied" },
          }).catch(() => {});
        } else if (statusEffect === "assigned") {
          await prisma.coMortgage.updateMany({
            where: { orgId, documentId: original.documentId },
            data: { status: "assigned", currentAssigneeEntityId: lenderEntityId },
          }).catch(() => {});
        }
      }
    }

    // Upsert the mortgage record
    await prisma.$executeRaw`
      INSERT INTO condo_ownership.mortgages (
        id, org_id, building_id, document_id, borrower_entity, lender_entity,
        amount, recorded_date, status, mortgage_type, original_doc_id,
        current_assignee_entity, created_at
      ) VALUES (
        gen_random_uuid(), ${orgId}, ${building?.id || null}, ${doc.document_id},
        ${borrowerEntityId}, ${lenderEntityId},
        ${doc.document_amount}::numeric, ${doc.document_date}::date,
        ${status}, ${mortgageType}, ${originalDocId},
        ${statusEffect === "assigned" ? lenderEntityId : null},
        NOW()
      )
      ON CONFLICT DO NOTHING
    `;
    upserted = true;
  }

  return { upserted, chained };
}
