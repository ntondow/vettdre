"use server";

import { geocodeAddress as geocodioGeocode, getGeocodioBudget } from "@/lib/geocodio";
import type { GeocodioResult } from "@/lib/geocodio";
import { getCensusData, getCensusTimeSeries } from "@/lib/census";
import type { CensusData, CensusTrend } from "@/lib/census";

// ---- Types (exported as interfaces — safe in "use server" files) ----

export interface NeighborhoodProfile {
  // Geocodio basics
  formattedAddress: string;
  lat: number;
  lng: number;
  accuracy: number;
  county: string;
  state: string;
  zip: string;
  censusTract: string;

  // ACS quick data (from Geocodio — always available)
  quickStats: {
    medianHouseholdIncome: number | null;
    medianRent: number | null;
    medianHomeValue: number | null;
    totalPopulation: number | null;
    medianAge: number | null;
    vacancyRate: number | null;
    renterOccupiedPct: number | null;
  };

  // Detailed Census data (from Census Bureau API)
  census: CensusData | null;

  // Trend data (from Census time series — Pro+ only)
  trends: CensusTrend[] | null;

  // Computed signals
  signals: NeighborhoodSignal[];
}

export interface NeighborhoodSignal {
  label: string;
  value: string;
  sentiment: "positive" | "negative" | "neutral";
}

// ---- Fetch function ----

export async function fetchNeighborhoodProfile(
  address: string,
  options?: { includeTrends?: boolean },
): Promise<NeighborhoodProfile | null> {
  // Check budget
  const budget = getGeocodioBudget();
  if (budget.remaining <= 0) {
    console.warn("Geocodio budget exhausted, skipping neighborhood profile");
    return null;
  }

  // Step 1: Geocode with Geocodio (returns ACS data embedded)
  const geo = await geocodioGeocode(address);
  if (!geo || !geo.lat) return null;

  const quickStats = {
    medianHouseholdIncome: geo.medianHouseholdIncome ?? null,
    medianRent: geo.medianRentAsked ?? null,
    medianHomeValue: geo.medianHomeValue ?? null,
    totalPopulation: geo.totalPopulation ?? null,
    medianAge: geo.medianAge ?? null,
    vacancyRate: geo.vacancyRate ?? null,
    renterOccupiedPct: geo.renterOccupiedPct ?? null,
  };

  // Step 2: If we have FIPS + tract, fetch detailed Census data
  let census: CensusData | null = null;
  let trends: CensusTrend[] | null = null;

  if (geo.stateFips && geo.countyFips && geo.censusTract) {
    // Fetch detailed census data
    census = await getCensusData(geo.stateFips, geo.countyFips, geo.censusTract);

    // Fetch trends if requested (Pro+ only)
    if (options?.includeTrends) {
      trends = await getCensusTimeSeries(geo.stateFips, geo.countyFips, geo.censusTract);
    }
  }

  // Step 3: Generate market signals
  const signals = generateSignals(geo, census, trends);

  return {
    formattedAddress: geo.formatted_address,
    lat: geo.lat,
    lng: geo.lng,
    accuracy: geo.accuracy,
    county: geo.county,
    state: geo.state,
    zip: geo.zip,
    censusTract: geo.censusTract,
    quickStats,
    census,
    trends,
    signals,
  };
}

// ---- Signal generator ----

function generateSignals(
  geo: GeocodioResult,
  census: CensusData | null,
  trends: CensusTrend[] | null,
): NeighborhoodSignal[] {
  const signals: NeighborhoodSignal[] = [];
  const c = census;

  // Rent burden
  if (c && c.rentBurdenPct > 0) {
    const burdened = c.rentBurdenPct > 30;
    signals.push({
      label: "Rent Burden",
      value: `Residents spend ${c.rentBurdenPct.toFixed(0)}% of income on rent${burdened ? " (rent burdened)" : ""}`,
      sentiment: burdened ? "negative" : "positive",
    });
  }

  // Transit
  if (c && c.transitCommutePct > 0) {
    signals.push({
      label: "Transit Access",
      value: `${c.transitCommutePct.toFixed(0)}% commute by public transit`,
      sentiment: c.transitCommutePct > 30 ? "positive" : "neutral",
    });
  }

  // Work from home
  if (c && c.workFromHomePct > 10) {
    signals.push({
      label: "Remote Work",
      value: `${c.workFromHomePct.toFixed(0)}% work from home`,
      sentiment: "neutral",
    });
  }

  // Poverty
  if (c && c.povertyRate > 0) {
    signals.push({
      label: "Poverty Rate",
      value: `${c.povertyRate.toFixed(0)}% below poverty line`,
      sentiment: c.povertyRate > 20 ? "negative" : c.povertyRate < 10 ? "positive" : "neutral",
    });
  }

  // Vacancy
  if (c && c.vacancyRate > 0) {
    signals.push({
      label: "Vacancy",
      value: `${c.vacancyRate.toFixed(1)}% vacancy rate`,
      sentiment: c.vacancyRate > 10 ? "negative" : c.vacancyRate < 5 ? "positive" : "neutral",
    });
  }

  // Renter vs owner
  if (c && c.renterPct > 0) {
    signals.push({
      label: "Renter Demand",
      value: `${c.renterPct.toFixed(0)}% renter occupied`,
      sentiment: c.renterPct > 60 ? "positive" : "neutral",
    });
  }

  // Trend: income growth
  if (trends && trends.length >= 2) {
    const first = trends[0];
    const last = trends[trends.length - 1];
    if (first.medianHouseholdIncome && last.medianHouseholdIncome) {
      const growth = ((last.medianHouseholdIncome - first.medianHouseholdIncome) / first.medianHouseholdIncome) * 100;
      signals.push({
        label: "Income Trend",
        value: `Median income ${growth >= 0 ? "up" : "down"} ${Math.abs(growth).toFixed(0)}% since ${first.year}`,
        sentiment: growth > 5 ? "positive" : growth < -5 ? "negative" : "neutral",
      });
    }
    if (first.medianRent && last.medianRent) {
      const growth = ((last.medianRent - first.medianRent) / first.medianRent) * 100;
      signals.push({
        label: "Rent Trend",
        value: `Median rent ${growth >= 0 ? "up" : "down"} ${Math.abs(growth).toFixed(0)}% since ${first.year}`,
        sentiment: growth > 10 ? "positive" : "neutral",
      });
    }
  }

  // Affordability calc: median income / 12 / 0.30 = max affordable rent
  if (c && c.medianHouseholdIncome > 0 && c.medianRent > 0) {
    const maxAffordable = Math.round(c.medianHouseholdIncome / 12 * 0.30);
    const gap = maxAffordable - c.medianRent;
    if (gap > 0) {
      signals.push({
        label: "Rent Headroom",
        value: `Market rent $${gap.toLocaleString()}/mo below affordability ceiling ($${maxAffordable.toLocaleString()})`,
        sentiment: "positive",
      });
    } else {
      signals.push({
        label: "Rent Stretch",
        value: `Market rent exceeds 30% income threshold by $${Math.abs(gap).toLocaleString()}/mo`,
        sentiment: "negative",
      });
    }
  }

  return signals;
}

// ---- Helper: Generate AI context string for assumptions engine ----

export async function getCensusContextForAI(address: string): Promise<string | null> {
  const profile = await fetchNeighborhoodProfile(address, { includeTrends: false });
  if (!profile) return null;

  const c = profile.census;
  const q = profile.quickStats;

  const parts: string[] = [`Census data for tract ${profile.censusTract} (${profile.county}, ${profile.state}):`];

  const income = c?.medianHouseholdIncome || q.medianHouseholdIncome;
  if (income) parts.push(`Median household income: $${income.toLocaleString()}`);

  const rent = c?.medianRent || q.medianRent;
  if (rent) parts.push(`Median gross rent: $${rent.toLocaleString()}/mo`);

  const contractRent = c?.medianContractRent;
  if (contractRent) parts.push(`Median contract rent: $${contractRent.toLocaleString()}/mo`);

  const vacancy = c?.vacancyRate ?? q.vacancyRate;
  if (vacancy != null) parts.push(`Vacancy rate: ${vacancy.toFixed(1)}%`);

  const renterPct = c?.renterPct ?? q.renterOccupiedPct;
  if (renterPct != null) parts.push(`Renter occupied: ${renterPct.toFixed(0)}%`);

  if (c?.rentBurdenPct) parts.push(`Median rent burden: ${c.rentBurdenPct.toFixed(0)}% of income`);
  if (c?.transitCommutePct) parts.push(`Transit commute: ${c.transitCommutePct.toFixed(0)}%`);
  if (c?.povertyRate) parts.push(`Poverty rate: ${c.povertyRate.toFixed(0)}%`);

  // Max affordable rent
  if (income) {
    const maxAffordable = Math.round(income / 12 * 0.30);
    parts.push(`Max affordable rent (30% rule): $${maxAffordable.toLocaleString()}/mo`);
  }

  return parts.join("\n");
}
