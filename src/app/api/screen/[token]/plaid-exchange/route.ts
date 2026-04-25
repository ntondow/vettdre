import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { exchangePublicToken } from "@/lib/screening/plaid";
import { encryptToken } from "@/lib/encryption";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  screeningApiLimiter,
  getClientIP,
} from "@/lib/rate-limit";
import { validateApplicantSession } from "@/lib/screening/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Rate limiting (optional — depends on Redis config)
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(screeningApiLimiter(), getClientIP(req));
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    // Session validation (mandatory)
    const session = await validateApplicantSession(
      token,
      req.headers.get("cookie"),
    );
    if (!session.valid) {
      return NextResponse.json(
        { error: session.error || "Invalid session" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { applicantId, publicToken, institutionId, institutionName } = body as {
      applicantId?: string;
      publicToken?: string;
      institutionId?: string;
      institutionName?: string;
    };

    if (!applicantId || !publicToken) {
      return NextResponse.json(
        { error: "Missing required fields: applicantId, publicToken" },
        { status: 400 },
      );
    }

    // Validate optional input lengths and format
    if (institutionName && institutionName.length > 255) {
      return NextResponse.json(
        { error: "Institution name too long (max 255 characters)" },
        { status: 400 },
      );
    }
    if (institutionId && (institutionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(institutionId))) {
      return NextResponse.json(
        { error: "Invalid institution ID format" },
        { status: 400 },
      );
    }

    // Look up application by token
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: { applicants: { select: { id: true } } },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Reject submissions on finalized applications
    const openStatuses = ["draft", "invited", "in_progress"];
    if (!openStatuses.includes(application.status)) {
      return NextResponse.json(
        { error: "Application is no longer accepting submissions" },
        { status: 410 },
      );
    }

    // Verify applicant belongs to this application
    const applicantExists = application.applicants.some(
      (a: any) => a.id === applicantId,
    );
    if (!applicantExists) {
      return NextResponse.json(
        { error: "Applicant not found in this application" },
        { status: 404 },
      );
    }

    // Mock mode: skip real Plaid API, create a synthetic connection
    let resolvedInstitutionName = institutionName || null;

    if (process.env.SCREENING_USE_MOCKS === "true") {
      const mockItemId = `mock-item-${applicantId.slice(0, 8)}`;
      resolvedInstitutionName = institutionName || "Mock Bank (Sandbox)";
      await prisma.plaidConnection.create({
        data: {
          applicantId,
          accessTokenEncrypted: encryptToken("access-sandbox-mock-token"),
          plaidItemId: mockItemId,
          institutionId: institutionId || "ins_mock_sandbox",
          institutionName: resolvedInstitutionName,
          status: "active",
          accounts: [
            { account_id: "mock-checking", name: "Mock Checking", type: "depository", subtype: "checking", balances: { current: 4250, available: 4100 } },
            { account_id: "mock-savings", name: "Mock Savings", type: "depository", subtype: "savings", balances: { current: 12800, available: 12800 } },
          ],
        },
      });
    } else {
      // Exchange public token for access token
      const plaidResult = await exchangePublicToken(publicToken);
      resolvedInstitutionName = plaidResult.institutionName || institutionName || null;

      // Encrypt the access token
      const encryptedAccessToken = encryptToken(plaidResult.accessToken);

      // Create PlaidConnection record
      await prisma.plaidConnection.create({
        data: {
          applicantId,
          accessTokenEncrypted: encryptedAccessToken,
          plaidItemId: plaidResult.itemId,
          institutionId: plaidResult.institutionId || institutionId || null,
          institutionName: resolvedInstitutionName,
          status: "active",
        },
      });
    }

    // Update applicant step
    await prisma.screeningApplicant.update({
      where: { id: applicantId },
      data: { currentStep: 4 },
    });

    // Create ScreeningEvent
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "step_completed",
        eventData: {
          step: "plaid",
          institutionName: resolvedInstitutionName,
        },
      },
    });

    return NextResponse.json({
      success: true,
      institutionName: resolvedInstitutionName,
    });
  } catch (error) {
    console.error("Plaid exchange POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
