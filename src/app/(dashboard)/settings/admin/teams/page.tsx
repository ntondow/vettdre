import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import TeamsClient from "./teams-client";

export default async function AdminTeamsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return <TeamsClient />;
}
