"use client";

import { useState } from "react";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission, getUpgradeMessage, getRequiredPlan, PLAN_DISPLAY } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";

interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  blur?: boolean;
}

export default function FeatureGate({ feature, children, fallback, blur }: FeatureGateProps) {
  const { plan } = useUserPlan();
  const [showPaywall, setShowPaywall] = useState(false);

  if (hasPermission(plan, feature)) {
    return <>{children}</>;
  }

  if (blur) {
    const requiredPlan = getRequiredPlan(feature);
    return (
      <>
        <div className="relative">
          <div className="blur-sm pointer-events-none select-none">{children}</div>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 rounded-lg">
            <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-sm font-medium text-slate-600 text-center px-4 mb-2">
              {getUpgradeMessage(feature)}
            </p>
            <button
              onClick={() => setShowPaywall(true)}
              className={`px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors ${
                PLAN_DISPLAY[requiredPlan].color === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" :
                PLAN_DISPLAY[requiredPlan].color === "blue" ? "bg-blue-600 hover:bg-blue-700" :
                PLAN_DISPLAY[requiredPlan].color === "violet" ? "bg-violet-600 hover:bg-violet-700" :
                "bg-slate-600 hover:bg-slate-700"
              }`}
            >
              Unlock
            </button>
          </div>
        </div>
        {showPaywall && (
          <Paywall
            featureName={getUpgradeMessage(feature).replace(/^Upgrade to \w+ to /, "").replace(/^unlock /, "").replace(/^access /, "").replace(/^see /, "")}
            currentPlan={plan}
            requiredPlan={requiredPlan}
            onClose={() => setShowPaywall(false)}
          />
        )}
      </>
    );
  }

  return <>{fallback ?? null}</>;
}
