// ============================================================
// My Properties Hub — Shared Types
// ============================================================

export type PropertySource = "listing" | "deal" | "showing" | "prospect";

export interface UnifiedProperty {
  id: string;               // source-prefixed: "lst_xxx", "deal_xxx", "shw_xxx", "prs_xxx"
  source: PropertySource;
  address: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;    // rental, sale, condo, multi_family, etc.
  status: string;           // display status text
  statusColor: string;      // tailwind color class for badge

  // Financials
  price?: number;           // sale / asking price
  rent?: number;            // monthly rent
  assessedValue?: number;   // tax assessed value (prospects)

  // Specs
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  totalUnits?: number;      // for multifamily / prospects

  // Navigation
  href: string;             // primary click destination
  marketIntelHref?: string; // always available for address lookup

  // Metadata
  daysOnMarket?: number;
  addedAt: string;          // ISO string (serialized)
  agentName?: string;
  ownerName?: string;

  // Related counts
  dealCount: number;
  showingCount: number;
}

export interface PropertiesStats {
  total: number;
  listings: number;
  deals: number;
  showings: number;
  prospects: number;
}
