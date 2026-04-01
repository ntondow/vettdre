// ── GET /api/mobile/contacts/[id] ──────────────────────────────
// Returns full contact dossier: profile, deals, recent activity, tasks, enrichment.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Contact ID required" }, { status: 400 });
    }

    const contact = await prisma.contact.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        // Non-admins can only view assigned or unassigned contacts
        ...(!ctx.isAdmin ? { OR: [{ assignedTo: ctx.userId }, { assignedTo: null }] } : {}),
      },
      include: {
        deals: {
          select: {
            id: true,
            dealValue: true,
            status: true,
            winProbability: true,
            stage: { select: { name: true } },
            pipeline: { select: { name: true } },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        activities: {
          select: {
            id: true,
            type: true,
            direction: true,
            subject: true,
            body: true,
            isAiGenerated: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        tasks: {
          where: { status: { in: ["pending", "in_progress"] } },
          select: {
            id: true,
            title: true,
            type: true,
            priority: true,
            dueAt: true,
            status: true,
          },
          orderBy: { dueAt: "asc" },
          take: 10,
        },
        enrichmentProfiles: {
          select: {
            id: true,
            employer: true,
            jobTitle: true,
            linkedinUrl: true,
            ownsProperty: true,
            confidenceLevel: true,
            dataSources: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        qualificationScores: {
          select: {
            totalScore: true,
            financialCapacity: true,
            intentSignals: true,
            engagementLevel: true,
            marketFit: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        showings: {
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            interestLevel: true,
            feedback: true,
            property: {
              select: { address: true },
            },
          },
          orderBy: { scheduledAt: "desc" },
          take: 5,
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const enrichment = contact.enrichmentProfiles[0] || null;
    const scoring = contact.qualificationScores[0] || null;

    return NextResponse.json(
      serialize({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        phone: contact.phone,
        secondaryPhone: contact.secondaryPhone,
        address: contact.address,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        contactType: contact.contactType,
        status: contact.status,
        source: contact.source,
        sourceDetail: contact.sourceDetail,
        tags: contact.tags,
        notes: contact.notes,
        lastContactedAt: contact.lastContactedAt,
        lastActivityAt: contact.lastActivityAt,
        totalActivities: contact.totalActivities,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,

        // Enrichment
        enrichment: enrichment
          ? {
              employer: enrichment.employer,
              jobTitle: enrichment.jobTitle,
              linkedinUrl: enrichment.linkedinUrl,
              ownsProperty: enrichment.ownsProperty,
              confidence: enrichment.confidenceLevel,
              sources: enrichment.dataSources,
            }
          : null,

        // Qualification score
        score: scoring
          ? {
              total: scoring.totalScore,
              financial: scoring.financialCapacity,
              intent: scoring.intentSignals,
              engagement: scoring.engagementLevel,
              marketFit: scoring.marketFit,
            }
          : null,

        // Related records
        deals: contact.deals.map((d) => ({
          id: d.id,
          value: d.dealValue ? Number(d.dealValue) : null,
          status: d.status,
          winProbability: d.winProbability,
          stage: d.stage?.name ?? null,
          pipeline: d.pipeline?.name ?? null,
          createdAt: d.createdAt,
        })),

        activities: contact.activities.map((a) => ({
          id: a.id,
          type: a.type,
          direction: a.direction,
          subject: a.subject,
          body: a.body ? a.body.substring(0, 200) : null,
          isAi: a.isAiGenerated,
          createdAt: a.createdAt,
        })),

        tasks: contact.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          priority: t.priority,
          dueAt: t.dueAt,
          status: t.status,
        })),

        showings: contact.showings.map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          status: s.status,
          interestLevel: s.interestLevel,
          feedback: s.feedback,
          propertyAddress: s.property?.address ?? null,
        })),
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/contacts/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contact" },
      { status: 500 }
    );
  }
}
