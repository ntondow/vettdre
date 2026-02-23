"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { PLAN_DISPLAY } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { startFreeTrial } from "@/lib/feature-gate-server";

// Price IDs matching the billing page
const PLAN_PRICE_IDS: Record<string, string> = {
  explorer: "price_1T42zZCehWC3IMoULwifstPN",
  pro: "price_1T431vCehWC3IMoUbAOPSLZX",
  team: "price_1T433ACehWC3IMoUVtty6sv6",
};

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
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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

  const handleCheckout = async () => {
    const priceId = PLAN_PRICE_IDS[requiredPlan];
    if (!priceId) {
      onClose?.();
      router.push("/settings/billing");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        // Fallback to billing page if checkout fails
        onClose?.();
        router.push("/settings/billing");
      }
    } catch {
      onClose?.();
      router.push("/settings/billing");
    }
  };

  const btnColorClass = required.color === "emerald" ? "bg-emerald-600 hover:bg-emerald-700"
    : required.color === "blue" ? "bg-blue-600 hover:bg-blue-700"
    : required.color === "violet" ? "bg-violet-600 hover:bg-violet-700"
    : "bg-blue-600 hover:bg-blue-700";

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
          plan{required.monthlyPrice !== null ? ` ($${required.monthlyPrice}/mo)` : ""}.
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
        ) : requiredPlan === "enterprise" ? (
          <a href="mailto:support@vettdre.com?subject=Enterprise%20Plan%20Inquiry"
            className="block w-full bg-amber-600 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-amber-700 transition-colors shadow-sm text-center">
            Contact Sales
          </a>
        ) : (
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className={`w-full text-white rounded-lg px-6 py-3 text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 ${btnColorClass}`}
          >
            {checkoutLoading ? "Redirecting to checkout..." : `Upgrade to ${required.name}`}
          </button>
        )}

        {/* Secondary: see all plans */}
        <button
          onClick={() => { onClose?.(); router.push("/settings/billing"); }}
          className="mt-3 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Compare all plans
        </button>
      </div>
    </div>
  );
}
