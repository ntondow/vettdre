import { notFound } from "next/navigation";
import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import ContactDetail from "./contact-detail";

async function getContact(id: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) return null;

  return prisma.contact.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      assignedAgent: { select: { fullName: true, email: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <>
      <Header title={`${contact.firstName} ${contact.lastName}`} subtitle={contact.email || undefined} />
      <ContactDetail contact={contact} />
    </>
  );
}
