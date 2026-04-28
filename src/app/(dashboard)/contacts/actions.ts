"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";
import { apolloBulkEnrich } from "@/lib/apollo";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";

// Auto-provisioning lives in the auth middleware now; by the time any of these
// server actions run, the (User, Organization) pair already exists. ctx.orgId
// is override-aware (super_admin ?as_org=...).

export async function createContact(formData: FormData) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  const user = { id: ctx.userId, role: ctx.userRole };
  const org = { id: ctx.orgId };

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

  const contact = await prisma.contact.create({
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

  // Fire automation: new_lead
  dispatchAutomationSafe(org.id, "new_lead", {
    contactId: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    source: contact.source,
    email: contact.email,
    phone: contact.phone,
    createdAt: new Date().toISOString(),
  }, contact.id);

  revalidatePath("/contacts");
  return { success: true };
}

export async function getContacts(limit = 200, offset = 0) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return [];
  const user = { id: ctx.userId, role: ctx.userRole };
  const org = { id: ctx.orgId };

  // Agents only see their own contacts; admins/owners see all org contacts
  const isAdmin = ["super_admin", "owner", "admin"].includes(user.role);
  const where: Record<string, unknown> = { orgId: org.id };
  if (!isAdmin) {
    where.assignedTo = user.id;
  }

  return prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { assignedAgent: { select: { fullName: true } } },
    take: Math.min(limit, 500), // Cap at 500 to prevent unbounded queries
    skip: offset,
  });
}

export async function deleteContact(contactId: string) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  const user = { id: ctx.userId, role: ctx.userRole };
  const org = { id: ctx.orgId };

  // Agents can only delete their own contacts
  const isAdmin = ["super_admin", "owner", "admin"].includes(user.role);
  const where: Record<string, unknown> = { id: contactId, orgId: org.id };
  if (!isAdmin) {
    where.assignedTo = user.id;
  }

  await prisma.contact.deleteMany({
    where,
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
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  const org = { id: ctx.orgId };

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

          if (apolloMatch) {
            enriched++;
            // Fire automation: contact_enriched
            dispatchAutomationSafe(org.id, "contact_enriched", {
              contactId: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              enrichmentType: "Apollo_Bulk",
              confidenceLevel: "medium",
            }, contact.id);
          }
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
