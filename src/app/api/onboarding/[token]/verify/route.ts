import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
      include: {
        agent: { select: { firstName: true, lastName: true, licenseNumber: true } },
        organization: { select: { name: true } },
        documents: {
          select: { id: true, docType: true, title: true, status: true, sortOrder: true, pdfUrl: true, templateId: true,
            template: { select: { fields: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }

    // Check voided or completed
    if (onboarding.status === "voided") {
      return NextResponse.json({ error: "This signing request has been cancelled" }, { status: 410 });
    }
    if (onboarding.status === "completed") {
      return NextResponse.json({ error: "All documents have already been signed" }, { status: 410 });
    }

    // Check expired
    if (onboarding.expiresAt && new Date(onboarding.expiresAt) < new Date()) {
      // Update status to expired
      await prisma.clientOnboarding.update({
        where: { id: onboarding.id },
        data: { status: "expired" },
      });
      return NextResponse.json({ error: "This signing link has expired" }, { status: 410 });
    }

    return NextResponse.json({
      clientFirstName: onboarding.clientFirstName,
      clientLastName: onboarding.clientLastName,
      clientEmail: onboarding.clientEmail,
      clientPhone: onboarding.clientPhone ?? null,
      brokerageName: onboarding.organization.name,
      agentFullName: onboarding.agent
        ? `${onboarding.agent.firstName} ${onboarding.agent.lastName}`
        : null,
      agentLicense: onboarding.agent?.licenseNumber ?? null,
      propertyAddress: onboarding.propertyAddress ?? null,
      commissionPct: onboarding.commissionPct ? Number(onboarding.commissionPct) : null,
      commissionFlat: (onboarding as unknown as Record<string, unknown>).commissionFlat
        ? Number((onboarding as unknown as Record<string, unknown>).commissionFlat)
        : null,
      monthlyRent: onboarding.monthlyRent ? Number(onboarding.monthlyRent) : null,
      termDays: onboarding.expiresAt
        ? Math.ceil((new Date(onboarding.expiresAt).getTime() - new Date(onboarding.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      effectiveThrough: onboarding.expiresAt
        ? new Date(onboarding.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : null,
      onboardingStatus: onboarding.status,
      documents: onboarding.documents.map((d) => ({
        id: d.id,
        docType: d.docType,
        docTitle: d.title,
        status: d.status,
        docOrder: d.sortOrder,
        pdfUrl: d.pdfUrl ?? null,
        fields: Array.isArray((d.template as Record<string, unknown> | null)?.fields)
          ? (d.template as unknown as { fields: unknown[] }).fields
          : [],
      })),
    });
  } catch (error) {
    console.error("Onboarding verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
