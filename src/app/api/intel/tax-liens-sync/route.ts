import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { ingestTaxLiens } from "@/lib/condo-ingest/tax-liens";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await ingestTaxLiens(auth.orgId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "Tax liens sync failed", message: String(error) }, { status: 500 });
  }
}
