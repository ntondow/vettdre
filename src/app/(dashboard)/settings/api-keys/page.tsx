import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import ApiKeysClient from "./api-keys-client";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findFirst({
    where: { authProviderId: user.id },
    select: { role: true },
  });

  const adminRoles = ["super_admin", "admin", "owner"];
  if (!dbUser || !adminRoles.includes(dbUser.role)) {
    redirect("/settings");
  }

  return <ApiKeysClient />;
}
