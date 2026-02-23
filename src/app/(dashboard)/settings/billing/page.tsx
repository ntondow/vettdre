"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBillingData } from "../billing-actions";
import { PLAN_DISPLAY, FREE_DAILY_SEARCH_LIMIT } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { startFreeTrial } from "@/lib/feature-gate-server";
import { useUserPlan } from "@/components/providers/user-plan-provider";

interface BillingData {
  plan: UserPlan;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  searchesToday: number;
  searchLimit: number;
}

const PLAN_ORDER: UserPlan[] = ["free", "explorer", "pro", "team", "enterprise"];

const PLAN_FEATURES: Record<UserPlan, string[]> = {
  free: [
    "NYC Market Intelligence",
    `${FREE_DAILY_SEARCH_LIMIT} searches per day`,
    "Basic property data",
  ],
  explorer: [
    "Everything in Free, plus:",
    "NYC, NYS & NJ markets",
    "Unlimited searches",
    "Map search",
    "Owner names & distress scores",
    "Investment scores & RPIE status",
    "Live listings & web intelligence",
  ],
  pro: [
    "Everything in Explorer, plus:",
    "Owner contact info (phone, email)",
    "Apollo enrichment",
    "Deal Modeler",
    "Prospecting & Portfolios",
    "Comp Analysis",
    "Campaigns & Sequences",
    "Financing tools",
  ],
  team: [
    "Everything in Pro, plus:",
    "Investor network access",
    "Team collaboration",
    "Priority support",
  ],
  enterprise: [
    "Everything in Team, plus:",
    "Unlimited everything",
    "Custom integrations",
    "Dedicated support",
    "API access",
  ],
};

function PlanCard({ tier, currentPlan, isTrialing, trialEndsAt, onStartTrial, onCheckout }: {
  tier: UserPlan;
  currentPlan: UserPlan;
  isTrialing: boolean;
  trialEndsAt: string | null;
  onStartTrial: () => void;
  onCheckout: (plan: UserPlan) => void;
}) {
  const display = PLAN_DISPLAY[tier];
  const isCurrent = tier === currentPlan;
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const tierIdx = PLAN_ORDER.indexOf(tier);
  const isUpgrade = tierIdx > currentIdx;
  const features = PLAN_FEATURES[tier];

  const colorMap: Record<string, { border: string; bg: string; text: string; btn: string; check: string }> = {
    slate: { border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-700", btn: "bg-slate-600 hover:bg-slate-700", check: "text-slate-500" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700", check: "text-emerald-500" },
    blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", btn: "bg-blue-600 hover:bg-blue-700", check: "text-blue-500" },
    violet: { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", btn: "bg-violet-600 hover:bg-violet-700", check: "text-violet-500" },
    amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700", check: "text-amber-500" },
  };
  const c = colorMap[display.color] || colorMap.slate;

  return (
    <div className={`bg-white rounded-xl p-6 relative ${isCurrent ? `border-2 ${c.border}` : "border border-slate-200"}`}>
      {isCurrent && (
        <div className="absolute -top-3 left-4">
          <span className={`${c.bg} ${c.text} text-xs font-semibold px-2.5 py-1 rounded-full`}>
            {isTrialing ? "Trial Active" : "Current Plan"}
          </span>
        </div>
      )}
      {tier === "pro" && !isCurrent && (
        <div className="absolute -top-3 left-4">
          <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Most Popular</span>
        </div>
      )}

      <h3 className="text-lg font-bold text-slate-900 mt-1">{display.name}</h3>
      <div className="flex items-baseline gap-1 mt-1 mb-4">
        {display.monthlyPrice !== null ? (
          <>
            <span className="text-3xl font-bold text-slate-900">${display.monthlyPrice}</span>
            <span className="text-sm text-slate-500">/mo</span>
            {display.annualPrice !== null && display.annualPrice < display.monthlyPrice && (
              <span className="text-xs text-slate-400 ml-1">(${display.annualPrice}/mo annual)</span>
            )}
          </>
        ) : (
          <span className="text-lg font-semibold text-slate-600">Contact us</span>
        )}
      </div>

      <ul className="space-y-2 mb-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${c.check}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className={`w-full text-center py-2.5 text-sm font-medium rounded-lg ${c.bg} ${c.text}`}>
          {isTrialing ? `${Math.max(0, Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / 86400000))} days left` : "Current Plan"}
        </div>
      ) : tier === "enterprise" ? (
        <a href="mailto:support@vettdre.com?subject=Enterprise%20Plan%20Inquiry"
          className="block w-full text-center bg-slate-100 text-slate-700 rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-slate-200 transition-colors">
          Contact Sales
        </a>
      ) : tier === "explorer" && currentPlan === "free" && !isTrialing ? (
        <button onClick={onStartTrial}
          className="w-full bg-emerald-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors">
          Start 7-Day Free Trial
        </button>
      ) : isUpgrade ? (
        <button onClick={() => onCheckout(tier)}
          className={`w-full text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${c.btn}`}>
          Upgrade to {display.name}
        </button>
      ) : null}
    </div>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useUserPlan();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getBillingData();
        setData(result);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setToast("Subscription activated! Welcome to your new plan.");
    } else if (searchParams.get("canceled") === "true") {
      setToast("Checkout canceled. No changes were made.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCheckout = async (plan: UserPlan) => {
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        setToast(result.error || "Failed to create checkout session");
        setCheckoutLoading(null);
      }
    } catch {
      setToast("Failed to connect to billing service");
      setCheckoutLoading(null);
    }
  };

  const handleStartTrial = async () => {
    setStartingTrial(true);
    try {
      const result = await startFreeTrial(userId);
      if (result.success) {
        setToast("Trial started! You now have Explorer access for 7 days.");
        router.refresh();
      } else {
        setToast("Unable to start trial. You may have already used your trial.");
      }
    } catch {
      setToast("Failed to start trial");
    }
    setStartingTrial(false);
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Plans & Billing</h1>
        <p className="text-sm text-slate-500 mb-6">Manage your subscription.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="h-6 w-24 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="h-8 w-20 bg-slate-100 rounded animate-pulse mb-4" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isTrialing = data.plan === "explorer" && !!data.trialEndsAt && new Date(data.trialEndsAt) > new Date();

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      <h1 className="text-lg font-bold text-slate-900 mb-1">Plans & Billing</h1>
      <p className="text-sm text-slate-500 mb-6">Choose the plan that fits your business.</p>

      {/* Usage (free users) */}
      {data.plan === "free" && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Daily Searches</span>
            <span className="text-sm font-medium text-slate-700">{data.searchesToday} / {data.searchLimit}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min((data.searchesToday / data.searchLimit) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Plan Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {PLAN_ORDER.map(tier => (
          <PlanCard
            key={tier}
            tier={tier}
            currentPlan={data.plan}
            isTrialing={isTrialing}
            trialEndsAt={data.trialEndsAt}
            onStartTrial={handleStartTrial}
            onCheckout={handleCheckout}
          />
        ))}
      </div>
    </div>
  );
}
