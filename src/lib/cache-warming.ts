"use server";

// Background cache warming for building profiles
// Warms only critical sources (PLUTO, HPD_REG) for a list of BBLs
// Fire-and-forget, staggered to avoid hammering NYC Open Data APIs

import { cacheManager } from "./cache-manager";

const NYC = "https://data.cityofnewyork.us/resource";

async function queryNYCDirect(dataset: string, where: string, opts?: { limit?: number }): Promise<any[]> {
  const url = new URL(`${NYC}/${dataset}.json`);
  url.searchParams.set("$where", where);
  url.searchParams.set("$limit", String(opts?.limit || 200));
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Warm cache for a list of BBLs. Fire-and-forget, staggered.
 * Only warms PLUTO + HPD_REG — critical, slow-changing sources.
 * Call from map search results or prospecting lists.
 */
export async function warmBuildingCache(bbls: string[]): Promise<void> {
  const unique = [...new Set(bbls)].slice(0, 20); // Cap at 20 to be safe
  const BATCH_SIZE = 5;
  const DELAY_MS = 200;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (bbl) => {
        const bbl10 = bbl.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
        const boroCode = bbl10[0];
        const block = bbl10.slice(1, 6).replace(/^0+/, "") || "0";
        const lot = bbl10.slice(6, 10).replace(/^0+/, "") || "0";

        // PLUTO — skip if already cached
        if (cacheManager.getSource(bbl10, "PLUTO") === null) {
          const data = await queryNYCDirect("64uk-42ks", `borocode='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 1 });
          cacheManager.setSource(bbl10, "PLUTO", data);
          cacheManager.setSourceInDB(bbl10, "PLUTO", data);
        }

        // HPD Registrations — skip if already cached
        if (cacheManager.getSource(bbl10, "HPD_REG") === null) {
          const data = await queryNYCDirect("tesw-yqqr", `boroid='${boroCode}' AND block='${block}' AND lot='${lot}'`, { limit: 5 });
          cacheManager.setSource(bbl10, "HPD_REG", data);
          cacheManager.setSourceInDB(bbl10, "HPD_REG", data);
        }
      }),
    );
    // Stagger batches
    if (i + BATCH_SIZE < unique.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
}
