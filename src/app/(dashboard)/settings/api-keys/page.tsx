import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import ApiKeysClient from "./api-keys-client";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const ctx = await getCurrentOrgContext({ overrideAsOrg: as_org });
  if (!ctx) redirect("/login");

  const adminRoles = ["super_admin", "admin", "owner"];
  if (!adminRoles.includes(ctx.userRole)) {
    redirect("/settings");
  }

  return <ApiKeysClient />;
}
