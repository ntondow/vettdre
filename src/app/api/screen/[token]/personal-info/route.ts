import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  screeningApiLimiter,
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

    // Rate limiting and session validation (soft requirements)
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(screeningApiLimiter(), token);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }

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
    }

    const body = await req.json();
    const { applicantId, formData } = body as {
      applicantId?: string;
      formData?: Record<string, unknown>;
    };

    if (!applicantId || !formData) {
      return NextResponse.json(
        { error: "Missing required fields: applicantId, formData" },
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

    // Update applicant (SSN is handled separately via submit-ssn endpoint)
    await prisma.screeningApplicant.update({
      where: { id: applicantId },
      data: {
        personalInfo: formData,
        currentStep: 2,
        status: "in_progress",
      },
    });

    // Create ScreeningEvent
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "step_completed",
        eventData: {
          step: "personal_info",
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Personal info POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
