/**
 * Screening Cross-App Integration
 *
 * Connects completed screenings to the rest of VettdRE:
 * - Auto-creates or links CRM Contacts from applicants
 * - Creates Activity timeline entries at screening milestones
 * - Creates EnrichmentProfile with financial data from screening
 */

import prisma from "@/lib/prisma";

// ── Contact Integration ──────────────────────────────────────

/**
 * After screening completes, find or create a CRM Contact for the primary applicant.
 * Links the ScreeningApplication.contactId to the Contact.
 * Returns the contactId (existing or newly created).
 */
export async function linkOrCreateContact(
  applicationId: string,
  orgId: string,
  agentUserId: string,
): Promise<string | null> {
  try {
    const application = await prisma.screeningApplication.findUnique({
      where: { id: applicationId },
      select: {
        contactId: true,
        propertyAddress: true,
        unitNumber: true,
        vettdreRiskScore: true,
        riskRecommendation: true,
        applicants: {
          where: { role: "main" },
          take: 1,
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            personalInfo: true,
          },
        },
      },
    });

    if (!application) return null;

    // Already linked to a contact
    if (application.contactId) return application.contactId;

    const mainApplicant = application.applicants[0];
    if (!mainApplicant) return null;

    // Normalize email for consistent lookup
    const normalizedEmail = mainApplicant.email?.trim().toLowerCase() || null;

    // Try to find existing contact by email first
    let contactId: string | null = null;

    if (normalizedEmail) {
      const existing = await prisma.contact.findFirst({
        where: { orgId, email: normalizedEmail },
        select: { id: true },
      });
      if (existing) contactId = existing.id;
    }

    // If no email match, try by phone
    if (!contactId && mainApplicant.phone) {
      const existing = await prisma.contact.findFirst({
        where: { orgId, phone: mainApplicant.phone },
        select: { id: true },
      });
      if (existing) contactId = existing.id;
    }

    // No match — create a new contact
    if (!contactId) {
      const newContact = await prisma.contact.create({
        data: {
          orgId,
          assignedTo: agentUserId,
          firstName: mainApplicant.firstName,
          lastName: mainApplicant.lastName,
          email: normalizedEmail,
          phone: mainApplicant.phone?.trim() || null,
          contactType: "renter",
          status: "lead",
          source: "screening",
          sourceDetail: `Screening for ${application.propertyAddress}${application.unitNumber ? ` #${application.unitNumber}` : ""}`,
          tags: ["screening"],
        },
      });
      contactId = newContact.id;
    }

    // Link the screening application to the contact
    await prisma.screeningApplication.update({
      where: { id: applicationId },
      data: { contactId },
    });

    // Create/update enrichment profile with screening financial data
    await createScreeningEnrichmentProfile(contactId, applicationId, orgId);

    return contactId;
  } catch (error) {
    console.error("[Screening Integration] linkOrCreateContact error:", error);
    return null;
  }
}

/**
 * Create an enrichment profile with financial data from the screening.
 * Does NOT store raw credit data — only aggregates safe for CRM display.
 */
async function createScreeningEnrichmentProfile(
  contactId: string,
  applicationId: string,
  orgId: string,
): Promise<void> {
  try {
    const application = await prisma.screeningApplication.findUnique({
      where: { id: applicationId },
      select: {
        vettdreRiskScore: true,
        riskRecommendation: true,
        wellnessProfile: {
          select: {
            healthTier: true,
            avgMonthlyIncome: true,
            disposableIncome: true,
            incomeToRentRatio: true,
          },
        },
        applicants: {
          where: { role: "main" },
          take: 1,
          select: {
            personalInfo: true,
            creditReports: {
              where: { status: "completed" },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { creditScore: true },
            },
          },
        },
      },
    });

    if (!application) return;

    const mainApplicant = application.applicants[0];
    const personalInfo = (mainApplicant?.personalInfo as Record<string, unknown>) || {};
    const creditScore = mainApplicant?.creditReports[0]?.creditScore;
    const wellness = application.wellnessProfile;

    await prisma.enrichmentProfile.create({
      data: {
        contactId,
        version: 1,
        employer: (personalInfo.employer as string) || null,
        jobTitle: (personalInfo.jobTitle as string) || null,
        confidenceLevel: "high",
        dataSources: ["screening"],
        rawData: {
          source: "vettdre_screening",
          applicationId,
          riskScore: application.vettdreRiskScore ? Number(application.vettdreRiskScore) : null,
          recommendation: application.riskRecommendation,
          creditScoreRange: creditScore
            ? creditScore >= 740 ? "excellent"
            : creditScore >= 670 ? "good"
            : creditScore >= 580 ? "fair"
            : "poor"
            : null,
          healthTier: wellness?.healthTier || null,
          estimatedMonthlyIncome: wellness?.avgMonthlyIncome ? Number(wellness.avgMonthlyIncome) : null,
          disposableIncome: wellness?.disposableIncome ? Number(wellness.disposableIncome) : null,
          incomeToRentRatio: wellness?.incomeToRentRatio ? Number(wellness.incomeToRentRatio) : null,
        },
      },
    });
  } catch (error) {
    console.error("[Screening Integration] createScreeningEnrichmentProfile error:", error);
  }
}

// ── Activity Timeline Integration ────────────────────────────

/**
 * Create a CRM Activity record for a screening milestone.
 * Links to both the contact and the screening application.
 */
export async function createScreeningActivity(
  orgId: string,
  contactId: string | null,
  agentUserId: string,
  subject: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    if (!contactId) {
      console.warn("[Screening Integration] createScreeningActivity skipped — no contactId linked yet");
      return;
    }

    await prisma.activity.create({
      data: {
        orgId,
        contactId,
        userId: agentUserId,
        type: "screening" as never, // ActivityType enum — resolves after prisma generate
        direction: "outbound",
        subject,
        body: null,
        metadata: metadata as Record<string, string | number | boolean | null>,
      },
    });

    // Update contact's lastActivityAt
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        lastActivityAt: new Date(),
        totalActivities: { increment: 1 },
      },
    });
  } catch (error) {
    console.error("[Screening Integration] createScreeningActivity error:", error);
  }
}

// ── Dashboard Stats ──────────────────────────────────────────

/**
 * Get screening stats for the main dashboard widget.
 */
export async function getScreeningDashboardStats(orgId: string): Promise<{
  inProgress: number;
  awaitingReview: number;
  approvedThisMonth: number;
  avgScore: number | null;
  recentScreenings: Array<{
    id: string;
    applicantName: string;
    propertyAddress: string;
    status: string;
    riskScore: number | null;
    recommendation: string | null;
    completedAt: string | null;
  }>;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [inProgress, awaitingReview, approvedThisMonth, scoreAgg, recent] = await Promise.all([
    // Applications currently processing
    prisma.screeningApplication.count({
      where: { orgId, status: { in: ["invited", "in_progress", "processing"] } },
    }),

    // Completed but no decision yet
    prisma.screeningApplication.count({
      where: { orgId, status: "complete", decisionAt: null },
    }),

    // Approved this month
    prisma.screeningApplication.count({
      where: {
        orgId,
        riskRecommendation: "approve",
        decisionAt: { gte: monthStart },
      },
    }),

    // Average risk score this month
    prisma.screeningApplication.aggregate({
      where: { orgId, vettdreRiskScore: { not: null }, completedAt: { gte: monthStart } },
      _avg: { vettdreRiskScore: true },
    }),

    // 3 most recent completed
    prisma.screeningApplication.findMany({
      where: { orgId, status: { in: ["complete", "approved", "conditional", "denied"] } },
      orderBy: { completedAt: "desc" },
      take: 3,
      select: {
        id: true,
        propertyAddress: true,
        status: true,
        vettdreRiskScore: true,
        riskRecommendation: true,
        completedAt: true,
        applicants: {
          where: { role: "main" },
          take: 1,
          select: { firstName: true, lastName: true },
        },
      },
    }),
  ]);

  return {
    inProgress,
    awaitingReview,
    approvedThisMonth,
    avgScore: scoreAgg._avg.vettdreRiskScore ? Number(scoreAgg._avg.vettdreRiskScore) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentScreenings: recent.map((s: any) => {
      const applicant = s.applicants?.[0];
      return {
        id: s.id,
        applicantName: applicant ? `${applicant.firstName} ${applicant.lastName}` : "Unknown",
        propertyAddress: s.propertyAddress,
        status: s.status,
        riskScore: s.vettdreRiskScore ? Number(s.vettdreRiskScore) : null,
        recommendation: s.riskRecommendation,
        completedAt: s.completedAt?.toISOString() || null,
      };
    }),
  };
}

// ── BMS Stats ────────────────────────────────────────────────

export type ScreeningBmsStats = {
  totalScreenings: number;
  approvalRate: number | null;
  avgRiskScore: number | null;
  pendingReview: number;
};

/**
 * Get screening stats for BMS dashboard and agent detail pages.
 */
export async function getScreeningBmsStats(
  orgId: string,
  agentUserId?: string,
  periodStart?: Date,
  periodEnd?: Date,
): Promise<ScreeningBmsStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { orgId };
  if (agentUserId) where.agentUserId = agentUserId;
  if (periodStart || periodEnd) {
    where.createdAt = {};
    if (periodStart) where.createdAt.gte = periodStart;
    if (periodEnd) where.createdAt.lte = periodEnd;
  }

  const [total, approved, completed, scoreAgg, pendingReview] = await Promise.all([
    prisma.screeningApplication.count({ where }),
    prisma.screeningApplication.count({
      where: { ...where, riskRecommendation: "approve" },
    }),
    prisma.screeningApplication.count({
      where: { ...where, status: { in: ["complete", "approved", "conditional", "denied"] } },
    }),
    prisma.screeningApplication.aggregate({
      where: { ...where, vettdreRiskScore: { not: null } },
      _avg: { vettdreRiskScore: true },
    }),
    prisma.screeningApplication.count({
      where: { ...where, status: "complete", decisionAt: null },
    }),
  ]);

  return {
    totalScreenings: total,
    approvalRate: completed > 0 ? Math.round((approved / completed) * 100) : null,
    avgRiskScore: scoreAgg._avg.vettdreRiskScore ? Number(scoreAgg._avg.vettdreRiskScore) : null,
    pendingReview,
  };
}
