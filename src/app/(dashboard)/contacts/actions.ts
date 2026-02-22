"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { apolloBulkEnrich } from "@/lib/apollo";

// Helper: get or create the user's org
async function getOrCreateUserOrg(authUser: { id: string; email?: string; user_metadata?: { full_name?: string } }) {
  // Check if user already exists in our DB
  let user = await prisma.user.findUnique({ where: { authProviderId: authUser.id }, include: { organization: true } });

  if (!user) {
    // First time: create org + user
    const org = await prisma.organization.create({
      data: {
        name: `${authUser.user_metadata?.full_name || "My"}'s Organization`,
        slug: `org-${authUser.id.slice(0, 8)}`,
      },
    });

    user = await prisma.user.create({
      data: {
        orgId: org.id,
        authProviderId: authUser.id,
        email: authUser.email || "",
        fullName: authUser.user_metadata?.full_name || "User",
        role: "owner",
      },
      include: { organization: true },
    });
  }

  return { user, org: user.organization };
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { user, org } = await getOrCreateUserOrg(authUser);

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const city = formData.get("city") as string;
  const state = formData.get("state") as string;
  const source = formData.get("source") as string;
  const notes = formData.get("notes") as string;
  const contactType = (formData.get("contactType") as string) || "renter";
  const typeDataRaw = formData.get("typeData") as string;

  if (!firstName || !lastName) throw new Error("First and last name are required");

  let typeData = null;
  if (typeDataRaw) {
    try { typeData = JSON.parse(typeDataRaw); } catch { /* ignore */ }
  }

  await prisma.contact.create({
    data: {
      orgId: org.id,
      assignedTo: user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      source: source?.trim() || null,
      notes: notes?.trim() || null,
      contactType: contactType as any,
      typeData,
      status: "lead",
    },
  });

  revalidatePath("/contacts");
  return { success: true };
}

export async function getContacts() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { org } = await getOrCreateUserOrg(authUser);

  return prisma.contact.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    include: { assignedAgent: { select: { fullName: true } } },
  });
}

export async function deleteContact(contactId: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { org } = await getOrCreateUserOrg(authUser);

  await prisma.contact.deleteMany({
    where: { id: contactId, orgId: org.id },
  });

  revalidatePath("/contacts");
  return { success: true };
}

// ============================================================
// Bulk Enrichment (Apollo + PDL)
// ============================================================
export async function bulkEnrichContacts(contactIds: string[]): Promise<{
  enriched: number;
  newPhones: number;
  newEmails: number;
  creditsUsed: number;
  errors: number;
}> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { org } = await getOrCreateUserOrg(authUser);

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, orgId: org.id },
  });

  console.log("=== BULK ENRICHMENT ===", contacts.length, "contacts");

  let enriched = 0;
  let newPhones = 0;
  let newEmails = 0;
  let creditsUsed = 0;
  let errors = 0;

  // Process in batches of 10 (Apollo bulk limit)
  for (let i = 0; i < contacts.length; i += 10) {
    const batch = contacts.slice(i, i + 10);

    // Build Apollo bulk enrichment details
    const details = batch.map(c => ({
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email || undefined,
      organization_name: undefined as string | undefined,
    }));

    try {
      const apolloMatches = await apolloBulkEnrich(details);
      creditsUsed += batch.length;

      for (let j = 0; j < batch.length; j++) {
        const contact = batch[j];
        const apolloMatch = apolloMatches[j];

        try {
          const updates: any = {};
          let phoneFound = false;
          let emailFound = false;

          if (apolloMatch) {
            // Merge Apollo data into contact
            if (!contact.phone && apolloMatch.phone) {
              updates.phone = apolloMatch.phone;
              phoneFound = true;
            }
            const newEmail = apolloMatch.email || apolloMatch.personalEmails?.[0];
            if (!contact.email && newEmail) {
              updates.email = newEmail;
              emailFound = true;
            }

            // Save enrichment profile
            const dataSources = ["Apollo_Bulk"];
            await prisma.enrichmentProfile.upsert({
              where: { id: contact.id + "-v1" },
              create: {
                id: contact.id + "-v1",
                contactId: contact.id,
                version: 1,
                employer: apolloMatch.company || null,
                jobTitle: apolloMatch.title || null,
                linkedinUrl: apolloMatch.linkedinUrl || null,
                profilePhotoUrl: apolloMatch.photoUrl || null,
                dataSources,
                confidenceLevel: "medium",
                rawData: JSON.parse(JSON.stringify({ apolloBulk: apolloMatch })),
                aiSummary: [
                  apolloMatch.title && apolloMatch.company ? `${contact.firstName} works as ${apolloMatch.title} at ${apolloMatch.company}.` : null,
                  apolloMatch.phone ? "Phone found." : null,
                  apolloMatch.email ? "Email found." : null,
                ].filter(Boolean).join(" ") || "Enriched via Apollo bulk.",
              },
              update: {
                employer: apolloMatch.company || undefined,
                jobTitle: apolloMatch.title || undefined,
                linkedinUrl: apolloMatch.linkedinUrl || undefined,
                profilePhotoUrl: apolloMatch.photoUrl || undefined,
                rawData: JSON.parse(JSON.stringify({ apolloBulk: apolloMatch })),
                enrichedAt: new Date(),
              },
            });
          }

          if (Object.keys(updates).length > 0) {
            updates.enrichmentStatus = "enriched";
            updates.scoreUpdatedAt = new Date();
            await prisma.contact.update({ where: { id: contact.id }, data: updates });
          }

          if (apolloMatch) enriched++;
          if (phoneFound) newPhones++;
          if (emailFound) newEmails++;
        } catch (err) {
          console.error("  Bulk enrich error for", contact.firstName, contact.lastName, ":", err);
          errors++;
        }
      }
    } catch (err) {
      console.error("  Bulk batch error:", err);
      errors += batch.length;
    }
  }

  console.log(`=== BULK ENRICHMENT COMPLETE === ${enriched} enriched, ${newPhones} phones, ${newEmails} emails, ${creditsUsed} credits, ${errors} errors`);
  revalidatePath("/contacts");

  return { enriched, newPhones, newEmails, creditsUsed, errors };
}
