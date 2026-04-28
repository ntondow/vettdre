import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import AdminDashboardClient from "./admin-dashboard-client";
import OrgSwitcher from "./org-switcher";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const ctx = await getCurrentOrgContext({ overrideAsOrg: as_org });
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return (
    <>
      <OrgSwitcher realOrgId={ctx.realOrgId} />
      <AdminDashboardClient />
    </>
  );
}
