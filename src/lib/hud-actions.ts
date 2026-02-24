"use server";

// Thin server action wrapper for HUD FMR API
// CRITICAL: No `export type` re-exports — clients import types directly from ./hud

import { fetchFmrByZip } from "./hud";

export async function getHudFmr(zip: string) {
  return fetchFmrByZip(zip);
}
