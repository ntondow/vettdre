import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateSignatureHash } from "@/lib/screening/utils";
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
    const { applicantId, signatures } = body as {
      applicantId?: string;
      signatures?: Array<{
        documentType: string;
        signatureData: string;
        ipAddress?: string;
        userAgent?: string;
      }>;
    };

    if (!applicantId || !signatures || !Array.isArray(signatures)) {
      return NextResponse.json(
        { error: "Missing required fields: applicantId, signatures (array)" },
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

    const now = new Date().toISOString();

    // Create signature records
    for (const sig of signatures) {
      const hash = generateSignatureHash(
        sig.signatureData,
        sig.documentType,
        now,
      );

      await prisma.screeningSignature.create({
        data: {
          applicantId,
          documentType: sig.documentType,
          documentVersion: "1.0",
          documentText: sig.documentType, // Placeholder — full legal text stored separately
          signatureHash: hash,
          ipAddress: sig.ipAddress || "unknown",
          userAgent: sig.userAgent || "unknown",
        },
      });
    }

    // Update applicant step
    await prisma.screeningApplicant.update({
      where: { id: applicantId },
      data: { currentStep: 3 },
    });

    // Create ScreeningEvent
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "step_completed",
        eventData: {
          step: "signature",
          documentCount: signatures.length,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Signature POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
