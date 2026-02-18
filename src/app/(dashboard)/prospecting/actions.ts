"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
