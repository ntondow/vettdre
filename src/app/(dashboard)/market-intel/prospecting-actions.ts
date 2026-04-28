"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  return { id: ctx.userId, orgId: ctx.orgId };
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
  revalidatePath("/market-intel");
  return list;
}

export async function addBuildingToList(listId: string, building: any) {
  const user = await getAuthUser();
  await prisma.prospectingItem.create({ data: { listId, orgId: user.orgId, ...building } });
  revalidatePath("/market-intel");
  return { success: true };
}
