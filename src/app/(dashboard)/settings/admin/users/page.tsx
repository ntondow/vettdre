import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import AdminUsersClient from "./admin-users-client";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const ctx = await getCurrentOrgContext({ overrideAsOrg: as_org });
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return <AdminUsersClient />;
}
