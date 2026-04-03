/**
 * Screening Report PDF Download API
 *
 * GET /api/screening/report/[applicationId]
 *
 * Returns a signed URL for the screening report PDF.
 * Auth: Requires authenticated user (agent or admin) with org access.
 *
 * Security:
 * - Org-scoped access control
 * - Role-based check (agent who created, or admin/owner)
 * - Rate limited (10 downloads/hour per user)
 * - Audit logging of every download
 * - No-cache headers on response
 * - Signed URL expires in 5 minutes
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  getClientIP,
  reportDownloadLimiter,
} from "@/lib/rate-limit";

const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

function getStorageAdmin() {
  return createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up DB user
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
    });
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
      });
    }
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Rate limiting
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(reportDownloadLimiter(), user.id);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many download requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    const { applicationId } = await params;

    // Find application — must belong to user's org
    const application = await prisma.screeningApplication.findFirst({
      where: {
        id: applicationId,
        orgId: user.orgId,
      },
      select: {
        id: true,
        reportPdfPath: true,
        reportGeneratedAt: true,
        propertyAddress: true,
        agentUserId: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Check access: agent who created it, or admin/owner
    const isAgent = application.agentUserId === user.id;
    const isAdmin = ["owner", "admin", "super_admin"].includes(user.role);
    if (!isAgent && !isAdmin) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Check if report exists
    if (!application.reportPdfPath) {
      return NextResponse.json(
        { error: "Report not yet generated. The screening is still processing." },
        { status: 404 }
      );
    }

    // Generate signed URL for download
    const admin = getStorageAdmin();
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from("screening-reports")
      .createSignedUrl(application.reportPdfPath, SIGNED_URL_EXPIRY_SECONDS, {
        download: true,
      });

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("[Screening Report] Signed URL error:", signedUrlError);
      return NextResponse.json(
        { error: "Failed to generate download link" },
        { status: 500 }
      );
    }

    // ── Audit Log: record every PDF access ──────────────────
    const ip = getClientIP(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Fire-and-forget audit — don't block the response
    prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        agentUserId: user.id,
        eventType: "report_downloaded",
        ipAddress: ip,
        eventData: {
          userEmail: user.email,
          userName: user.fullName,
          userRole: user.role,
          userAgent,
          signedUrlExpiresIn: SIGNED_URL_EXPIRY_SECONDS,
          downloadedAt: new Date().toISOString(),
        },
      },
    }).catch((err: unknown) => {
      console.error("[Screening Report] Audit log error:", err);
    });

    // ── Response with security headers ──────────────────────
    const fileName = `VettdRE_Screening_${application.propertyAddress.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40)}.pdf`;

    const response = NextResponse.json({
      url: signedUrlData.signedUrl,
      generatedAt: application.reportGeneratedAt?.toISOString() ?? null,
      fileName,
    });

    // Prevent caching of signed URLs
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    console.error("[Screening Report] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
