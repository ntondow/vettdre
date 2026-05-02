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

    // Generic 410 for not-found (#16) — was 404, which let attackers
    // distinguish "valid token, voided" from "invalid token". Returning the
    // same shape for both cases removes the enumeration vector.
    if (!onboarding) {
      return NextResponse.json({ error: "This signing link is no longer valid" }, { status: 410 });
    }

    // Check voided
    if (onboarding.status === "voided") {
      return NextResponse.json({ error: "This signing request has been cancelled" }, { status: 410 });
    }

    // Completed onboardings still return 200 — the signing UI routes them to
    // the "already complete" branch where the client can download their copies.
    // Returning 410 here was misclassifying success as error.

    // Check expired (#14) — fire-and-forget the cached status flip so the GET
    // response isn't blocked on a write. Source of truth is `expiresAt < now()`;
    // the cached `status: "expired"` is just a denormalized hint for agent-side
    // queries and doesn't gate any read logic here.
    if (onboarding.expiresAt && new Date(onboarding.expiresAt) < new Date()) {
      if (onboarding.status !== "expired") {
        prisma.clientOnboarding
          .update({ where: { id: onboarding.id }, data: { status: "expired" } })
          .catch((err) => console.error("Onboarding expired-cache update failed:", err));
      }
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
