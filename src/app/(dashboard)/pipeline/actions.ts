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

const DEFAULT_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3B82F6" },
  { id: "contacted", name: "Contacted", order: 1, color: "#8B5CF6" },
  { id: "showing", name: "Showing", order: 2, color: "#F59E0B" },
  { id: "offer", name: "Offer", order: 3, color: "#F97316" },
  { id: "under_contract", name: "Under Contract", order: 4, color: "#06B6D4" },
  { id: "closed", name: "Closed", order: 5, color: "#10B981" },
];

export async function getOrCreatePipeline() {
  const user = await getAuthUser();

  let pipeline = await prisma.pipeline.findFirst({
    where: { orgId: user.orgId, isDefault: true },
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        orgId: user.orgId,
        name: "Sales Pipeline",
        pipelineType: "sales",
        isDefault: true,
        stages: DEFAULT_STAGES,
      },
    });
  }

  const deals = await prisma.deal.findMany({
    where: { orgId: user.orgId, pipelineId: pipeline.id },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true, qualificationScore: true } },
      property: { select: { id: true, address: true, city: true, state: true } },
      assignedAgent: { select: { fullName: true } },
    },
  });

  return { pipeline, deals, stages: (pipeline.stages as any[]) || DEFAULT_STAGES };
}

export async function getContacts() {
  const user = await getAuthUser();
  return prisma.contact.findMany({
    where: { orgId: user.orgId },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

export async function getProperties() {
  const user = await getAuthUser();
  return prisma.property.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, address: true, city: true, state: true, price: true },
  });
}

export async function createDeal(formData: FormData) {
  const user = await getAuthUser();

  const pipeline = await prisma.pipeline.findFirst({
    where: { orgId: user.orgId, isDefault: true },
  });
  if (!pipeline) throw new Error("No pipeline found");

  const contactId = formData.get("contactId") as string;
  const name = formData.get("name") as string;
  const dealValue = formData.get("dealValue") as string;
  const propertyId = formData.get("propertyId") as string;
  const stageId = formData.get("stageId") as string || "new_lead";

  if (!contactId) throw new Error("Contact is required");

  await prisma.deal.create({
    data: {
      orgId: user.orgId,
      contactId,
      pipelineId: pipeline.id,
      stageId,
      assignedTo: user.id,
      name: name?.trim() || null,
      dealValue: dealValue ? parseFloat(dealValue) : null,
      propertyId: propertyId || null,
      status: "open",
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function moveDeal(dealId: string, newStageId: string) {
  const user = await getAuthUser();

  const isClosedStage = newStageId === "closed";

  await prisma.deal.updateMany({
    where: { id: dealId, orgId: user.orgId },
    data: {
      stageId: newStageId,
      stageEnteredAt: new Date(),
      status: isClosedStage ? "won" : "open",
      closedAt: isClosedStage ? new Date() : null,
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function updateDealStatus(dealId: string, status: string, lostReason?: string) {
  const user = await getAuthUser();

  await prisma.deal.updateMany({
    where: { id: dealId, orgId: user.orgId },
    data: {
      status: status as any,
      lostReason: lostReason || null,
      closedAt: status !== "open" ? new Date() : null,
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function deleteDeal(dealId: string) {
  const user = await getAuthUser();
  await prisma.deal.deleteMany({ where: { id: dealId, orgId: user.orgId } });
  revalidatePath("/pipeline");
  return { success: true };
}
