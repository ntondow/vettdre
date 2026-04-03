import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  WIZARD_STEPS,
  REQUIRED_LEGAL_DOCS,
  DEFAULT_FIELD_CONFIG,
} from "@/lib/screening/constants";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  getClientIP,
  tokenAccessLimiter,
} from "@/lib/rate-limit";
import {
  createApplicantSession,
} from "@/lib/screening/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Rate limiting (soft requirement)
    if (isRateLimitEnabled()) {
      const ip = getClientIP(_req);
      const rl = await checkRateLimit(tokenAccessLimiter(), ip);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            personalInfo: true,
            currentStep: true,
            createdAt: true,
            updatedAt: true,
            // NEVER select: ssnEncrypted
          },
        },
        organization: {
          select: { name: true },
        },
        agent: {
          select: { fullName: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    if (application.status === "withdrawn") {
      return NextResponse.json(
        {
          error:
            "This application has been withdrawn. Please contact the agent for assistance.",
        },
        { status: 410 },
      );
    }

    // Serialize dates and JSON objects properly
    const serialized = JSON.parse(JSON.stringify(application));

    const responseData = {
      application: serialized,
      applicants: serialized.applicants,
      orgName: application.organization.name,
      agentName: application.agent?.fullName || null,
      legalDocs: REQUIRED_LEGAL_DOCS,
      wizardSteps: WIZARD_STEPS,
      fieldConfig: DEFAULT_FIELD_CONFIG,
    };

    // Create session and set cookie (soft requirement)
    const response = NextResponse.json(responseData);
    if (isRateLimitEnabled()) {
      const ip = getClientIP(_req);
      const applicantIds = application.applicants.map((a: any) => a.id);
      const sessionInfo = await createApplicantSession(
        token,
        application.id,
        applicantIds,
        ip,
      );
      response.cookies.set(
        sessionInfo.cookieName,
        sessionInfo.cookieValue,
        sessionInfo.cookieOptions,
      );
    }

    return response;
  } catch (error) {
    console.error("Screen GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
