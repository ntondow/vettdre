"use client";

import { createContext, useContext, useMemo } from "react";
import type { UserPlan } from "@/lib/feature-gate";
import { FREE_DAILY_SEARCH_LIMIT } from "@/lib/feature-gate";

interface UserPlanContextValue {
  plan: UserPlan;
  userId: string;
  trialEndsAt: string | null;
  isTrialing: boolean;
  trialDaysRemaining: number;
  searchesRemaining: number;
}

const UserPlanContext = createContext<UserPlanContextValue>({
  plan: "free",
  userId: "",
  trialEndsAt: null,
  isTrialing: false,
  trialDaysRemaining: 0,
  searchesRemaining: FREE_DAILY_SEARCH_LIMIT,
});

interface UserPlanProviderProps {
  plan: UserPlan;
  userId: string;
  trialEndsAt: string | null;
  searchesToday: number;
  children: React.ReactNode;
}

export function UserPlanProvider({ plan, userId, trialEndsAt, searchesToday, children }: UserPlanProviderProps) {
  const value = useMemo(() => {
    const now = new Date();
    const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
    const isTrialing = plan === "explorer" && !!trialEnd && trialEnd > now;
    const trialDaysRemaining = isTrialing && trialEnd
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const searchesRemaining = plan === "free"
      ? Math.max(0, FREE_DAILY_SEARCH_LIMIT - (searchesToday || 0))
      : Infinity;

    return { plan, userId, trialEndsAt, isTrialing, trialDaysRemaining, searchesRemaining };
  }, [plan, userId, trialEndsAt, searchesToday]);

  return <UserPlanContext.Provider value={value}>{children}</UserPlanContext.Provider>;
}

export function useUserPlan() {
  return useContext(UserPlanContext);
}
