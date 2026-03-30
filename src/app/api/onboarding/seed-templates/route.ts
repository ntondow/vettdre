import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { seedDefaultTemplates } from "@/lib/onboarding-seed-templates";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { orgId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await seedDefaultTemplates(user.orgId);

    return NextResponse.json({ success: true, message: "Default templates seeded" });
  } catch (error) {
    console.error("Seed templates error:", error);
    return NextResponse.json({ error: "Failed to seed templates" }, { status: 500 });
  }
}
