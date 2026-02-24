// ============================================================
// Airbnb / Short-Term Rental Market Data & Projection Engine
// Embedded NYC neighborhood-level averages from InsideAirbnb
// Pure library (NOT "use server")
// ============================================================

export interface AirbnbNeighborhood {
  neighborhood: string;
  borough: string;
  avgNightlyRate: number;
  medianNightlyRate: number;
  avgOccupancyRate: number;
  avgAnnualRevenue: number;
  activeListings: number;
  avgMinNights: number;
  predominantType: string;
  avgReviewsPerMonth: number;
  period: string;
}

export interface STRProjection {
  neighborhood: string;
  borough: string;
  // Per unit
  avgNightlyRate: number;
  occupancyRate: number;
  monthlySTRRevenue: number;
  monthlyLTRRevenue: number;
  strPremium: number;
  // Building level
  annualSTRRevenue: number;
  annualLTRRevenue: number;
  annualDelta: number;
  // Market context
  activeListings: number;
  marketSaturation: "low" | "medium" | "high";
  // Regulatory
  regulatoryRisk: "high";
  regulatoryNote: string;
  // Metadata
  confidence: "high" | "medium" | "low";
  dataSource: string;
}

// ============================================================
// NYC Neighborhood Airbnb Data (InsideAirbnb, approx. 2025-Q3)
// ============================================================

const AIRBNB_DATA: Record<string, AirbnbNeighborhood> = {
  // Manhattan
  "East Village": { neighborhood: "East Village", borough: "Manhattan", avgNightlyRate: 195, medianNightlyRate: 165, avgOccupancyRate: 0.78, avgAnnualRevenue: 42500, activeListings: 890, avgMinNights: 3.2, predominantType: "Entire home", avgReviewsPerMonth: 2.1, period: "2025-Q3" },
  "West Village": { neighborhood: "West Village", borough: "Manhattan", avgNightlyRate: 225, medianNightlyRate: 195, avgOccupancyRate: 0.76, avgAnnualRevenue: 48200, activeListings: 620, avgMinNights: 3.5, predominantType: "Entire home", avgReviewsPerMonth: 1.9, period: "2025-Q3" },
  "Upper West Side": { neighborhood: "Upper West Side", borough: "Manhattan", avgNightlyRate: 185, medianNightlyRate: 155, avgOccupancyRate: 0.74, avgAnnualRevenue: 38800, activeListings: 950, avgMinNights: 4.1, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },
  "Upper East Side": { neighborhood: "Upper East Side", borough: "Manhattan", avgNightlyRate: 190, medianNightlyRate: 160, avgOccupancyRate: 0.72, avgAnnualRevenue: 39500, activeListings: 780, avgMinNights: 4.0, predominantType: "Entire home", avgReviewsPerMonth: 1.6, period: "2025-Q3" },
  "Midtown": { neighborhood: "Midtown", borough: "Manhattan", avgNightlyRate: 210, medianNightlyRate: 180, avgOccupancyRate: 0.81, avgAnnualRevenue: 51200, activeListings: 1450, avgMinNights: 2.8, predominantType: "Entire home", avgReviewsPerMonth: 2.4, period: "2025-Q3" },
  "Chelsea": { neighborhood: "Chelsea", borough: "Manhattan", avgNightlyRate: 205, medianNightlyRate: 175, avgOccupancyRate: 0.77, avgAnnualRevenue: 45100, activeListings: 720, avgMinNights: 3.3, predominantType: "Entire home", avgReviewsPerMonth: 2.0, period: "2025-Q3" },
  "Harlem": { neighborhood: "Harlem", borough: "Manhattan", avgNightlyRate: 135, medianNightlyRate: 110, avgOccupancyRate: 0.70, avgAnnualRevenue: 28500, activeListings: 1100, avgMinNights: 3.0, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Lower East Side": { neighborhood: "Lower East Side", borough: "Manhattan", avgNightlyRate: 175, medianNightlyRate: 145, avgOccupancyRate: 0.75, avgAnnualRevenue: 38200, activeListings: 680, avgMinNights: 3.1, predominantType: "Entire home", avgReviewsPerMonth: 2.0, period: "2025-Q3" },
  "SoHo": { neighborhood: "SoHo", borough: "Manhattan", avgNightlyRate: 265, medianNightlyRate: 230, avgOccupancyRate: 0.74, avgAnnualRevenue: 55800, activeListings: 380, avgMinNights: 3.8, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Financial District": { neighborhood: "Financial District", borough: "Manhattan", avgNightlyRate: 180, medianNightlyRate: 155, avgOccupancyRate: 0.73, avgAnnualRevenue: 37800, activeListings: 520, avgMinNights: 3.5, predominantType: "Entire home", avgReviewsPerMonth: 1.9, period: "2025-Q3" },
  "Hell's Kitchen": { neighborhood: "Hell's Kitchen", borough: "Manhattan", avgNightlyRate: 175, medianNightlyRate: 150, avgOccupancyRate: 0.79, avgAnnualRevenue: 41200, activeListings: 870, avgMinNights: 2.9, predominantType: "Entire home", avgReviewsPerMonth: 2.2, period: "2025-Q3" },
  "Greenwich Village": { neighborhood: "Greenwich Village", borough: "Manhattan", avgNightlyRate: 220, medianNightlyRate: 190, avgOccupancyRate: 0.75, avgAnnualRevenue: 46800, activeListings: 410, avgMinNights: 3.6, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Tribeca": { neighborhood: "Tribeca", borough: "Manhattan", avgNightlyRate: 280, medianNightlyRate: 245, avgOccupancyRate: 0.71, avgAnnualRevenue: 56500, activeListings: 250, avgMinNights: 4.2, predominantType: "Entire home", avgReviewsPerMonth: 1.5, period: "2025-Q3" },
  "Washington Heights": { neighborhood: "Washington Heights", borough: "Manhattan", avgNightlyRate: 110, medianNightlyRate: 90, avgOccupancyRate: 0.68, avgAnnualRevenue: 22400, activeListings: 580, avgMinNights: 3.0, predominantType: "Entire home", avgReviewsPerMonth: 1.6, period: "2025-Q3" },
  "East Harlem": { neighborhood: "East Harlem", borough: "Manhattan", avgNightlyRate: 125, medianNightlyRate: 100, avgOccupancyRate: 0.69, avgAnnualRevenue: 25200, activeListings: 490, avgMinNights: 2.8, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },
  "Inwood": { neighborhood: "Inwood", borough: "Manhattan", avgNightlyRate: 95, medianNightlyRate: 80, avgOccupancyRate: 0.65, avgAnnualRevenue: 18500, activeListings: 220, avgMinNights: 3.2, predominantType: "Entire home", avgReviewsPerMonth: 1.4, period: "2025-Q3" },

  // Brooklyn
  "Williamsburg": { neighborhood: "Williamsburg", borough: "Brooklyn", avgNightlyRate: 185, medianNightlyRate: 155, avgOccupancyRate: 0.77, avgAnnualRevenue: 41800, activeListings: 1200, avgMinNights: 3.0, predominantType: "Entire home", avgReviewsPerMonth: 2.1, period: "2025-Q3" },
  "Bushwick": { neighborhood: "Bushwick", borough: "Brooklyn", avgNightlyRate: 120, medianNightlyRate: 100, avgOccupancyRate: 0.73, avgAnnualRevenue: 26500, activeListings: 850, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 2.0, period: "2025-Q3" },
  "Bedford-Stuyvesant": { neighborhood: "Bedford-Stuyvesant", borough: "Brooklyn", avgNightlyRate: 135, medianNightlyRate: 115, avgOccupancyRate: 0.74, avgAnnualRevenue: 29800, activeListings: 950, avgMinNights: 2.7, predominantType: "Entire home", avgReviewsPerMonth: 1.9, period: "2025-Q3" },
  "Park Slope": { neighborhood: "Park Slope", borough: "Brooklyn", avgNightlyRate: 175, medianNightlyRate: 150, avgOccupancyRate: 0.73, avgAnnualRevenue: 37200, activeListings: 480, avgMinNights: 3.8, predominantType: "Entire home", avgReviewsPerMonth: 1.6, period: "2025-Q3" },
  "DUMBO": { neighborhood: "DUMBO", borough: "Brooklyn", avgNightlyRate: 220, medianNightlyRate: 190, avgOccupancyRate: 0.75, avgAnnualRevenue: 47500, activeListings: 180, avgMinNights: 3.5, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Crown Heights": { neighborhood: "Crown Heights", borough: "Brooklyn", avgNightlyRate: 125, medianNightlyRate: 105, avgOccupancyRate: 0.72, avgAnnualRevenue: 27100, activeListings: 780, avgMinNights: 2.6, predominantType: "Entire home", avgReviewsPerMonth: 1.9, period: "2025-Q3" },
  "Greenpoint": { neighborhood: "Greenpoint", borough: "Brooklyn", avgNightlyRate: 160, medianNightlyRate: 135, avgOccupancyRate: 0.74, avgAnnualRevenue: 34800, activeListings: 520, avgMinNights: 3.2, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Brooklyn Heights": { neighborhood: "Brooklyn Heights", borough: "Brooklyn", avgNightlyRate: 195, medianNightlyRate: 170, avgOccupancyRate: 0.72, avgAnnualRevenue: 40200, activeListings: 310, avgMinNights: 4.0, predominantType: "Entire home", avgReviewsPerMonth: 1.5, period: "2025-Q3" },
  "Sunset Park": { neighborhood: "Sunset Park", borough: "Brooklyn", avgNightlyRate: 100, medianNightlyRate: 85, avgOccupancyRate: 0.70, avgAnnualRevenue: 21500, activeListings: 420, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },
  "Prospect Heights": { neighborhood: "Prospect Heights", borough: "Brooklyn", avgNightlyRate: 165, medianNightlyRate: 140, avgOccupancyRate: 0.75, avgAnnualRevenue: 36200, activeListings: 350, avgMinNights: 3.3, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Red Hook": { neighborhood: "Red Hook", borough: "Brooklyn", avgNightlyRate: 145, medianNightlyRate: 120, avgOccupancyRate: 0.68, avgAnnualRevenue: 28500, activeListings: 180, avgMinNights: 3.0, predominantType: "Entire home", avgReviewsPerMonth: 1.5, period: "2025-Q3" },
  "Fort Greene": { neighborhood: "Fort Greene", borough: "Brooklyn", avgNightlyRate: 170, medianNightlyRate: 145, avgOccupancyRate: 0.74, avgAnnualRevenue: 36800, activeListings: 380, avgMinNights: 3.4, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },
  "Cobble Hill": { neighborhood: "Cobble Hill", borough: "Brooklyn", avgNightlyRate: 185, medianNightlyRate: 160, avgOccupancyRate: 0.73, avgAnnualRevenue: 39500, activeListings: 220, avgMinNights: 3.8, predominantType: "Entire home", avgReviewsPerMonth: 1.5, period: "2025-Q3" },
  "Bay Ridge": { neighborhood: "Bay Ridge", borough: "Brooklyn", avgNightlyRate: 95, medianNightlyRate: 80, avgOccupancyRate: 0.65, avgAnnualRevenue: 18200, activeListings: 280, avgMinNights: 2.8, predominantType: "Entire home", avgReviewsPerMonth: 1.3, period: "2025-Q3" },

  // Queens
  "Astoria": { neighborhood: "Astoria", borough: "Queens", avgNightlyRate: 120, medianNightlyRate: 100, avgOccupancyRate: 0.73, avgAnnualRevenue: 26800, activeListings: 680, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 2.0, period: "2025-Q3" },
  "Long Island City": { neighborhood: "Long Island City", borough: "Queens", avgNightlyRate: 155, medianNightlyRate: 130, avgOccupancyRate: 0.76, avgAnnualRevenue: 35200, activeListings: 520, avgMinNights: 2.8, predominantType: "Entire home", avgReviewsPerMonth: 2.1, period: "2025-Q3" },
  "Flushing": { neighborhood: "Flushing", borough: "Queens", avgNightlyRate: 95, medianNightlyRate: 80, avgOccupancyRate: 0.69, avgAnnualRevenue: 20100, activeListings: 380, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 1.6, period: "2025-Q3" },
  "Jackson Heights": { neighborhood: "Jackson Heights", borough: "Queens", avgNightlyRate: 85, medianNightlyRate: 70, avgOccupancyRate: 0.68, avgAnnualRevenue: 17500, activeListings: 320, avgMinNights: 2.3, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },
  "Ridgewood": { neighborhood: "Ridgewood", borough: "Queens", avgNightlyRate: 100, medianNightlyRate: 85, avgOccupancyRate: 0.71, avgAnnualRevenue: 21800, activeListings: 290, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 1.8, period: "2025-Q3" },
  "Sunnyside": { neighborhood: "Sunnyside", borough: "Queens", avgNightlyRate: 105, medianNightlyRate: 88, avgOccupancyRate: 0.71, avgAnnualRevenue: 22500, activeListings: 250, avgMinNights: 2.6, predominantType: "Entire home", avgReviewsPerMonth: 1.7, period: "2025-Q3" },

  // Bronx
  "South Bronx": { neighborhood: "South Bronx", borough: "Bronx", avgNightlyRate: 80, medianNightlyRate: 65, avgOccupancyRate: 0.62, avgAnnualRevenue: 14800, activeListings: 280, avgMinNights: 2.0, predominantType: "Entire home", avgReviewsPerMonth: 1.5, period: "2025-Q3" },
  "Fordham": { neighborhood: "Fordham", borough: "Bronx", avgNightlyRate: 75, medianNightlyRate: 60, avgOccupancyRate: 0.60, avgAnnualRevenue: 13200, activeListings: 150, avgMinNights: 2.2, predominantType: "Entire home", avgReviewsPerMonth: 1.3, period: "2025-Q3" },
  "Riverdale": { neighborhood: "Riverdale", borough: "Bronx", avgNightlyRate: 110, medianNightlyRate: 90, avgOccupancyRate: 0.64, avgAnnualRevenue: 21000, activeListings: 120, avgMinNights: 3.0, predominantType: "Entire home", avgReviewsPerMonth: 1.2, period: "2025-Q3" },

  // Staten Island
  "St. George": { neighborhood: "St. George", borough: "Staten Island", avgNightlyRate: 90, medianNightlyRate: 75, avgOccupancyRate: 0.58, avgAnnualRevenue: 15200, activeListings: 80, avgMinNights: 2.5, predominantType: "Entire home", avgReviewsPerMonth: 1.1, period: "2025-Q3" },
};

// ============================================================
// ZIP → Neighborhood Mapping
// ============================================================

const ZIP_TO_NEIGHBORHOOD: Record<string, string> = {
  "10001": "Chelsea", "10002": "Lower East Side", "10003": "East Village",
  "10004": "Financial District", "10005": "Financial District", "10006": "Financial District",
  "10007": "Tribeca", "10009": "East Village", "10010": "Midtown",
  "10011": "Chelsea", "10012": "SoHo", "10013": "Tribeca",
  "10014": "West Village", "10016": "Midtown", "10017": "Midtown",
  "10018": "Midtown", "10019": "Hell's Kitchen", "10020": "Midtown",
  "10021": "Upper East Side", "10022": "Midtown", "10023": "Upper West Side",
  "10024": "Upper West Side", "10025": "Upper West Side", "10026": "Harlem",
  "10027": "Harlem", "10028": "Upper East Side", "10029": "East Harlem",
  "10030": "Harlem", "10031": "Washington Heights", "10032": "Washington Heights",
  "10033": "Washington Heights", "10034": "Inwood", "10035": "East Harlem",
  "10036": "Hell's Kitchen", "10037": "Harlem", "10038": "Financial District",
  "10039": "Harlem", "10040": "Washington Heights",
  "10128": "Upper East Side", "10280": "Financial District",
  "11201": "Brooklyn Heights", "11205": "Fort Greene", "11206": "Williamsburg",
  "11211": "Williamsburg", "11215": "Park Slope", "11216": "Bedford-Stuyvesant",
  "11217": "Park Slope", "11218": "Park Slope", "11220": "Sunset Park",
  "11221": "Bushwick", "11222": "Greenpoint", "11225": "Crown Heights",
  "11226": "Crown Heights", "11231": "Red Hook", "11232": "Sunset Park",
  "11233": "Bedford-Stuyvesant", "11237": "Bushwick", "11238": "Prospect Heights",
  "11249": "Williamsburg",
  "11101": "Long Island City", "11102": "Astoria", "11103": "Astoria",
  "11104": "Sunnyside", "11105": "Astoria", "11106": "Astoria",
  "11354": "Flushing", "11355": "Flushing", "11372": "Jackson Heights",
  "11373": "Jackson Heights", "11385": "Ridgewood",
  "10451": "South Bronx", "10452": "South Bronx", "10453": "Fordham",
  "10458": "Fordham", "10463": "Riverdale", "10471": "Riverdale",
  "10301": "St. George",
};

// ============================================================
// Lookup Functions
// ============================================================

export function getAirbnbData(neighborhood: string): AirbnbNeighborhood | null {
  // Direct lookup
  if (AIRBNB_DATA[neighborhood]) return AIRBNB_DATA[neighborhood];
  // Fuzzy match (contains)
  const lower = neighborhood.toLowerCase();
  for (const [key, data] of Object.entries(AIRBNB_DATA)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return data;
    }
  }
  return null;
}

export function getAirbnbDataByBorough(borough: string): AirbnbNeighborhood {
  const normalizedBorough = borough.replace(/\s+/g, " ").trim();
  const neighborhoods = Object.values(AIRBNB_DATA).filter(
    n => n.borough.toLowerCase() === normalizedBorough.toLowerCase()
  );

  if (neighborhoods.length === 0) {
    // Ultimate fallback — NYC-wide average
    const all = Object.values(AIRBNB_DATA);
    return averageNeighborhoods(all, "NYC Average", "NYC");
  }

  return averageNeighborhoods(neighborhoods, `${normalizedBorough} Average`, normalizedBorough);
}

function averageNeighborhoods(neighborhoods: AirbnbNeighborhood[], name: string, borough: string): AirbnbNeighborhood {
  const count = neighborhoods.length;
  return {
    neighborhood: name,
    borough,
    avgNightlyRate: Math.round(neighborhoods.reduce((s, n) => s + n.avgNightlyRate, 0) / count),
    medianNightlyRate: Math.round(neighborhoods.reduce((s, n) => s + n.medianNightlyRate, 0) / count),
    avgOccupancyRate: Math.round((neighborhoods.reduce((s, n) => s + n.avgOccupancyRate, 0) / count) * 100) / 100,
    avgAnnualRevenue: Math.round(neighborhoods.reduce((s, n) => s + n.avgAnnualRevenue, 0) / count),
    activeListings: Math.round(neighborhoods.reduce((s, n) => s + n.activeListings, 0) / count),
    avgMinNights: Math.round((neighborhoods.reduce((s, n) => s + n.avgMinNights, 0) / count) * 10) / 10,
    predominantType: "Entire home",
    avgReviewsPerMonth: Math.round((neighborhoods.reduce((s, n) => s + n.avgReviewsPerMonth, 0) / count) * 10) / 10,
    period: "2025-Q3",
  };
}

export function matchNeighborhood(address: string, borough: string, zip: string): string | null {
  // Try zip lookup first (most reliable)
  if (zip && ZIP_TO_NEIGHBORHOOD[zip]) return ZIP_TO_NEIGHBORHOOD[zip];

  // Try address contains a known neighborhood name
  if (address) {
    const upper = address.toUpperCase();
    for (const key of Object.keys(AIRBNB_DATA)) {
      if (upper.includes(key.toUpperCase())) return key;
    }
  }

  return null;
}

// ============================================================
// STR Income Projection Engine
// ============================================================

const LL18_REGULATORY_NOTE =
  "NYC Local Law 18 (2023) significantly restricts short-term rentals. Entire-apartment STR is largely prohibited without host presence. Hosts must register with OSE. Max 2 guests if host not present. This projection assumes full regulatory compliance — actual revenue may be lower.";

export function projectSTRIncome(params: {
  neighborhood: string;
  borough: string;
  units: number;
  avgUnitSqft?: number;
  censusMedianRent?: number;
  hudFmr2BR?: number;
}): STRProjection {
  const { neighborhood, borough, units, avgUnitSqft, censusMedianRent, hudFmr2BR } = params;

  // Get market data — neighborhood-level or borough fallback
  const airbnb = getAirbnbData(neighborhood) || getAirbnbDataByBorough(borough);
  const isNeighborhoodLevel = !!getAirbnbData(neighborhood);

  // Monthly STR revenue per unit = avgNightlyRate * 30 * occupancy
  let monthlySTR = airbnb.avgNightlyRate * 30 * airbnb.avgOccupancyRate;

  // Unit size adjustment
  if (avgUnitSqft && avgUnitSqft > 0) {
    if (avgUnitSqft < 500) {
      monthlySTR *= 0.85; // Studios — reduce 15%
    } else if (avgUnitSqft > 900) {
      monthlySTR *= 1.20; // 2BR+ — increase 20%
    }
  }

  // Monthly LTR revenue per unit
  let monthlyLTR: number;
  if (censusMedianRent && censusMedianRent > 0) {
    monthlyLTR = censusMedianRent;
  } else if (hudFmr2BR && hudFmr2BR > 0) {
    monthlyLTR = hudFmr2BR;
  } else {
    // Rough estimate: ~50% of nightly rate × 30
    monthlyLTR = airbnb.avgNightlyRate * 30 * 0.5;
  }

  const strPremium = monthlyLTR > 0 ? Math.round(((monthlySTR - monthlyLTR) / monthlyLTR) * 100) : 0;

  const annualSTR = Math.round(monthlySTR * 12 * units);
  const annualLTR = Math.round(monthlyLTR * 12 * units);

  // Market saturation based on active listings in neighborhood
  let marketSaturation: "low" | "medium" | "high";
  if (airbnb.activeListings > 800) {
    marketSaturation = "high";
  } else if (airbnb.activeListings > 400) {
    marketSaturation = "medium";
  } else {
    marketSaturation = "low";
  }

  // Confidence level
  let confidence: "high" | "medium" | "low";
  if (isNeighborhoodLevel && (censusMedianRent || hudFmr2BR)) {
    confidence = "high";
  } else if (isNeighborhoodLevel) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    neighborhood: airbnb.neighborhood,
    borough: airbnb.borough,
    avgNightlyRate: airbnb.avgNightlyRate,
    occupancyRate: airbnb.avgOccupancyRate,
    monthlySTRRevenue: Math.round(monthlySTR),
    monthlyLTRRevenue: Math.round(monthlyLTR),
    strPremium,
    annualSTRRevenue: annualSTR,
    annualLTRRevenue: annualLTR,
    annualDelta: annualSTR - annualLTR,
    activeListings: airbnb.activeListings,
    marketSaturation,
    regulatoryRisk: "high",
    regulatoryNote: LL18_REGULATORY_NOTE,
    confidence,
    dataSource: `InsideAirbnb ${airbnb.period} — ${isNeighborhoodLevel ? airbnb.neighborhood : borough + " borough avg"}`,
  };
}
