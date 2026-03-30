import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const docType = req.nextUrl.searchParams.get("docType");

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
      include: {
        documents: {
          select: { id: true, docType: true, title: true, status: true, pdfUrl: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }

    if (onboarding.status !== "completed") {
      return NextResponse.json(
        { error: "Documents are only available for download after all documents have been signed" },
        { status: 403 },
      );
    }

    // Log the download
    await prisma.signingAuditLog.create({
      data: {
        onboardingId: onboarding.id,
        action: "downloaded",
        actorType: "client",
        actorName: `${onboarding.clientFirstName} ${onboarding.clientLastName}`,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          || req.headers.get("x-real-ip")
          || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        metadata: { docType: docType || "all" },
      },
    });

    if (docType) {
      // Single document download
      const doc = onboarding.documents.find((d) => d.docType === docType);
      if (!doc) {
        return NextResponse.json({ error: `Document type "${docType}" not found` }, { status: 404 });
      }
      if (doc.status !== "signed" || !doc.pdfUrl) {
        return NextResponse.json({ error: "Signed document not available" }, { status: 404 });
      }

      // Redirect to the PDF URL
      return NextResponse.redirect(doc.pdfUrl);
    }

    // All documents — return JSON with download URLs
    const downloads = onboarding.documents
      .filter((d) => d.status === "signed" && d.pdfUrl)
      .map((d) => ({
        docType: d.docType,
        title: d.title,
        downloadUrl: d.pdfUrl,
      }));

    return NextResponse.json({ documents: downloads });
  } catch (error) {
    console.error("Onboarding download error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
