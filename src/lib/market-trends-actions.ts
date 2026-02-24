"use server";

// ============================================================
// Market Trends Server Actions
// Thin wrappers for FHFA + Redfin libraries
// Types imported directly from source modules by consumers
// ============================================================

import { getMarketAppreciation } from "./fhfa";
import { getRedfinMetrics, getRedfinMarketTemperature, getNycAggregate } from "./redfin-market";

export async function getAppreciation(zip: string) {
  return getMarketAppreciation(zip);
}

export async function getRedfin(zip: string) {
  return getRedfinMetrics(zip);
}

export async function getRedfinTemperature(zip: string) {
  return getRedfinMarketTemperature(zip);
}

export async function getRedfinNycAggregate() {
  return getNycAggregate();
}
