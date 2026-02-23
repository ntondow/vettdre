"use client";

import { useState } from "react";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission, getUpgradeMessage, getRequiredPlan, PLAN_DISPLAY } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";

interface FullPageGateProps {
  feature: Feature;
  children: React.ReactNode;
}

export default function FullPageGate({ feature, children }: FullPageGateProps) {
  const { plan } = useUserPlan();
  const [showPaywall, setShowPaywall] = useState(false);

  if (hasPermission(plan, feature)) {
    return <>{children}</>;
  }

  const requiredPlan = getRequiredPlan(feature);
  const display = PLAN_DISPLAY[requiredPlan];

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {getUpgradeMessage(feature)}
        </h2>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          This feature is available on the{" "}
          <span className={`font-semibold ${
            display.color === "emerald" ? "text-emerald-600" :
            display.color === "blue" ? "text-blue-600" :
            display.color === "violet" ? "text-violet-600" :
            display.color === "amber" ? "text-amber-600" : "text-slate-600"
          }`}>{display.name}</span>{" "}
          plan and above.
        </p>
        <button
          onClick={() => setShowPaywall(true)}
          className={`px-6 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors shadow-sm ${
            display.color === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" :
            display.color === "blue" ? "bg-blue-600 hover:bg-blue-700" :
            display.color === "violet" ? "bg-violet-600 hover:bg-violet-700" :
            "bg-slate-600 hover:bg-slate-700"
          }`}
        >
          View Plans & Upgrade
        </button>
      </div>
      {showPaywall && (
        <Paywall
          featureName={getUpgradeMessage(feature).replace(/^Upgrade to \w+ to /, "").replace(/^unlock /, "").replace(/^access /, "")}
          currentPlan={plan}
          requiredPlan={requiredPlan}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </>
  );
}
