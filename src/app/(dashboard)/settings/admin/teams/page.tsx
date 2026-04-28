import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import TeamsClient from "./teams-client";

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const ctx = await getCurrentOrgContext({ overrideAsOrg: as_org });
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return <TeamsClient />;
}
