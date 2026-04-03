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

    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Build applicant statuses with step completion tracking
    const applicantStatuses = application.applicants.map((applicant: any) => ({
      id: applicant.id,
      name: `${applicant.firstName} ${applicant.lastName}`,
      email: applicant.email,
      status: applicant.status,
      completedSteps: [
        // Track which wizard steps have been completed
        // This would typically be populated from ScreeningEvent records
        // For now, return empty array — backend can populate from events
      ],
    }));

    return NextResponse.json({
      status: application.status,
      vettdreRiskScore: application.vettdreRiskScore ? Number(application.vettdreRiskScore) : null,
      riskRecommendation: application.riskRecommendation || null,
      applicantStatuses,
    });
  } catch (error) {
    console.error("Status GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
