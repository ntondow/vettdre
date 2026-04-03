import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOTP } from "@/lib/screening/otp";
import { sendTransactionalEmail, isResendConfigured } from "@/lib/resend";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  getClientIP,
  tokenAccessLimiter,
} from "@/lib/rate-limit";

/**
 * POST /api/screen/[token]/otp-send
 *
 * Generates a 6-digit OTP code, stores in Redis (10-min TTL),
 * and emails it to the primary applicant. Returns masked email for display.
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

    // Rate limiting — prevent OTP spam
    if (isRateLimitEnabled()) {
      const ip = getClientIP(req);
      const rl = await checkRateLimit(tokenAccessLimiter(), ip);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please wait before requesting another code." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    // Look up application + primary applicant
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          where: { role: "main" },
          select: { id: true, email: true, firstName: true },
          take: 1,
        },
        organization: { select: { name: true } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.status === "withdrawn") {
      return NextResponse.json({ error: "This application has been withdrawn." }, { status: 410 });
    }

    const applicant = application.applicants[0];
    if (!applicant) {
      return NextResponse.json({ error: "No applicant found" }, { status: 400 });
    }

    // Generate OTP (stored in Redis, 10-min TTL, 5 attempt limit)
    const code = await createOTP(applicant.id);

    // Mask email for display: n****w@gmail.com
    const email = applicant.email;
    const [localPart, domain] = email.split("@");
    const masked =
      localPart.length <= 2
        ? localPart[0] + "***@" + domain
        : localPart[0] + "****" + localPart[localPart.length - 1] + "@" + domain;

    // Send OTP email
    if (isResendConfigured()) {
      await sendTransactionalEmail({
        to: email,
        subject: `Your VettdRE verification code: ${code}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700;">Vettd<span style="color: #2563eb;">RE</span></span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
              <p style="font-size: 14px; color: #475569; margin: 0 0 20px;">
                Hi ${applicant.firstName || "there"}, here is your verification code to continue your screening application:
              </p>
              <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0f172a; background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 16px 24px; display: inline-block;">
                ${code}
              </div>
              <p style="font-size: 13px; color: #94a3b8; margin: 20px 0 0;">
                This code expires in 10 minutes. Do not share it with anyone.
              </p>
            </div>
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px;">
              Powered by VettdRE • Secure tenant screening
            </p>
          </div>
        `,
      });
    } else {
      // Dev fallback — log to console so local testing works
      console.log(`\n[OTP] Code for ${email}: ${code}\n`);
    }

    // Log event
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId: applicant.id,
        eventType: "otp_sent",
        eventData: { maskedEmail: masked },
      },
    });

    return NextResponse.json({
      success: true,
      maskedEmail: masked,
    });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
  }
}
