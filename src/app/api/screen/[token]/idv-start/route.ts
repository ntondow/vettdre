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
import { createIdvSessionWithFallback } from "@/lib/screening/idv-factory";

const MAX_IDV_ATTEMPTS = 3;

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
    const authSession = await validateApplicantSession(
      token,
      req.headers.get("cookie"),
    );
    if (!authSession.valid) {
      return NextResponse.json(
        { error: authSession.error || "Invalid session" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { applicantId } = body as { applicantId?: string };

    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 });
    }

    // Load application + applicant
    const application = await prisma.screeningApplication.findFirst({
      where: { accessToken: token },
      include: {
        applicants: { where: { id: applicantId } },
        identityVerifications: {
          where: { applicantId },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!application || application.applicants.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const applicant = application.applicants[0];

    // Check attempt count
    const existingAttempts = await prisma.identityVerification.count({
      where: { applicantId, applicationId: application.id },
    });

    if (existingAttempts >= MAX_IDV_ATTEMPTS) {
      return NextResponse.json(
        { error: "Maximum verification attempts reached. You may skip this step." },
        { status: 429 },
      );
    }

    // Check if there's already an approved verification
    const existingApproved = application.identityVerifications.find(
      (v) => v.status === "approved",
    );
    if (existingApproved) {
      return NextResponse.json({
        status: "approved",
        sessionId: existingApproved.providerSessionId,
        message: "Identity already verified",
      });
    }

    // Build return URL
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    const returnUrl = `${appUrl}/screen/${token}?idv_status=complete`;

    // Create IDV session (with automatic failover)
    const idvSession = await createIdvSessionWithFallback({
      applicationId: application.id,
      applicantId,
      firstName: applicant.firstName || undefined,
      lastName: applicant.lastName || undefined,
      email: applicant.email,
      returnUrl,
    });

    // Store verification record
    await prisma.identityVerification.create({
      data: {
        applicantId,
        applicationId: application.id,
        provider: idvSession.provider,
        providerSessionId: idvSession.sessionId,
        providerWorkflowId: process.env.DIDIT_WORKFLOW_ID || null,
        status: "created",
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: req.headers.get("user-agent") || null,
        attempts: existingAttempts + 1,
        startedAt: new Date(),
      },
    });

    // Log event
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "idv_session_created",
        eventData: {
          provider: idvSession.provider,
          sessionId: idvSession.sessionId,
          attempt: existingAttempts + 1,
        } as any,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      },
    });

    return NextResponse.json({
      verificationUrl: idvSession.verificationUrl,
      sessionId: idvSession.sessionId,
      provider: idvSession.provider,
    });
  } catch (error) {
    console.error("[IDV Start] Error:", error);
    return NextResponse.json(
      { error: "Failed to start identity verification" },
      { status: 500 },
    );
  }
}
