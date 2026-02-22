import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { ToastProvider } from "@/components/ui/toast";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <SidebarProvider>
      <ToastProvider>
        <div className="min-h-screen bg-slate-50">
          <Sidebar />
          <MobileNav />
          <DashboardShell>{children}</DashboardShell>
        </div>
      </ToastProvider>
    </SidebarProvider>
  );
}
