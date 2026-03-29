"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getUserIdFromAuth(): Promise<{ userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true },
    });
    if (!user) return null;

    return { userId: user.id };
  } catch (error) {
    console.error("getUserIdFromAuth error:", error);
    return null;
  }
}
