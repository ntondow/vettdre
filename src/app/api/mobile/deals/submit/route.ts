// ── POST /api/mobile/deals/submit ────────────────────────────
// Agent submits a new deal from mobile. Creates a DealSubmission record.
// Auto-calculates commission splits from the agent's default or plan tiers.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const {
      propertyAddress,
      unit,
      dealType = "rental",
      transactionValue,
      closingDate,
      commissionPct,
      clientName,
      clientEmail,
      clientPhone,
      representedSide,
      notes,
    } = body;

    // Validation
    if (!propertyAddress || !transactionValue) {
      return NextResponse.json(
        { error: "Property address and transaction value are required" },
        { status: 400 }
      );
    }

    // Validate financial inputs
    const txValue = parseFloat(String(transactionValue));
    if (isNaN(txValue) || txValue <= 0 || txValue > 999_999_999) {
      return NextResponse.json(
        { error: "Transaction value must be a positive number (max $999,999,999)" },
        { status: 400 }
      );
    }

    const commRate = commissionPct
      ? Math.min(100, Math.max(0, parseFloat(String(commissionPct))))
      : 6; // default 6%
    if (isNaN(commRate)) {
      return NextResponse.json(
        { error: "Commission percentage must be a valid number" },
        { status: 400 }
      );
    }

    // Validate closing date if provided
    let parsedClosingDate: Date | null = null;
    if (closingDate) {
      parsedClosingDate = new Date(closingDate);
      if (isNaN(parsedClosingDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid closing date format" },
          { status: 400 }
        );
      }
    }

    // Validate deal type
    const validDealTypes = ["sale", "lease", "rental"];
    if (!validDealTypes.includes(dealType)) {
      return NextResponse.json(
        { error: `Invalid deal type. Must be one of: ${validDealTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Get agent info for auto-fill
    const agent = ctx.agentId
      ? await prisma.brokerAgent.findUnique({
          where: { id: ctx.agentId },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            licenseNumber: true,
            defaultSplitPct: true,
            commissionPlanId: true,
          },
        })
      : null;

    // Resolve split percentage
    const agentSplit = Number(agent?.defaultSplitPct ?? 70);
    const houseSplit = 100 - agentSplit;

    // Calculate commission (txValue + commRate already validated above)
    const totalComm = txValue * (commRate / 100);
    const agentPayout = totalComm * (agentSplit / 100);
    const housePayout = totalComm * (houseSplit / 100);

    const submission = await prisma.dealSubmission.create({
      data: {
        orgId: ctx.orgId,
        agentId: ctx.agentId || null,
        agentFirstName: agent?.firstName || ctx.fullName.split(" ")[0] || "",
        agentLastName:
          agent?.lastName || ctx.fullName.split(" ").slice(1).join(" ") || "",
        agentEmail: agent?.email || ctx.email,
        agentPhone: agent?.phone || null,
        agentLicense: agent?.licenseNumber || null,

        propertyAddress,
        unit: unit || null,
        city: "New York",
        state: "NY",

        dealType,
        transactionValue: txValue,
        closingDate: parsedClosingDate,

        commissionType: "percentage",
        commissionPct: commRate,
        totalCommission: totalComm,
        agentSplitPct: agentSplit,
        houseSplitPct: houseSplit,
        agentPayout,
        housePayout,

        clientName: clientName || null,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        representedSide: representedSide || "tenant",

        notes: notes || null,
        status: "submitted",
        submissionSource: "mobile",
      },
    });

    // Fire automation for new deal submissions
    try {
      await dispatchAutomationSafe(
        ctx.orgId,
        "new_lead",
        { propertyAddress, dealType, transactionValue: txValue }
      );
    } catch {}

    return NextResponse.json(serialize(submission), { status: 201 });
  } catch (error: unknown) {
    console.error("[mobile/deals/submit] POST error:", error);
    return NextResponse.json(
      { error: "Failed to submit deal" },
      { status: 500 }
    );
  }
}
