import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { fetchBuildingIntelligence } from "@/lib/data-fusion-engine";
import { generateBuildingReport } from "@/lib/pdf-report";
import { hasPermission, type UserPlan } from "@/lib/feature-gate";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bbl: string }> },
) {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const plan = (user.plan || "free") as UserPlan;

    // Feature gate
    if (!hasPermission(plan, "report_basic")) {
      return NextResponse.json({ error: "Upgrade to Explorer to download reports" }, { status: 403 });
    }

    const fullReport = hasPermission(plan, "report_full");

    // Validate BBL
    const { bbl } = await params;
    if (!bbl || bbl.length < 10) {
      return NextResponse.json({ error: "Invalid BBL" }, { status: 400 });
    }

    // Fetch building intelligence
    const intel = await fetchBuildingIntelligence(bbl);
    if (!intel) {
      return NextResponse.json({ error: "Could not fetch building data" }, { status: 500 });
    }

    // Generate PDF
    const pdfBuffer = generateBuildingReport(intel, { fullReport });

    // Clean address for filename
    const safeAddress = (intel.address.raw || bbl)
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="VettdRE-Report-${safeAddress}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Report generation error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
