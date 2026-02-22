"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { apolloFindPeopleAtOrg, apolloFindMorePeopleAtOrg, apolloEnrichPerson, apolloEnrichOrganization } from "@/lib/apollo";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function updateContact(contactId: string, formData: FormData) {
  const user = await getAuthUser();
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  if (!firstName || !lastName) throw new Error("First and last name are required");

  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      secondaryPhone: (formData.get("secondaryPhone") as string)?.trim() || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim() || null,
      zip: (formData.get("zip") as string)?.trim() || null,
      status: ((formData.get("status") as string) || "lead") as any,
      source: (formData.get("source") as string)?.trim() || null,
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { success: true };
}

export async function addNote(contactId: string, body: string) {
  const user = await getAuthUser();
  await prisma.activity.create({
    data: {
      orgId: user.orgId,
      contactId,
      userId: user.id,
      type: "note",
      subject: "Note added",
      body: body.trim(),
    },
  });
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { lastActivityAt: new Date(), totalActivities: { increment: 1 } },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function updateContactTypeData(contactId: string, typeData: any) {
  const user = await getAuthUser();
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { typeData },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function logInteraction(contactId: string, type: string, subject: string, body: string) {
  const user = await getAuthUser();
  await prisma.activity.create({
    data: {
      orgId: user.orgId,
      contactId,
      userId: user.id,
      type: type as any,
      direction: "outbound",
      subject: subject.trim(),
      body: body.trim() || null,
    },
  });
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: {
      lastContactedAt: new Date(),
      lastActivityAt: new Date(),
      totalActivities: { increment: 1 },
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function createTask(contactId: string, formData: FormData) {
  const user = await getAuthUser();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Title is required");

  await prisma.task.create({
    data: {
      orgId: user.orgId,
      contactId,
      assignedTo: user.id,
      createdBy: user.id,
      title: title.trim(),
      description: (formData.get("description") as string)?.trim() || null,
      type: (formData.get("type") as any) || "follow_up",
      priority: (formData.get("priority") as any) || "medium",
      dueAt: formData.get("dueAt") ? new Date(formData.get("dueAt") as string) : null,
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function completeTask(taskId: string, contactId: string) {
  const user = await getAuthUser();
  await prisma.task.updateMany({
    where: { id: taskId, orgId: user.orgId },
    data: { status: "completed", completedAt: new Date(), completedBy: user.id },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function updateTags(contactId: string, tags: string[]) {
  const user = await getAuthUser();
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { tags },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function deleteContact(contactId: string) {
  const user = await getAuthUser();
  await prisma.contact.deleteMany({
    where: { id: contactId, orgId: user.orgId },
  });
  revalidatePath("/contacts");
  return { success: true };
}

export async function findPeopleAtCompany(contactId: string) {
  const user = await getAuthUser();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    include: { enrichmentProfiles: { take: 1, orderBy: { enrichedAt: "desc" } } },
  });
  if (!contact) throw new Error("Contact not found");

  // Determine company name from typeData or enrichment
  const typeData = contact.typeData as any;
  const enrichment = contact.enrichmentProfiles[0];
  const companyName = typeData?.entityName
    || (enrichment?.rawData as any)?.apolloPerson?.company
    || enrichment?.employer
    || null;

  if (!companyName) return { people: [], companyName: null };

  const people = await apolloFindPeopleAtOrg(companyName);
  return { people, companyName };
}

export async function addPersonAsContact(
  person: { firstName: string; lastName: string; title: string | null; orgName: string | null },
  sourceContactId: string,
) {
  const user = await getAuthUser();
  const existing = await prisma.contact.findFirst({
    where: {
      orgId: user.orgId,
      firstName: { equals: person.firstName, mode: "insensitive" },
      lastName: { equals: person.lastName, mode: "insensitive" },
    },
  });
  if (existing) return { contactId: existing.id, alreadyExists: true };

  const contact = await prisma.contact.create({
    data: {
      orgId: user.orgId,
      assignedTo: user.id,
      firstName: person.firstName,
      lastName: person.lastName,
      source: "apollo_search",
      status: "lead",
      contactType: "landlord",
      typeData: { entityName: person.orgName || null },
      notes: `Found via Apollo People Search at ${person.orgName || "company"}. Title: ${person.title || "N/A"}. Source contact: ${sourceContactId}`,
    },
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${sourceContactId}`);
  return { contactId: contact.id, alreadyExists: false };
}

export async function enrichCompanyOnDemand(contactId: string) {
  const user = await getAuthUser();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    include: { enrichmentProfiles: { take: 1, orderBy: { enrichedAt: "desc" } } },
  });
  if (!contact) throw new Error("Contact not found");

  const typeData = (contact.typeData as any) || {};
  const enrichment = contact.enrichmentProfiles[0];
  const companyName = typeData.entityName
    || (enrichment?.rawData as any)?.apolloPerson?.company
    || enrichment?.employer
    || null;

  if (!companyName) return { error: "No company name found" };

  const orgResult = await apolloEnrichOrganization(companyName);
  if (!orgResult) return { error: "No organization data found" };

  // Save org data to contact's typeData
  const updatedTypeData = {
    ...typeData,
    orgIndustry: orgResult.industry,
    orgRevenue: orgResult.revenue,
    orgEmployees: orgResult.employeeCount,
    orgWebsite: orgResult.website,
    orgPhone: orgResult.phone,
    orgFounded: orgResult.foundedYear,
    orgLogo: orgResult.logoUrl,
    orgDescription: orgResult.shortDescription,
    orgLinkedin: orgResult.linkedinUrl,
    orgAddress: orgResult.address,
    orgCity: orgResult.city,
    orgState: orgResult.state,
    orgName: orgResult.name,
  };

  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { typeData: updatedTypeData },
  });

  // Also update enrichment profile rawData if it exists
  if (enrichment) {
    const rawData = (enrichment.rawData as any) || {};
    await prisma.enrichmentProfile.update({
      where: { id: enrichment.id },
      data: {
        rawData: { ...rawData, apolloOrg: orgResult },
      },
    });
  }

  revalidatePath(`/contacts/${contactId}`);
  return { success: true, orgData: orgResult };
}

export async function findMorePeopleAtCompany(contactId: string) {
  const user = await getAuthUser();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    include: { enrichmentProfiles: { take: 1, orderBy: { enrichedAt: "desc" } } },
  });
  if (!contact) throw new Error("Contact not found");

  const typeData = (contact.typeData as any) || {};
  const enrichment = contact.enrichmentProfiles[0];
  const companyName = typeData.entityName
    || (enrichment?.rawData as any)?.apolloPerson?.company
    || enrichment?.employer
    || null;

  if (!companyName) return { people: [], companyName: null };

  const people = await apolloFindMorePeopleAtOrg(companyName);
  return { people, companyName };
}

export async function getContactEnrichmentForCompose(contactId: string) {
  const user = await getAuthUser();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    include: { enrichmentProfiles: { take: 1, orderBy: { enrichedAt: "desc" } } },
  });
  if (!contact) return null;

  const enrichment = contact.enrichmentProfiles[0];
  const rawData = enrichment?.rawData as any;
  const apolloPerson = rawData?.apolloPerson;

  return {
    title: apolloPerson?.title || enrichment?.jobTitle || null,
    company: apolloPerson?.company || enrichment?.employer || null,
    firstName: contact.firstName,
    lastName: contact.lastName,
  };
}
