"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, type LucideIcon } from "lucide-react";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { getRequiredPlan, getUpgradeMessage, PLAN_DISPLAY } from "@/lib/feature-gate";
import type { Feature, UserPlan } from "@/lib/feature-gate";
import { startFreeTrial } from "@/lib/feature-gate-server";

const PLAN_PRICE_IDS: Record<string, string> = {
  explorer: "price_1T42zZCehWC3IMoULwifstPN",
  pro: "price_1T431vCehWC3IMoUbAOPSLZX",
  team: "price_1T433ACehWC3IMoUVtty6sv6",
};

interface UpgradePromptProps {
  feature: Feature;
  /** Override upgrade message title */
  title?: string;
  /** Override upgrade message description */
  description?: string;
  /** Override required plan (auto-detected from feature if omitted) */
  plan?: UserPlan;
  /** Display variant */
  variant?: "inline" | "card" | "tab" | "overlay";
  /** Custom icon (defaults to Lock) */
  icon?: LucideIcon;
  /** Children to render behind overlay variant */
  children?: React.ReactNode;
}

export default function UpgradePrompt({
  feature,
  title,
  description,
  plan: requiredPlanOverride,
  variant = "card",
  icon: Icon = Lock,
  children,
}: UpgradePromptProps) {
  const router = useRouter();
  const { plan: currentPlan, userId, isTrialing, trialDaysRemaining } = useUserPlan();
  const [loading, setLoading] = useState(false);

  const requiredPlan = requiredPlanOverride || getRequiredPlan(feature);
  const planInfo = PLAN_DISPLAY[requiredPlan];
  const upgradeMessage = description || getUpgradeMessage(feature);
  const displayTitle = title || `Unlock with ${planInfo.name}`;

  const handleUpgrade = async () => {
    const priceId = PLAN_PRICE_IDS[requiredPlan];
    if (!priceId) {
      router.push("/settings/billing");
      return;
    }
    setLoading(true);
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
        router.push("/settings/billing");
      }
    } catch {
      router.push("/settings/billing");
    }
  };

  const handleTrial = async () => {
    setLoading(true);
    try {
      const result = await startFreeTrial(userId);
      if (result.success) router.refresh();
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const showTrial = currentPlan === "free" && !isTrialing && requiredPlan === "explorer";

  // ── Inline: compact single-line for gated fields ──────────
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50/50 border border-blue-100 rounded-lg">
        <Lock className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <span className="text-xs text-slate-500 truncate">{upgradeMessage}</span>
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
        >
          Upgrade
        </button>
      </div>
    );
  }

  // ── Card: icon + title + description + button ─────────────
  if (variant === "card") {
    return (
      <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-800">{displayTitle}</h4>
            <p className="text-sm text-slate-500 mt-1">{upgradeMessage}</p>

            {isTrialing && (
              <p className="text-xs text-emerald-600 mt-2">
                Trial active — {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} remaining
              </p>
            )}

            <div className="flex items-center gap-3 mt-3">
              {showTrial ? (
                <button
                  onClick={handleTrial}
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Starting..." : "Start Free Trial"}
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Redirecting..." : `Upgrade to ${planInfo.name}`}
                </button>
              )}
              <button
                onClick={() => router.push("/settings/billing")}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Compare plans
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab: full tab replacement with centered content ───────
  if (variant === "tab") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="p-4 bg-blue-50 rounded-full mb-4">
          <Icon className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">{displayTitle}</h3>
        <p className="text-sm text-slate-500 max-w-sm mb-1">{upgradeMessage}</p>

        {planInfo.monthlyPrice !== null && (
          <p className="text-xs text-slate-400 mb-5">
            Starting at ${planInfo.monthlyPrice}/mo
          </p>
        )}

        {isTrialing && (
          <p className="text-xs text-emerald-600 mb-4 px-3 py-1 bg-emerald-50 rounded-full">
            Trial active — {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} remaining
          </p>
        )}

        <div className="flex items-center gap-3">
          {showTrial ? (
            <button
              onClick={handleTrial}
              disabled={loading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Starting..." : "Start 7-Day Free Trial"}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Redirecting..." : `Upgrade to ${planInfo.name}`}
            </button>
          )}
        </div>
        <button
          onClick={() => router.push("/settings/billing")}
          className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Compare all plans
        </button>
      </div>
    );
  }

  // ── Overlay: blurred content with upgrade prompt on top ───
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[3px] opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/40">
        <div className="bg-white border border-blue-200 rounded-xl shadow-lg p-6 text-center max-w-xs mx-4">
          <div className="p-3 bg-blue-50 rounded-full w-fit mx-auto mb-3">
            <Sparkles className="h-6 w-6 text-blue-500" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 mb-1">{displayTitle}</h4>
          <p className="text-xs text-slate-500 mb-4">{upgradeMessage}</p>

          {showTrial ? (
            <button
              onClick={handleTrial}
              disabled={loading}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Starting..." : "Start Free Trial"}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Redirecting..." : `Upgrade to ${planInfo.name}`}
            </button>
          )}
          <button
            onClick={() => router.push("/settings/billing")}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Compare plans
          </button>
        </div>
      </div>
    </div>
  );
}
