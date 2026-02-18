"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  if (!firstName || !lastName) throw new Error("First and last name are required");

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
