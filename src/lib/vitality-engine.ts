// Neighborhood Vitality Scoring Engine — pure, synchronous, no "use server"
// Detects gentrification / distress momentum at ZIP-code level via commercial tenant mix

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BrandCategory =
  | "grocery"
  | "fitness"
  | "restaurant"
  | "coffee"
  | "retail"
  | "financial"
  | "convenience";

export interface BrandIndicator {
  name: string;
  aliases: string[];
  category: BrandCategory;
  signal: "positive" | "negative";
  weight: number; // 1-10
  subcategory: string;
}

export interface POIResult {
  name: string;
  brand?: string;
  address: string;
  lat: number;
  lng: number;
  signal: "positive" | "negative";
  weight: number;
  source: "google_places" | "osm";
  placeId?: string;
}

export type VitalityLevel =
  | "strong_growth"
  | "growth"
  | "stable"
  | "declining"
  | "distressed";

export type VitalityMomentum =
  | "accelerating"
  | "steady"
  | "decelerating"
  | "unknown";

export interface VitalityScore {
  zipCode: string;
  score: number; // -100 to +100
  level: VitalityLevel;
  momentum: VitalityMomentum;
  positiveIndicators: POIResult[];
  negativeIndicators: POIResult[];
  positiveCount: number;
  negativeCount: number;
  ratio: number; // positive / (positive + negative), 0-1
  confidence: "high" | "medium" | "low";
  calculatedAt: string;
  expiresAt: string;
}

export interface VitalityLevelConfig {
  label: string;
  color: string;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  bgColor: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Brand Indicator Registry                                           */
/* ------------------------------------------------------------------ */

export const BRAND_INDICATORS: BrandIndicator[] = [
  // ===== POSITIVE (Growth / Gentrification) =====

  // Grocery
  { name: "Whole Foods Market", aliases: ["Whole Foods", "WFM"], category: "grocery", signal: "positive", weight: 10, subcategory: "Premium Grocery" },
  { name: "Trader Joe's", aliases: ["Trader Joes", "TJ's"], category: "grocery", signal: "positive", weight: 9, subcategory: "Premium Grocery" },
  { name: "Wegmans", aliases: [], category: "grocery", signal: "positive", weight: 8, subcategory: "Premium Grocery" },
  { name: "Citarella", aliases: ["Citarella Gourmet Market"], category: "grocery", signal: "positive", weight: 8, subcategory: "Luxury Grocery" },

  // Fitness
  { name: "Equinox", aliases: ["Equinox Fitness"], category: "fitness", signal: "positive", weight: 9, subcategory: "Premium Fitness" },
  { name: "SoulCycle", aliases: ["Soul Cycle"], category: "fitness", signal: "positive", weight: 8, subcategory: "Boutique Fitness" },
  { name: "Barry's", aliases: ["Barry's Bootcamp", "Barrys"], category: "fitness", signal: "positive", weight: 8, subcategory: "Boutique Fitness" },
  { name: "Orangetheory Fitness", aliases: ["Orangetheory", "OTF"], category: "fitness", signal: "positive", weight: 6, subcategory: "Premium Fitness" },

  // Restaurant
  { name: "Sweetgreen", aliases: ["Sweet Green"], category: "restaurant", signal: "positive", weight: 8, subcategory: "Premium Fast-Casual" },
  { name: "Shake Shack", aliases: ["ShakeShack"], category: "restaurant", signal: "positive", weight: 7, subcategory: "Premium Fast-Casual" },
  { name: "Chipotle", aliases: ["Chipotle Mexican Grill"], category: "restaurant", signal: "positive", weight: 5, subcategory: "Fast-Casual" },

  // Coffee
  { name: "Blue Bottle Coffee", aliases: ["Blue Bottle"], category: "coffee", signal: "positive", weight: 8, subcategory: "Specialty Coffee" },
  { name: "Starbucks Reserve", aliases: ["Starbucks Reserve Roastery"], category: "coffee", signal: "positive", weight: 7, subcategory: "Premium Coffee" },

  // Retail
  { name: "Apple Store", aliases: ["Apple"], category: "retail", signal: "positive", weight: 10, subcategory: "Premium Retail" },
  { name: "Lululemon", aliases: ["lululemon athletica"], category: "retail", signal: "positive", weight: 8, subcategory: "Premium Athleisure" },
  { name: "Warby Parker", aliases: [], category: "retail", signal: "positive", weight: 7, subcategory: "DTC Premium" },
  { name: "West Elm", aliases: [], category: "retail", signal: "positive", weight: 7, subcategory: "Premium Home" },
  { name: "Sephora", aliases: [], category: "retail", signal: "positive", weight: 6, subcategory: "Premium Beauty" },
  { name: "WeWork", aliases: ["Industrious"], category: "retail", signal: "positive", weight: 6, subcategory: "Coworking" },

  // Financial — positive
  { name: "Chase", aliases: ["JPMorgan Chase", "Chase Bank"], category: "financial", signal: "positive", weight: 5, subcategory: "Major Bank" },

  // ===== NEGATIVE (Distress / Decline) =====

  // Convenience / Discount
  { name: "Dollar General", aliases: ["Dollar General Market"], category: "convenience", signal: "negative", weight: 8, subcategory: "Discount Retail" },
  { name: "Dollar Tree", aliases: ["Family Dollar", "Dollar Tree Plus"], category: "convenience", signal: "negative", weight: 8, subcategory: "Discount Retail" },

  // Financial — negative
  { name: "Payday Lender", aliases: ["payday loan", "cash advance", "quick cash loan", "ez cash"], category: "financial", signal: "negative", weight: 9, subcategory: "Predatory Lending" },
  { name: "Check Cashing", aliases: ["check casher", "money order", "check cashing store"], category: "financial", signal: "negative", weight: 9, subcategory: "Unbanked Services" },
  { name: "Pawn Shop", aliases: ["pawnbroker", "pawn & gold", "we buy gold"], category: "financial", signal: "negative", weight: 8, subcategory: "Asset Liquidation" },
  { name: "Cash for Gold", aliases: ["gold buyer", "we buy gold", "sell gold"], category: "financial", signal: "negative", weight: 7, subcategory: "Asset Liquidation" },

  // Retail — negative
  { name: "Rent-A-Center", aliases: ["RAC", "Rent A Center"], category: "retail", signal: "negative", weight: 7, subcategory: "Rent-to-Own" },
  { name: "MetroPCS", aliases: ["Metro by T-Mobile", "Boost Mobile", "Cricket Wireless"], category: "retail", signal: "negative", weight: 5, subcategory: "Prepaid Wireless" },

  // Restaurant — weak negative signal
  { name: "Popeyes", aliases: ["Popeyes Louisiana Kitchen"], category: "restaurant", signal: "negative", weight: 3, subcategory: "QSR" },

  // Convenience — cluster signals
  { name: "Laundromat", aliases: ["coin laundry", "wash & fold", "laundry"], category: "convenience", signal: "negative", weight: 3, subcategory: "Essential Service" },
  { name: "Liquor Store", aliases: ["wine & liquor", "beer & wine", "package store"], category: "convenience", signal: "negative", weight: 4, subcategory: "Liquor Retail" },
];

/* ------------------------------------------------------------------ */
/*  Vitality Level Config                                              */
/* ------------------------------------------------------------------ */

export const VITALITY_LEVEL_CONFIG: Record<VitalityLevel, VitalityLevelConfig> = {
  strong_growth: {
    label: "Strong Growth",
    color: "#059669",
    fillColor: "#059669",
    fillOpacity: 0.35,
    textColor: "text-emerald-700",
    bgColor: "bg-emerald-50",
    description: "Premium brands clustering — strong gentrification momentum",
  },
  growth: {
    label: "Growth",
    color: "#34D399",
    fillColor: "#34D399",
    fillOpacity: 0.25,
    textColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
    description: "Positive brand signals — neighborhood attracting investment",
  },
  stable: {
    label: "Stable",
    color: "#94A3B8",
    fillColor: "#94A3B8",
    fillOpacity: 0.08,
    textColor: "text-slate-600",
    bgColor: "bg-slate-50",
    description: "Balanced tenant mix — no strong directional signal",
  },
  declining: {
    label: "Declining",
    color: "#F87171",
    fillColor: "#F87171",
    fillOpacity: 0.25,
    textColor: "text-red-600",
    bgColor: "bg-red-50",
    description: "Discount / predatory lending concentration increasing",
  },
  distressed: {
    label: "Distressed",
    color: "#DC2626",
    fillColor: "#DC2626",
    fillOpacity: 0.35,
    textColor: "text-red-700",
    bgColor: "bg-red-50",
    description: "Heavy concentration of distress indicators — economic decline",
  },
};

/* ------------------------------------------------------------------ */
/*  Google Places Category Search Terms                                */
/* ------------------------------------------------------------------ */

// Categories to search per ZIP for efficient API usage
export const PLACES_SEARCH_CATEGORIES = [
  "grocery store",
  "gym fitness",
  "coffee shop",
  "restaurant fast casual",
  "pawn shop",
  "check cashing",
  "dollar store",
  "payday loan",
] as const;

// OSM amenity tags to query
export const OSM_AMENITY_TAGS = [
  "shop=pawnbroker",
  "shop=money_lender",
  "amenity=money_transfer",
  "shop=variety_store",
  "leisure=fitness_centre",
  "shop=supermarket",
  "amenity=cafe",
] as const;

/* ------------------------------------------------------------------ */
/*  Brand Matching                                                     */
/* ------------------------------------------------------------------ */

/**
 * Match a place name against the brand indicator registry.
 * Returns the best match or null if no match.
 */
export function matchBrand(placeName: string): BrandIndicator | null {
  const lower = placeName.toLowerCase();
  let bestMatch: BrandIndicator | null = null;
  let bestScore = 0;

  for (const brand of BRAND_INDICATORS) {
    // Exact name match (case-insensitive)
    if (lower.includes(brand.name.toLowerCase())) {
      const score = brand.name.length; // longer name = more specific match
      if (score > bestScore) {
        bestMatch = brand;
        bestScore = score;
      }
    }
    // Alias matches
    for (const alias of brand.aliases) {
      if (alias.length >= 3 && lower.includes(alias.toLowerCase())) {
        const score = alias.length;
        if (score > bestScore) {
          bestMatch = brand;
          bestScore = score;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Classify a POI from raw place data by matching against brand registry.
 * For generic category matches (e.g., "pawn shop"), use category fallback.
 */
export function classifyPOI(
  name: string,
  address: string,
  lat: number,
  lng: number,
  source: "google_places" | "osm",
  placeId?: string,
): POIResult | null {
  const brand = matchBrand(name);

  if (brand) {
    return {
      name,
      brand: brand.name,
      address,
      lat,
      lng,
      signal: brand.signal,
      weight: brand.weight,
      source,
      placeId,
    };
  }

  // Generic category fallback — check for common negative indicators
  const lower = name.toLowerCase();
  if (lower.includes("pawn") || lower.includes("gold buyer")) {
    return { name, brand: "Pawn Shop", address, lat, lng, signal: "negative", weight: 7, source, placeId };
  }
  if (lower.includes("check cash") || lower.includes("money order")) {
    return { name, brand: "Check Cashing", address, lat, lng, signal: "negative", weight: 8, source, placeId };
  }
  if (lower.includes("payday") || lower.includes("cash advance") || lower.includes("quick cash")) {
    return { name, brand: "Payday Lender", address, lat, lng, signal: "negative", weight: 9, source, placeId };
  }
  if (lower.includes("dollar general") || lower.includes("dollar tree") || lower.includes("family dollar")) {
    return { name, brand: "Dollar Tree", address, lat, lng, signal: "negative", weight: 8, source, placeId };
  }

  return null; // No match — skip this POI
}

/* ------------------------------------------------------------------ */
/*  Scoring Algorithm                                                  */
/* ------------------------------------------------------------------ */

/**
 * Calculate vitality score from classified POIs.
 * Pure synchronous function — no I/O.
 */
export function calculateVitalityScore(zipCode: string, pois: POIResult[]): VitalityScore {
  const positiveIndicators = pois.filter((p) => p.signal === "positive");
  const negativeIndicators = pois.filter((p) => p.signal === "negative");

  let positiveScore = positiveIndicators.reduce((sum, p) => sum + p.weight, 0);
  let negativeScore = negativeIndicators.reduce((sum, p) => sum + p.weight, 0);

  // Density bonus: 3+ brands of same signal in ZIP → multiply by 1.3
  if (positiveIndicators.length >= 3) positiveScore *= 1.3;
  if (negativeIndicators.length >= 3) negativeScore *= 1.3;

  // Additional cluster bonus: 5+ same-signal → 1.5x
  if (positiveIndicators.length >= 5) positiveScore *= 1.15;
  if (negativeIndicators.length >= 5) negativeScore *= 1.15;

  const ratio = positiveScore / (positiveScore + negativeScore + 1);
  const rawScore = (ratio - 0.5) * 200;
  const score = Math.round(Math.max(-100, Math.min(100, rawScore)));

  const totalMatches = pois.length;
  const confidence: "high" | "medium" | "low" =
    totalMatches >= 15 ? "high" : totalMatches >= 5 ? "medium" : "low";

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  return {
    zipCode,
    score,
    level: getVitalityLevel(score),
    momentum: "unknown", // v1: no historical data yet
    positiveIndicators,
    negativeIndicators,
    positiveCount: positiveIndicators.length,
    negativeCount: negativeIndicators.length,
    ratio: Math.round(ratio * 1000) / 1000,
    confidence,
    calculatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Utility Functions                                                  */
/* ------------------------------------------------------------------ */

export function getVitalityLevel(score: number): VitalityLevel {
  if (score >= 60) return "strong_growth";
  if (score >= 20) return "growth";
  if (score >= -20) return "stable";
  if (score >= -60) return "declining";
  return "distressed";
}

export function getVitalityColor(level: VitalityLevel): string {
  return VITALITY_LEVEL_CONFIG[level].color;
}

export function getVitalityFillColor(level: VitalityLevel): string {
  return VITALITY_LEVEL_CONFIG[level].fillColor;
}

export function getVitalityFillOpacity(level: VitalityLevel): number {
  return VITALITY_LEVEL_CONFIG[level].fillOpacity;
}

export function getVitalityLabel(level: VitalityLevel): string {
  return VITALITY_LEVEL_CONFIG[level].label;
}
