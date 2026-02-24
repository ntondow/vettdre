"use server";

// Thin server action wrapper for FRED API
// CRITICAL: No `export type` re-exports — clients import types directly from ./fred

import { fetchAllFredSeries, getCurrentMortgageRate } from "./fred";

export async function getFredSeries() {
  return fetchAllFredSeries();
}

export async function getFredMortgageRate() {
  return getCurrentMortgageRate();
}
