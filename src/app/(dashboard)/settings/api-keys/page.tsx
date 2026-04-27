import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import ApiKeysClient from "./api-keys-client";

export default async function ApiKeysPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const adminRoles = ["super_admin", "admin", "owner"];
  if (!adminRoles.includes(ctx.userRole)) {
    redirect("/settings");
  }

  return <ApiKeysClient />;
}
