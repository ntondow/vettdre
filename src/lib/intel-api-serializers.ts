/**
 * Intel API Serializers — Prisma Co_* models → clean API response shapes.
 *
 * Rules:
 * - No internal flags (_orgId, internal IDs) in responses
 * - Dates as ISO strings
 * - Decimals as numbers
 * - Null-safe: missing data = null, not undefined
 */

import type {
  IntelBuilding,
  IntelSignal,
  IntelUnit,
  IntelEntity,
  IntelAlias,
  IntelRelatedEntity,
  IntelExemption,
  IntelPortfolioBuilding,
} from "./intel-api-types";

// ── Building ─────────────────────────────────────────────────

export function serializeBuilding(b: any): IntelBuilding {
  return {
    bbl: b.bbl || "",
    address: b.address || "",
    normalizedAddress: b.normalizedAddress || b.normalized_address || "",
    borough: b.borough || 0,
    totalUnits: b.totalUnits ?? b.total_units ?? null,
    residentialUnits: b.residentialUnits ?? b.residential_units ?? null,
    commercialUnits: b.commercialUnits ?? b.commercial_units ?? null,
    yearBuilt: b.yearBuilt ?? b.year_built ?? null,
    buildingClass: b.buildingClass ?? b.building_class ?? null,
    propertyType: b.propertyType ?? b.property_type ?? null,
    grossSqft: b.grossSqft ?? b.gross_sqft ?? null,
    lastSyncedAt: b.lastSyncedAt?.toISOString?.() ?? b.last_synced_at ?? null,
  };
}

// ── Signal ───────────────────────────────────────────────────

export function serializeSignal(s: any): IntelSignal {
  return {
    signalType: s.signalType ?? s.signal_type ?? "",
    score: s.score != null ? Number(s.score) : null,
    confidence: s.confidence ?? "low",
    evidence: typeof s.evidence === "object" && s.evidence !== null ? s.evidence : {},
    computedAt: s.computedAt?.toISOString?.() ?? s.computed_at ?? "",
  };
}

// ── Unit ─────────────────────────────────────────────────────

export function serializeUnit(u: any, ownership: any): IntelUnit {
  return {
    unitNumber: u.unitNumber ?? u.unit_number ?? null,
    unitBbl: u.unitBbl ?? u.unit_bbl ?? null,
    currentOwnerName: ownership?.currentOwnerName ?? ownership?.current_owner_name ?? null,
    ownerEntityId: ownership?.currentOwnerEntityId ?? ownership?.current_owner_entity ?? null,
    mailingAddress: ownership?.ownerMailingAddress ?? ownership?.owner_mailing_address ?? null,
    lastSaleDate: ownership?.lastSaleDate?.toISOString?.()?.split("T")[0] ?? null,
    lastSalePrice: ownership?.lastSalePrice != null ? Number(ownership.lastSalePrice) : null,
    primaryResidence: ownership?.primaryResidenceFlag ?? ownership?.primary_residence_flag ?? null,
    investorBadge: (ownership?.mailingDiffersFromUnit ?? ownership?.mailing_differs_from_unit ?? false) &&
                   !(ownership?.primaryResidenceFlag ?? ownership?.primary_residence_flag ?? false),
    exemptions: [], // populated by caller if needed
  };
}

// ── Entity ───────────────────────────────────────────────────

export function serializeEntity(e: any): IntelEntity {
  return {
    id: e.id,
    canonicalName: e.canonicalName ?? e.canonical_name ?? "",
    entityType: e.entityType ?? e.entity_type ?? "unknown",
    dosId: e.dosId ?? e.dos_id ?? null,
    icijNodeId: e.icijNodeId ?? e.icij_node_id ?? null,
    ofacSdnId: e.ofacSdnId ?? e.ofac_sdn_id ?? null,
    isBank: e.isBank ?? e.is_bank ?? false,
    bankFfiecId: e.bankFfiecId ?? e.bank_ffiec_id ?? null,
    confidence: e.confidence != null ? Number(e.confidence) : 0,
    sources: Array.isArray(e.sources) ? e.sources : [],
  };
}

export function serializeAlias(a: any): IntelAlias {
  return {
    alias: a.alias ?? "",
    source: a.source ?? "",
  };
}

export function serializeRelatedEntity(e: any): IntelRelatedEntity {
  return {
    entityId: e.entityId ?? e.entity_id ?? e.id ?? "",
    name: e.name ?? e.canonicalName ?? e.canonical_name ?? "",
    edgeType: e.edgeType ?? e.edge_type ?? "",
    confidence: e.confidence != null ? Number(e.confidence) : 0,
  };
}

// ── Exemption ────────────────────────────────────────────────

export function serializeExemption(ex: any): IntelExemption {
  return {
    type: ex.exemptionType ?? ex.exemption_type ?? null,
    expiresAt: ex.expirationDate?.toISOString?.()?.split("T")[0] ?? ex.expiration_date ?? null,
    status: ex.expirationDate && new Date(ex.expirationDate) > new Date() ? "active" : "expired",
    primaryResidence: ex.primaryResidence ?? ex.primary_residence ?? null,
  };
}

// ── Portfolio Building ───────────────────────────────────────

export function serializePortfolioBuilding(b: any, signalsCount: number, distress: boolean, role: "direct" | "via_related_llc"): IntelPortfolioBuilding {
  return {
    bbl: b.bbl || "",
    address: b.address || "",
    totalUnits: b.totalUnits ?? b.total_units ?? null,
    buildingSignalsCount: signalsCount,
    distressFlag: distress,
    ownershipRole: role,
  };
}
