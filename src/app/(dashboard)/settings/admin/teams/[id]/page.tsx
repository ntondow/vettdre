import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import TeamDetailClient from "./team-detail-client";

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { id } = await params;
  const { as_org } = await searchParams;
  const ctx = await getCurrentOrgContext({ overrideAsOrg: as_org });
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return <TeamDetailClient teamId={id} />;
}
