import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import SuperAdminBanner from "@/components/layout/super-admin-banner";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { ToastProvider } from "@/components/ui/toast";
import { UserPlanProvider } from "@/components/providers/user-plan-provider";
import { checkAndExpireTrial } from "@/lib/feature-gate-server";
import type { UserPlan } from "@/lib/feature-gate";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, plan: true, role: true, trialEndsAt: true, usageCounters: true },
  });

  const userId = dbUser?.id ?? "";
  let plan = (dbUser?.plan || "free") as UserPlan;
  let trialEndsAt = dbUser?.trialEndsAt?.toISOString() ?? null;

  // Check and expire trial if needed
  if (dbUser && trialEndsAt) {
    const expired = await checkAndExpireTrial(dbUser.id);
    if (expired) {
      plan = "free";
      trialEndsAt = null;
    }
  }

  const counters = (dbUser?.usageCounters as any) || {};
  const today = new Date().toISOString().slice(0, 10);
  const searchesToday = counters.lastSearchDate === today ? (counters.searchesToday || 0) : 0;

  return (
    <UserPlanProvider plan={plan} userId={userId} role={dbUser?.role || "agent"} trialEndsAt={trialEndsAt} searchesToday={searchesToday}>
      <SidebarProvider>
        <ToastProvider>
          <div className="min-h-screen bg-slate-50">
            {ctx.isOverride ? (
              <SuperAdminBanner realOrgName={ctx.realOrgName} viewingOrgName={ctx.viewingOrgName} />
            ) : null}
            <Sidebar />
            <MobileNav />
            <DashboardShell>{children}</DashboardShell>
          </div>
        </ToastProvider>
      </SidebarProvider>
    </UserPlanProvider>
  );
}
