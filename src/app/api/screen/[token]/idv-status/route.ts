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
import { getIdvProviderByName } from "@/lib/screening/idv-factory";
import { encryptToken } from "@/lib/encryption";

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

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Look up verification record
    const verification = await prisma.identityVerification.findUnique({
      where: { providerSessionId: sessionId },
    });

    if (!verification) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }

    // If already terminal, return cached result
    if (["approved", "declined", "expired", "abandoned"].includes(verification.status)) {
      return NextResponse.json({
        status: verification.status,
        provider: verification.provider,
        livenessScore: verification.livenessScore,
        faceMatchScore: verification.faceMatchScore,
        documentQuality: verification.documentQuality,
      });
    }

    // Poll provider for latest status
    try {
      const provider = getIdvProviderByName(verification.provider);
      const result = await provider.getResult(sessionId);

      // Update DB if status changed
      if (result.status !== verification.status) {
        await prisma.identityVerification.update({
          where: { providerSessionId: sessionId },
          data: {
            status: result.status,
            documentType: result.documentType || verification.documentType,
            firstName: result.firstName || verification.firstName,
            lastName: result.lastName || verification.lastName,
            dateOfBirth: result.dateOfBirth ? new Date(result.dateOfBirth) : verification.dateOfBirth,
            nationality: result.nationality || verification.nationality,
            issuingCountry: result.issuingCountry || verification.issuingCountry,
            livenessScore: result.livenessScore ?? verification.livenessScore,
            faceMatchScore: result.faceMatchScore ?? verification.faceMatchScore,
            documentQuality: result.documentQuality ?? verification.documentQuality,
            warnings: result.warnings.length > 0 ? result.warnings : verification.warnings,
            rawResponseEncrypted: result.rawResponse ? encryptToken(result.rawResponse) : verification.rawResponseEncrypted,
            completedAt: ["approved", "declined"].includes(result.status) ? new Date() : verification.completedAt,
          },
        });

        // Log event if terminal
        if (["approved", "declined"].includes(result.status)) {
          await prisma.screeningEvent.create({
            data: {
              applicationId: verification.applicationId,
              applicantId: verification.applicantId,
              eventType: result.status === "approved" ? "idv_approved" : "idv_declined",
              eventData: {
                provider: result.provider,
                sessionId,
                livenessScore: result.livenessScore,
                faceMatchScore: result.faceMatchScore,
              } as any,
            },
          });
        }
      }

      return NextResponse.json({
        status: result.status,
        provider: result.provider,
        livenessScore: result.livenessScore,
        faceMatchScore: result.faceMatchScore,
        documentQuality: result.documentQuality,
      });
    } catch (pollError) {
      // If polling fails, return last known status
      console.warn("[IDV Status] Poll failed, returning cached:", pollError);
      return NextResponse.json({
        status: verification.status,
        provider: verification.provider,
      });
    }
  } catch (error) {
    console.error("[IDV Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to check verification status" },
      { status: 500 },
    );
  }
}
