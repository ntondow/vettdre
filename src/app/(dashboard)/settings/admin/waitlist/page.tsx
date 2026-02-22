import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminWaitlistClient from "./admin-waitlist-client";

const ADMIN_EMAIL = "nathan@ntrec.co";

export default async function AdminWaitlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/settings");

  return <AdminWaitlistClient />;
}
