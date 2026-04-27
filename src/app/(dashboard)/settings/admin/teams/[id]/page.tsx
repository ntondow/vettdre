import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import TeamDetailClient from "./team-detail-client";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return <TeamDetailClient teamId={id} />;
}
