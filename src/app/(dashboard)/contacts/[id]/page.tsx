import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import ContactDossier from "./contact-dossier";

async function getContact(id: string, overrideAsOrg?: string) {
  const ctx = await getCurrentOrgContext({ overrideAsOrg });
  if (!ctx) return null;

  const contact = await prisma.contact.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      assignedAgent: { select: { fullName: true, email: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50, include: { user: { select: { fullName: true } } } },
      deals: { orderBy: { createdAt: "desc" }, include: { property: { select: { address: true, city: true, state: true } }, pipeline: { select: { name: true } } } },
      tasks: { orderBy: { dueAt: "asc" }, where: { status: { not: "completed" } } },
      showings: { orderBy: { scheduledAt: "desc" }, take: 10, include: { property: { select: { address: true, city: true, state: true } } } },
      enrichmentProfiles: { orderBy: { version: "desc" }, take: 1 },
      emailMessages: { orderBy: { receivedAt: "desc" }, take: 50, select: { id: true, direction: true, fromEmail: true, fromName: true, toEmails: true, subject: true, snippet: true, receivedAt: true, isRead: true, leadSource: true, aiSummary: true, sentimentScore: true } },
      screeningApplications: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          vettdreRiskScore: true,
          riskRecommendation: true,
          completedAt: true,
          propertyAddress: true,
          unitNumber: true,
          screeningTier: true,
          decisionAt: true,
        }
      },
    },
  });
  return contact;
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { id } = await params;
  const { as_org } = await searchParams;
  const contact = await getContact(id, as_org);
  if (!contact) notFound();
  return <ContactDossier contact={JSON.parse(JSON.stringify(contact))} />;
}
