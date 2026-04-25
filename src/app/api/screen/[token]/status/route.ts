import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  screeningApiLimiter,
  getClientIP,
} from "@/lib/rate-limit";
import { validateApplicantSession } from "@/lib/screening/session";

export async function GET(
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
          { error: "Too many requests" },
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

    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Build applicant statuses with step completion tracking
    const applicantStatuses = application.applicants.map((applicant: any) => ({
      id: applicant.id,
      name: `${applicant.firstName} ${applicant.lastName}`,
      email: applicant.email,
      status: applicant.status,
      completedSteps: [
        // Track which wizard steps have been completed
        // This would typically be populated from ScreeningEvent records
        // For now, return empty array — backend can populate from events
      ],
    }));

    return NextResponse.json({
      status: application.status,
      // Risk score and recommendation intentionally omitted from applicant-facing API (FCRA compliance)
      applicantStatuses,
    });
  } catch (error) {
    console.error("Status GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
