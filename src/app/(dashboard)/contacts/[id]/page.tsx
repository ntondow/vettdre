import { notFound } from "next/navigation";
import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import ContactDossier from "./contact-dossier";

async function getContact(id: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) return null;

  const contact = await prisma.contact.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      assignedAgent: { select: { fullName: true, email: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50, include: { user: { select: { fullName: true } } } },
      deals: { orderBy: { createdAt: "desc" }, include: { property: { select: { address: true, city: true, state: true } }, pipeline: { select: { name: true } } } },
      tasks: { orderBy: { dueAt: "asc" }, where: { status: { not: "completed" } } },
      showings: { orderBy: { scheduledAt: "desc" }, take: 10, include: { property: { select: { address: true, city: true, state: true } } } },
      enrichmentProfiles: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  return contact;
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();
  return <ContactDossier contact={contact} />;
}
