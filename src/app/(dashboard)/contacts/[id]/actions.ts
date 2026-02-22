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
