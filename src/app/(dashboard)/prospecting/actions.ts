"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { apolloBulkEnrich, apolloEnrichPerson } from "@/lib/apollo";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function getLists() {
  const user = await getAuthUser();
  return prisma.prospectingList.findMany({
    where: { orgId: user.orgId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } }, creator: { select: { fullName: true } } },
  });
}

export async function createList(name: string, description?: string) {
  const user = await getAuthUser();
  const list = await prisma.prospectingList.create({
    data: { orgId: user.orgId, createdBy: user.id, name, description },
  });
  revalidatePath("/prospecting");
  return list;
}

export async function deleteList(listId: string) {
  const user = await getAuthUser();
  await prisma.prospectingList.deleteMany({ where: { id: listId, orgId: user.orgId } });
  revalidatePath("/prospecting");
}

export async function getListItems(listId: string) {
  const user = await getAuthUser();
  return prisma.prospectingItem.findMany({
    where: { listId, orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, name: true, status: true } },
    },
  });
}

export async function addBuildingToList(listId: string, building: any) {
  const user = await getAuthUser();
  await prisma.prospectingItem.create({ data: { listId, orgId: user.orgId, ...building } });
  revalidatePath("/prospecting");
  return { success: true };
}

export async function updateItemStatus(itemId: string, status: string, notes?: string) {
  const user = await getAuthUser();
  await prisma.prospectingItem.updateMany({
    where: { id: itemId, orgId: user.orgId },
    data: { status, ...(notes !== undefined ? { notes } : {}) },
  });
  revalidatePath("/prospecting");
}

export async function removeItem(itemId: string) {
  const user = await getAuthUser();
  await prisma.prospectingItem.deleteMany({ where: { id: itemId, orgId: user.orgId } });
  revalidatePath("/prospecting");
}

export async function convertToContact(itemId: string, firstName: string, lastName: string, email?: string, phone?: string) {
  const user = await getAuthUser();
  const item = await prisma.prospectingItem.findFirst({ where: { id: itemId, orgId: user.orgId } });
  if (!item) throw new Error("Item not found");

  const contact = await prisma.contact.create({
    data: {
      orgId: user.orgId, assignedTo: user.id, firstName, lastName,
      email: email || null, phone: phone || null, source: "market_intel", status: "lead",
      notes: `From prospecting: ${item.address}${item.ownerName ? ` (Owner: ${item.ownerName})` : ""}`,
      city: item.borough || null, state: "NY", zip: item.zip || null,
    },
  });

  await prisma.prospectingItem.update({ where: { id: itemId }, data: { contactId: contact.id, status: "converted" } });
  revalidatePath("/prospecting");
  revalidatePath("/contacts");
  return contact;
}

export async function createDealFromItem(itemId: string, dealName: string, dealValue?: number) {
  const user = await getAuthUser();
  const item = await prisma.prospectingItem.findFirst({ where: { id: itemId, orgId: user.orgId } });
  if (!item || !item.contactId) throw new Error("Convert to contact first");

  const pipeline = await prisma.pipeline.findFirst({ where: { orgId: user.orgId, isDefault: true } });
  if (!pipeline) throw new Error("No pipeline found");

  const deal = await prisma.deal.create({
    data: {
      orgId: user.orgId, contactId: item.contactId, pipelineId: pipeline.id,
      stageId: "new_lead", assignedTo: user.id, name: dealName,
      dealValue: dealValue || null, status: "open",
      notes: `Property: ${item.address}${item.totalUnits ? ` (${item.totalUnits} units)` : ""}`,
    },
  });

  await prisma.prospectingItem.update({ where: { id: itemId }, data: { dealId: deal.id } });
  revalidatePath("/prospecting");
  revalidatePath("/pipeline");
  return deal;
}

export async function exportListCSV(listId: string) {
  const user = await getAuthUser();
  const items = await prisma.prospectingItem.findMany({
    where: { listId, orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    include: { contact: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  });

  const headers = ["Address","Borough","ZIP","Block","Lot","Units","Year Built","Floors","Building Area","Lot Area","Class","Zoning","Assessed Value","Owner","Owner Address","Last Sale Price","Last Sale Date","Status","Contact Name","Contact Email","Notes"];
  const rows = items.map(i => [
    i.address, i.borough||"", i.zip||"", i.block||"", i.lot||"",
    i.totalUnits||"", i.yearBuilt||"", i.numFloors||"", i.buildingArea||"", i.lotArea||"",
    i.buildingClass||"", i.zoning||"", i.assessedValue||"", i.ownerName||"", i.ownerAddress||"",
    i.lastSalePrice||"", i.lastSaleDate||"", i.status,
    i.contact ? `${i.contact.firstName} ${i.contact.lastName}` : "", i.contact?.email||"", i.notes||"",
  ]);

  return [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
}

export async function bulkEnrichProspects(listId: string) {
  const user = await getAuthUser();
  const items = await prisma.prospectingItem.findMany({
    where: { listId, orgId: user.orgId },
  });

  // Filter to enrichable individuals (need first+last name, skip LLCs)
  const enrichable = items.filter(item => {
    const name = item.ownerName || "";
    if (!name.trim() || name.length < 3) return false;
    if (/LLC|CORP|INC|L\.P\.|TRUST|REALTY|ASSOC|HOUSING|AUTHORITY|DEPT/i.test(name)) return false;
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2;
  });

  if (enrichable.length === 0) return { total: items.length, enriched: 0 };

  let enrichedCount = 0;

  // Process in batches of 10 (Apollo bulk limit)
  for (let i = 0; i < enrichable.length; i += 10) {
    const batch = enrichable.slice(i, i + 10);
    const details = batch.map(item => {
      const parts = (item.ownerName || "").trim().split(/\s+/);
      return {
        first_name: parts[0],
        last_name: parts.slice(1).join(" "),
      };
    });

    const matches = await apolloBulkEnrich(details);

    // Update prospect items with enriched data
    for (let j = 0; j < matches.length; j++) {
      const match = matches[j];
      if (!match) continue;
      const item = batch[j];
      if (!item) continue;

      const enrichmentParts: string[] = [];
      if (match.email) enrichmentParts.push(`Email: ${match.email}`);
      if (match.phone) enrichmentParts.push(`Phone: ${match.phone}`);
      if (match.title) enrichmentParts.push(`Title: ${match.title}`);
      if (match.company) enrichmentParts.push(`Company: ${match.company}`);
      if (match.linkedinUrl) enrichmentParts.push(`LinkedIn: ${match.linkedinUrl}`);

      if (enrichmentParts.length > 0) {
        const existingNotes = item.notes || "";
        const newNotes = existingNotes
          ? `${existingNotes}\n--- Apollo Enrichment ---\n${enrichmentParts.join("\n")}`
          : `--- Apollo Enrichment ---\n${enrichmentParts.join("\n")}`;

        await prisma.prospectingItem.update({
          where: { id: item.id },
          data: { notes: newNotes },
        });
        enrichedCount++;
      }
    }
  }

  revalidatePath("/prospecting");
  return { total: enrichable.length, enriched: enrichedCount };
}

// ============================================================
// Bulk Enrich Prospect Contacts (Apollo People Enrichment)
// ============================================================

export async function getUnenrichedContactCount(listId: string): Promise<number> {
  const user = await getAuthUser();
  const items = await prisma.prospectingItem.findMany({
    where: { listId, orgId: user.orgId, contactId: { not: null } },
    select: { contactId: true },
  });

  const contactIds = items.map(i => i.contactId).filter(Boolean) as string[];
  if (contactIds.length === 0) return 0;

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, orgId: user.orgId },
    select: { id: true, typeData: true },
  });

  return contacts.filter(c => {
    const td = c.typeData as any;
    return !td?.apolloEnriched;
  }).length;
}

export async function bulkEnrichProspectContacts(
  listId: string,
  batchIndex: number,
): Promise<{ totalContacts: number; totalBatches: number; batchCompleted: number; enrichedInBatch: number; done: boolean }> {
  const user = await getAuthUser();
  const BATCH_SIZE = 10;

  // Get all prospect items with linked contacts
  const items = await prisma.prospectingItem.findMany({
    where: { listId, orgId: user.orgId, contactId: { not: null } },
    select: { contactId: true },
  });

  const contactIds = items.map(i => i.contactId).filter(Boolean) as string[];
  if (contactIds.length === 0) {
    return { totalContacts: 0, totalBatches: 0, batchCompleted: 0, enrichedInBatch: 0, done: true };
  }

  // Get contacts that haven't been Apollo-enriched
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, orgId: user.orgId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, typeData: true },
  });

  const unenriched = contacts.filter(c => {
    const td = c.typeData as any;
    return !td?.apolloEnriched;
  });

  const totalBatches = Math.ceil(unenriched.length / BATCH_SIZE);
  if (batchIndex >= totalBatches) {
    revalidatePath("/prospecting");
    return { totalContacts: unenriched.length, totalBatches, batchCompleted: batchIndex, enrichedInBatch: 0, done: true };
  }

  // Process current batch
  const batch = unenriched.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
  let enrichedInBatch = 0;

  const details = batch.map(c => ({
    first_name: c.firstName,
    last_name: c.lastName,
    ...(c.email ? { email: c.email } : {}),
  }));

  const matches = await apolloBulkEnrich(details);

  for (let j = 0; j < batch.length; j++) {
    const contact = batch[j];
    const match = matches[j];
    const existingTypeData = (contact.typeData as any) || {};

    const updatedTypeData: any = {
      ...existingTypeData,
      apolloEnriched: true,
      apolloEnrichedAt: new Date().toISOString(),
    };

    if (match) {
      if (match.email) updatedTypeData.apolloEmail = match.email;
      if (match.phone) updatedTypeData.apolloPhone = match.phone;
      if (match.title) updatedTypeData.apolloTitle = match.title;
      if (match.company) updatedTypeData.apolloCompany = match.company;
      if (match.linkedinUrl) updatedTypeData.apolloLinkedin = match.linkedinUrl;
      if (match.seniority) updatedTypeData.apolloSeniority = match.seniority;
      enrichedInBatch++;

      // Also update contact's primary fields if empty
      const updates: any = { typeData: updatedTypeData };
      if (!contact.email && match.email) updates.email = match.email;
      if (!contact.phone && match.phone) updates.phone = match.phone;

      await prisma.contact.update({ where: { id: contact.id }, data: updates });
    } else {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { typeData: updatedTypeData },
      });
    }
  }

  const done = batchIndex + 1 >= totalBatches;
  if (done) revalidatePath("/prospecting");

  return {
    totalContacts: unenriched.length,
    totalBatches,
    batchCompleted: batchIndex + 1,
    enrichedInBatch,
    done,
  };
}
