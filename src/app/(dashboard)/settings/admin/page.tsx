import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDashboardClient from "./admin-dashboard-client";

const ADMIN_EMAIL = "nathan@ntrec.co";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/settings");

  return <AdminDashboardClient />;
}
