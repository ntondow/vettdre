/**
 * OFAC SDN List Sync Cron Endpoint
 *
 * Downloads the OFAC SDN list and matches against Co_entities.
 * Schedule: weekly Monday 14:00 UTC (10:00 ET)
 *
 * The ingestOfacSdn function expects a pre-parsed JSON array.
 * This endpoint fetches the CSV from Treasury, parses it, and calls the ingest.
 */

import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { ingestOfacSdn } from "@/lib/condo-ingest/ofac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OFAC_SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const FETCH_TIMEOUT = 30000;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Fetch OFAC SDN CSV
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(OFAC_SDN_CSV_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: `OFAC download failed: HTTP ${res.status}` }, { status: 502 });
    }

    const csvText = await res.text();
    const records = parseOfacCsv(csvText);

    const result = await ingestOfacSdn(auth.orgId, records);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({
      error: "OFAC sync failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

/**
 * Parse OFAC SDN CSV into structured records.
 * SDN CSV format: ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type, Tonnage, GRT, Vess_flag, Vess_owner, Remarks
 */
function parseOfacCsv(csv: string): Array<{
  sdn_id: string;
  name: string;
  type?: string;
  program?: string;
  country?: string;
}> {
  const lines = csv.split("\n");
  const records: Array<{ sdn_id: string; name: string; type?: string; program?: string; country?: string }> = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // CSV fields are quoted; simple parse (OFAC CSV is well-formed)
    const fields = splitCsvLine(line);
    if (fields.length < 4) continue;

    const sdnId = fields[0]?.trim();
    const name = fields[1]?.trim().replace(/^"|"$/g, "");
    const type = fields[2]?.trim().replace(/^"|"$/g, "");
    const program = fields[3]?.trim().replace(/^"|"$/g, "");

    if (!sdnId || !name || sdnId === "ent_num") continue; // skip header

    records.push({ sdn_id: sdnId, name, type, program });
  }

  return records;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}
