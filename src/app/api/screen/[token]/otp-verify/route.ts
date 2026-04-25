import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyOTP } from "@/lib/screening/otp";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  screeningApiLimiter,
  getClientIP,
} from "@/lib/rate-limit";

/**
 * POST /api/screen/[token]/otp-verify
 *
 * Verifies a 6-digit OTP code. On success, marks the applicant as identity-verified.
 * Timing-safe comparison, 5-attempt limit, single-use.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Rate limiting
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(screeningApiLimiter(), getClientIP(req));
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    const body = await req.json();
    const { code } = body as { code?: string };

    if (!code || typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Please enter a valid 6-digit code" }, { status: 400 });
    }

    // Look up application + primary applicant
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          where: { role: "main" },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const applicant = application.applicants[0];
    if (!applicant) {
      return NextResponse.json({ error: "No applicant found" }, { status: 400 });
    }

    // Verify OTP (timing-safe, auto-invalidates after 5 failures)
    const result = await verifyOTP(applicant.id, code);

    if (!result.valid) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          remainingAttempts: result.remainingAttempts,
        },
        { status: 400 },
      );
    }

    // Clear OTP fields on applicant and mark as verified via otpTarget
    await prisma.screeningApplicant.update({
      where: { id: applicant.id },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        otpTarget: "verified",
        status: "in_progress",
      },
    });

    // Update application status from invited/draft → in_progress
    if (["draft", "invited"].includes(application.status)) {
      await prisma.screeningApplication.update({
        where: { id: application.id },
        data: { status: "in_progress" },
      });
    }

    // Log event
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId: applicant.id,
        eventType: "otp_verified",
        eventData: { verified: true },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
