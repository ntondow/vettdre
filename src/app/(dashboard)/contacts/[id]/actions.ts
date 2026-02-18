"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateContact(contactId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");

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
      status: (formData.get("status") as string) || "lead",
      source: (formData.get("source") as string)?.trim() || null,
    },
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { success: true };
}
