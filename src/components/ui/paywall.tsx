"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { PLAN_DISPLAY } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { startFreeTrial } from "@/lib/feature-gate-server";

interface PaywallProps {
  featureName: string;
  currentPlan: UserPlan;
  requiredPlan: UserPlan;
  onClose?: () => void;
}

function colorClass(color: string, type: "text" | "bg" | "badge") {
  const map: Record<string, Record<string, string>> = {
    slate: { text: "text-slate-600", bg: "bg-slate-100", badge: "bg-slate-100 text-slate-700" },
    emerald: { text: "text-emerald-600", bg: "bg-emerald-100", badge: "bg-emerald-100 text-emerald-700" },
    blue: { text: "text-blue-600", bg: "bg-blue-100", badge: "bg-blue-100 text-blue-700" },
    violet: { text: "text-violet-600", bg: "bg-violet-100", badge: "bg-violet-100 text-violet-700" },
    amber: { text: "text-amber-600", bg: "bg-amber-100", badge: "bg-amber-100 text-amber-700" },
  };
  return map[color]?.[type] || map.slate[type];
}

export default function Paywall({ featureName, currentPlan, requiredPlan, onClose }: PaywallProps) {
  const router = useRouter();
  const { userId, isTrialing, trialDaysRemaining } = useUserPlan();
  const [starting, setStarting] = useState(false);
  const required = PLAN_DISPLAY[requiredPlan];
  const current = PLAN_DISPLAY[currentPlan];

  const handleStartTrial = async () => {
    setStarting(true);
    try {
      const result = await startFreeTrial(userId);
      if (result.success) {
        router.refresh();
      }
    } catch {
      // ignore
    }
    setStarting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-in fade-in zoom-in-95">
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">Upgrade to Unlock</h2>

        <p className="text-slate-600 mb-4">
          <span className="font-semibold text-slate-800">{featureName}</span> requires the{" "}
          <span className={`font-semibold ${colorClass(required.color, "text")}`}>{required.name}</span>{" "}
          plan or higher.
        </p>

        {/* Trial banner for trialing users */}
        {isTrialing && (
          <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs font-medium text-emerald-700">
              Trial active: {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} remaining
            </p>
          </div>
        )}

        {/* Current plan badge */}
        <p className="text-sm text-slate-500 mb-6">
          You&apos;re currently on the{" "}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass(current.color, "badge")}`}>
            {current.name}
          </span>{" "}
          plan.
        </p>

        {/* CTAs */}
        {currentPlan === "free" && !isTrialing && requiredPlan === "explorer" ? (
          <>
            <button
              onClick={handleStartTrial}
              disabled={starting}
              className="w-full bg-emerald-600 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start 7-Day Free Trial"}
            </button>
            <p className="text-xs text-slate-400 mt-2">No credit card required</p>
          </>
        ) : (
          <button
            onClick={() => { onClose?.(); router.push("/settings/billing"); }}
            className="w-full bg-blue-600 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            View Plans & Upgrade
          </button>
        )}

        {onClose && (
          <button onClick={onClose} className="mt-3 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Maybe later
          </button>
        )}
      </div>
    </div>
  );
}
