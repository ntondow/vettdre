"use client";

import { useSidebar } from "@/components/layout/sidebar-context";
import { useUserPlan } from "@/components/providers/user-plan-provider";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { isTrialing, trialDaysRemaining, plan, searchesRemaining } = useUserPlan();

  return (
    <main className={`pb-16 md:pb-0 transition-all duration-200 ${collapsed ? "md:pl-[60px]" : "md:pl-60"}`}>
      {/* Trial Banner */}
      {isTrialing && (
        <div className="bg-emerald-600 text-white text-center py-1.5 text-xs font-medium">
          Explorer Trial: {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} remaining
        </div>
      )}
      {/* Free user search limit banner */}
      {plan === "free" && searchesRemaining <= 2 && searchesRemaining > 0 && (
        <div className="bg-amber-500 text-white text-center py-1.5 text-xs font-medium">
          {searchesRemaining} search{searchesRemaining !== 1 ? "es" : ""} remaining today
        </div>
      )}
      {children}
    </main>
  );
}
