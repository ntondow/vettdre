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
  // Layouts don't receive searchParams in App Router, so the helper here uses
  // referer-fallback. The banner below uses useSearchParams() client-side to
  // detect the override from the live URL — this layout's ctx is informational.
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

  // Org name lookup map for the banner — only fetched when the viewer is a
  // super_admin (the only role that can trigger an override).
  let orgsById: Record<string, string> | undefined;
  if (ctx.userRole === "super_admin") {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    orgsById = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  }

  return (
    <UserPlanProvider plan={plan} userId={userId} role={dbUser?.role || "agent"} trialEndsAt={trialEndsAt} searchesToday={searchesToday}>
      <SidebarProvider>
        <ToastProvider>
          <div className="min-h-screen bg-slate-50">
            <SuperAdminBanner
              orgsById={orgsById}
              realOrgId={ctx.realOrgId}
              realOrgName={ctx.realOrgName}
            />
            <Sidebar />
            <MobileNav />
            <DashboardShell>{children}</DashboardShell>
          </div>
        </ToastProvider>
      </SidebarProvider>
    </UserPlanProvider>
  );
}
