// ── Shared PLUTO Lookup Helper ─────────────────────────────────
// Used by mobile scout routes to resolve addresses to BBL via
// NYC Open Data PLUTO API. Centralizes SoQL escaping and query logic.

const NYC = "https://data.cityofnewyork.us/resource";
const PLUTO = "64uk-42ks";

/** Escape single quotes for SoQL $where clauses to prevent injection */
export function escapeSoQL(str: string): string {
  return str.replace(/'/g, "''");
}

export interface PlutoResult {
  borocode: string;
  block: string;
  lot: string;
  address?: string;
}

/**
 * Search PLUTO by street address and return the best match.
 * Returns null if no match is found.
 */
export async function lookupPlutoByAddress(
  address: string
): Promise<PlutoResult | null> {
  const normalized = address.toUpperCase().trim();
  if (!normalized) return null;

  const parts = normalized.split(/\s+/);
  const houseNum = parts[0];
  const streetPart = parts.slice(1).join(" ");

  let searchCondition: string;
  if (/^\d+$/.test(houseNum) && streetPart.length > 0) {
    searchCondition = `upper(address) like '${escapeSoQL(houseNum)} ${escapeSoQL(streetPart)}%'`;
  } else {
    searchCondition = `upper(address) like '%${escapeSoQL(normalized)}%'`;
  }

  const url = new URL(`${NYC}/${PLUTO}.json`);
  url.searchParams.set("$where", searchCondition);
  url.searchParams.set("$select", "borocode,block,lot,address");
  url.searchParams.set("$limit", "1");
  url.searchParams.set("$order", "unitsres DESC");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return data[0] as PlutoResult;
}

/**
 * Parse a 10-digit BBL string into its components.
 * Returns null for invalid format.
 */
export function parseBBL(bbl: string): {
  borocode: string;
  block: string;
  lot: string;
} | null {
  const match = bbl.match(/^(\d)(\d{5})(\d{4})$/);
  if (!match) return null;

  const boroCode = parseInt(match[1]);
  if (boroCode < 1 || boroCode > 5) return null;

  return {
    borocode: match[1],
    block: String(parseInt(match[2])), // strip leading zeros
    lot: String(parseInt(match[3])),
  };
}
