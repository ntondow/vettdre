import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "./landing-page";

// Never cache this route — must evaluate auth on every request
export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/market-intel");
  } catch {
    // If Supabase fails (cold start, env issue), show landing page
  }
  return <LandingPage />;
}
