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
  revalidatePath("/market-intel");
  return list;
}

export async function addBuildingToList(listId: string, building: any) {
  const user = await getAuthUser();
  await prisma.prospectingItem.create({ data: { listId, orgId: user.orgId, ...building } });
  revalidatePath("/market-intel");
  return { success: true };
}
