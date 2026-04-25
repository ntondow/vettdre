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

    // Validate formData: reject oversized payloads and enforce expected fields
    const formDataStr = JSON.stringify(formData);
    if (formDataStr.length > 50_000) {
      return NextResponse.json(
        { error: "Form data too large (max 50KB)" },
        { status: 400 },
      );
    }
    const ALLOWED_FIELDS = new Set([
      "firstName", "lastName", "middleName", "email", "phone", "dateOfBirth",
      "currentAddress", "city", "state", "zip", "moveInDate", "monthlyIncome",
      "employerName", "employerPhone", "previousAddress", "previousCity",
      "previousState", "previousZip", "emergencyContactName", "emergencyContactPhone",
    ]);
    const sanitizedFormData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (ALLOWED_FIELDS.has(key) && (typeof value === "string" || typeof value === "number")) {
        sanitizedFormData[key] = typeof value === "string" ? value.slice(0, 500) : value;
      }
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
        personalInfo: sanitizedFormData,
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
