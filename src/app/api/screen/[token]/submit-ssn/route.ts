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
import { encryptToken } from "@/lib/encryption";
import {
  storeSSN,
  isValidSSN,
} from "@/lib/screening/ssn-passthrough";

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
    const { applicantId, ssn } = body as {
      applicantId?: string;
      ssn?: string;
    };

    if (!applicantId || !ssn) {
      return NextResponse.json(
        { error: "Missing required fields: applicantId, ssn" },
        { status: 400 },
      );
    }

    // Validate SSN format
    if (!isValidSSN(ssn)) {
      return NextResponse.json(
        { error: "Invalid SSN format" },
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

    // Store SSN in Redis (NOT in database) and get reference ID
    const ssnRefId = await storeSSN(ssn, applicantId);

    // Store only the encrypted reference ID on the applicant record
    // The reference is encrypted so a DB breach doesn't expose Redis keys
    await prisma.screeningApplicant.update({
      where: { id: applicantId },
      data: {
        ssnEncrypted: encryptToken(`ref:${ssnRefId}`),
      },
    });

    // Don't expose ssnRefId to client — it's stored in DB for pipeline use only
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Submit SSN error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
