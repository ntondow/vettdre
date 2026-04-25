/**
 * Ownership Recomputation — resolves "who owns this unit?" from ACRIS data.
 *
 * For a given BBL:
 * 1. Find all acris_legals rows with that BBL
 * 2. Join to acris_master filtered by deed-type whitelist
 * 3. Order by document_date DESC, take the most recent deed
 * 4. Resolve grantee → entity, grantor → entity
 * 5. Upsert unit_ownership_current
 *
 * ── ACRIS Party Type Convention (verified 2026-04-25 against live Socrata 636b-3b5g) ──
 *
 *   party_type = 1  →  GRANTOR (seller in a deed, mortgagor/borrower in a mortgage)
 *   party_type = 2  →  GRANTEE (buyer in a deed, mortgagee/lender in a mortgage)
 *
 * Verified with deed document_id 2015081800233001 (214-02 Hillside Ave):
 *   type 1 = "ESTATE OF ANNA I. SILVA" (seller/grantor)
 *   type 2 = "ISLAM, MOHAMMAD S" (buyer/grantee)
 *
 * NOTE: terminal-enrichment.ts, terminal-brief-templates.ts, and event-detail-expanded.tsx
 * currently have the OPPOSITE mapping (type 1 = buyer, type 2 = seller) due to a prior
 * incorrect fix. Filed as follow-up — do not change those files from this module.
 * This file uses the CORRECT mapping per live ACRIS data.
 */

import prisma from "@/lib/prisma";
import { normalizeName, isEntityName } from "@/lib/entity-resolver";
import { getDeedDocTypes, initDocTypeWhitelists } from "./deed-types";

export interface RecomputeResult {
  bbl: string;
  unitId: string | null;
  buildingId: string | null;
  ownerName: string | null;
  ownerEntityId: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  deedDocId: string | null;
}

/**
 * Recompute current ownership for all units at a given BBL.
 * If the BBL is a unit BBL (individual condo), updates that unit.
 * If it's a billing BBL, updates all units in the building.
 */
export async function recomputeOwnership(
  orgId: string,
  bbl: string,
): Promise<RecomputeResult[]> {
  await initDocTypeWhitelists();
  const deedTypes = [...getDeedDocTypes()];

  if (deedTypes.length === 0) {
    console.warn("[Recompute] No deed types loaded — skipping");
    return [];
  }

  // Find the most recent deed for this BBL
  const deeds = await prisma.$queryRaw<Array<{
    document_id: string;
    doc_type: string;
    document_date: Date | null;
    document_amount: number | null;
    recorded_datetime: Date | null;
  }>>`
    SELECT m.document_id, m.doc_type, m.document_date, m.document_amount, m.recorded_datetime
    FROM condo_ownership.acris_legals l
    JOIN condo_ownership.acris_master m ON l.document_id = m.document_id
    WHERE l.bbl = ${bbl}
      AND m.doc_type = ANY(${deedTypes})
    ORDER BY m.document_date DESC NULLS LAST, m.recorded_datetime DESC NULLS LAST
    LIMIT 1
  `;

  if (deeds.length === 0) return [];
  const deed = deeds[0];

  // Get parties for this deed
  // ACRIS: party_type 1 = grantor (seller), party_type 2 = grantee (buyer)
  const parties = await prisma.$queryRaw<Array<{
    party_type: number;
    name: string | null;
    address_1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>>`
    SELECT party_type, name, address_1, city, state, zip
    FROM condo_ownership.acris_parties
    WHERE document_id = ${deed.document_id}
    ORDER BY party_type ASC, party_sequence ASC
  `;

  const grantees = parties.filter((p) => p.party_type === 2 && p.name);
  const grantors = parties.filter((p) => p.party_type === 1 && p.name);

  // Resolve grantee (current owner) to entity
  const ownerNames = grantees.map((g) => g.name!);
  const ownerName = ownerNames.join("; ") || null;
  const ownerEntity = ownerNames.length > 0
    ? await resolveEntity(orgId, ownerNames[0], grantees[0])
    : null;

  // Resolve grantor (prior owner) to entity
  const grantorNames = grantors.map((g) => g.name!);
  const grantorName = grantorNames.join("; ") || null;
  const grantorEntity = grantorNames.length > 0
    ? await resolveEntity(orgId, grantorNames[0], grantors[0])
    : null;

  // Build mailing address from grantee party record
  const mailingAddr = grantees[0]
    ? [grantees[0].address_1, grantees[0].city, grantees[0].state, grantees[0].zip].filter(Boolean).join(", ")
    : null;

  // Find the unit(s) at this BBL
  const units = await prisma.coUnit.findMany({
    where: { orgId, unitBbl: bbl },
    select: { id: true, buildingId: true },
  });

  // If no unit found, try as building BBL and update all units
  if (units.length === 0) {
    const building = await prisma.coBuilding.findUnique({
      where: { orgId_bbl: { orgId, bbl } },
      select: { id: true },
    });
    if (building) {
      const buildingUnits = await prisma.coUnit.findMany({
        where: { orgId, buildingId: building.id },
        select: { id: true, buildingId: true },
      });
      // For building-level ownership (non-condo), update all units
      const results: RecomputeResult[] = [];
      for (const u of buildingUnits) {
        await upsertOwnership(orgId, u.id, u.buildingId, deed, ownerName, ownerEntity, grantorName, grantorEntity, mailingAddr);
        results.push({
          bbl, unitId: u.id, buildingId: u.buildingId,
          ownerName, ownerEntityId: ownerEntity?.id || null,
          lastSaleDate: deed.document_date?.toISOString().split("T")[0] || null,
          lastSalePrice: deed.document_amount ? Number(deed.document_amount) : null,
          deedDocId: deed.document_id,
        });
      }
      return results;
    }
    return [];
  }

  // Update each matching unit
  const results: RecomputeResult[] = [];
  for (const u of units) {
    await upsertOwnership(orgId, u.id, u.buildingId, deed, ownerName, ownerEntity, grantorName, grantorEntity, mailingAddr);
    results.push({
      bbl, unitId: u.id, buildingId: u.buildingId,
      ownerName, ownerEntityId: ownerEntity?.id || null,
      lastSaleDate: deed.document_date?.toISOString().split("T")[0] || null,
      lastSalePrice: deed.document_amount ? Number(deed.document_amount) : null,
      deedDocId: deed.document_id,
    });
  }
  return results;
}

// ── Entity Resolution ────────────────────────────────────────

async function resolveEntity(
  orgId: string,
  name: string,
  partyRecord: { address_1?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null,
): Promise<{ id: string; name: string } | null> {
  if (!name) return null;

  const normalized = normalizeName(name);
  const entityType = isEntityName(name) ? detectEntityType(name) : "individual";

  // Try to find existing entity by normalized name
  const existing = await prisma.coEntity.findFirst({
    where: { orgId, nameNormalized: normalized },
    select: { id: true, canonicalName: true },
  });

  if (existing) return { id: existing.id, name: existing.canonicalName };

  // Create new entity
  const mailingAddr = partyRecord
    ? [partyRecord.address_1, partyRecord.city, partyRecord.state, partyRecord.zip].filter(Boolean).join(", ")
    : null;

  const created = await prisma.coEntity.create({
    data: {
      orgId,
      canonicalName: name,
      nameNormalized: normalized,
      entityType,
      primaryAddress: mailingAddr,
      mailingAddresses: mailingAddr ? [mailingAddr] : [],
      sources: ["acris"],
      confidence: 0.7,
    },
    select: { id: true, canonicalName: true },
  });

  return { id: created.id, name: created.canonicalName };
}

function detectEntityType(name: string): string {
  const upper = name.toUpperCase();
  if (/\bLLC\b/.test(upper)) return "llc";
  if (/\b(INC|CORP|CORPORATION)\b/.test(upper)) return "corp";
  if (/\bTRUST\b/.test(upper)) return "trust";
  if (/\b(LP|LLP|PARTNERSHIP)\b/.test(upper)) return "partnership";
  if (/\bESTATE\b/.test(upper)) return "estate";
  if (/\b(FOUNDATION|ASSOC|NONPROFIT)\b/.test(upper)) return "nonprofit";
  return "unknown";
}

// ── Ownership Upsert ─────────────────────────────────────────

async function upsertOwnership(
  orgId: string,
  unitId: string,
  buildingId: string,
  deed: { document_id: string; document_date: Date | null; document_amount: number | null },
  ownerName: string | null,
  ownerEntity: { id: string } | null,
  grantorName: string | null,
  grantorEntity: { id: string } | null,
  mailingAddress: string | null,
): Promise<void> {
  const ownerType = ownerEntity ? undefined : (ownerName ? detectEntityType(ownerName) : undefined);

  await prisma.$executeRaw`
    INSERT INTO condo_ownership.unit_ownership_current (
      id, org_id, unit_id, building_id,
      current_owner_entity, current_owner_name, current_owner_type,
      last_deed_doc_id, last_sale_date, last_sale_price,
      grantor_entity, grantor_name,
      owner_mailing_address, deed_count, last_refreshed
    ) VALUES (
      gen_random_uuid(), ${orgId}, ${unitId}, ${buildingId},
      ${ownerEntity?.id || null}, ${ownerName}, ${ownerType || null},
      ${deed.document_id}, ${deed.document_date}::date, ${deed.document_amount ? Number(deed.document_amount) : null}::numeric,
      ${grantorEntity?.id || null}, ${grantorName},
      ${mailingAddress}, 1, NOW()
    )
    ON CONFLICT (org_id, unit_id) DO UPDATE SET
      current_owner_entity = EXCLUDED.current_owner_entity,
      current_owner_name = EXCLUDED.current_owner_name,
      current_owner_type = EXCLUDED.current_owner_type,
      last_deed_doc_id = EXCLUDED.last_deed_doc_id,
      last_sale_date = EXCLUDED.last_sale_date,
      last_sale_price = EXCLUDED.last_sale_price,
      grantor_entity = EXCLUDED.grantor_entity,
      grantor_name = EXCLUDED.grantor_name,
      owner_mailing_address = EXCLUDED.owner_mailing_address,
      deed_count = condo_ownership.unit_ownership_current.deed_count + 1,
      last_refreshed = NOW()
  `;
}
