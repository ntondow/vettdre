import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import TeamDetailClient from "./team-detail-client";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findFirst({
    where: { authProviderId: user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "super_admin") redirect("/settings");

  return <TeamDetailClient teamId={id} />;
}
