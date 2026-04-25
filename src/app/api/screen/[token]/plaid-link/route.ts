import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createLinkToken } from "@/lib/screening/plaid";
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
    const { applicantId } = body as {
      applicantId?: string;
    };

    if (!applicantId) {
      return NextResponse.json(
        { error: "Missing required field: applicantId" },
        { status: 400 },
      );
    }

    // Look up application by token
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: { applicants: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Verify applicant belongs to this application
    const applicant = application.applicants.find(
      (a: any) => a.id === applicantId,
    );
    if (!applicant) {
      return NextResponse.json(
        { error: "Applicant not found in this application" },
        { status: 404 },
      );
    }

    // Mock mode: return a fake link token instead of calling Plaid
    if (process.env.SCREENING_USE_MOCKS === "true") {
      const mockToken = `link-sandbox-mock-token-${applicantId.slice(0, 8)}`;
      return NextResponse.json({ linkToken: mockToken });
    }

    // Create Plaid Link token
    const { linkToken } = await createLinkToken({
      applicantId,
      applicantName: `${applicant.firstName} ${applicant.lastName}`,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/screen/oauth`,
    });

    return NextResponse.json({ linkToken });
  } catch (error) {
    console.error("Plaid link POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
