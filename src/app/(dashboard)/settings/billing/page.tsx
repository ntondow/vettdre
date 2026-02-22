"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBillingData } from "../billing-actions";

type PlanName = "free" | "pro" | "team" | "enterprise";

interface BillingData {
  plan: PlanName;
  stripeCustomerId: string | null;
  usage: {
    searchesToday: number;
    enrichmentsThisMonth: number;
    contacts: number;
    deals: number;
    prospectLists: number;
    teamMembers: number;
  };
  limits: {
    searchesPerDay: number;
    enrichmentsPerMonth: number;
    maxContacts: number;
    maxDeals: number;
    maxProspectLists: number;
    maxTeamMembers: number;
  };
}

const PLAN_BADGE: Record<PlanName, { label: string; bg: string; text: string }> = {
  free: { label: "Free", bg: "bg-slate-100", text: "text-slate-700" },
  pro: { label: "Pro", bg: "bg-blue-100", text: "text-blue-700" },
  team: { label: "Team", bg: "bg-violet-100", text: "text-violet-700" },
  enterprise: { label: "Enterprise", bg: "bg-amber-100", text: "text-amber-700" },
};

const PRO_FEATURES = [
  "1,000 contacts",
  "100 active deals",
  "100 market intel searches/day",
  "50 enrichments/month",
  "AI ownership analysis",
  "Bulk enrichment",
  "CSV export",
  "Custom pipelines",
  "10 prospect lists",
];

const TEAM_FEATURES = [
  "Everything in Pro, plus:",
  "10,000 contacts",
  "500 active deals",
  "500 searches/day",
  "200 enrichments/month",
  "Up to 10 team members",
  "50 prospect lists",
  "API access",
];

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit === Infinity ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = pct >= 80;
  const isAtLimit = pct >= 100;
  const displayLimit = limit === Infinity ? "Unlimited" : limit.toLocaleString();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-slate-600">{label}</span>
        <span className={`text-sm font-medium ${isAtLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-slate-700"}`}>
          {used.toLocaleString()} / {displayLimit}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-blue-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
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

  const handleCheckout = async (plan: "pro" | "team") => {
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

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        setToast(result.error || "Failed to open billing portal");
        setPortalLoading(false);
      }
    } catch {
      setToast("Failed to connect to billing service");
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Billing</h1>
        <p className="text-sm text-slate-500 mb-6">Manage your subscription and usage.</p>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="h-6 w-40 bg-slate-200 rounded animate-pulse mb-4" />
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-8 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const badge = PLAN_BADGE[data.plan];
  const isPaid = data.plan !== "free";

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

      <h1 className="text-lg font-bold text-slate-900 mb-1">Billing</h1>
      <p className="text-sm text-slate-500 mb-6">Manage your subscription and usage.</p>

      {/* Current Plan Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">Current Plan</h2>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
              {isPaid && (
                <span className="text-sm text-slate-500">
                  ${data.plan === "pro" ? "79" : data.plan === "team" ? "149" : "—"}/month
                </span>
              )}
            </div>
          </div>
          {isPaid && data.stripeCustomerId && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {portalLoading ? "Opening..." : "Manage Subscription"}
            </button>
          )}
        </div>

        {!isPaid && (
          <p className="text-sm text-slate-500">
            You&apos;re on the free plan with limited features. Upgrade to unlock the full power of VettdRE.
          </p>
        )}
      </div>

      {/* Usage Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Usage</h2>
        <div className="space-y-4">
          <UsageBar label="Market Intel Searches (today)" used={data.usage.searchesToday} limit={data.limits.searchesPerDay} />
          <UsageBar label="Enrichments (this month)" used={data.usage.enrichmentsThisMonth} limit={data.limits.enrichmentsPerMonth} />
          <UsageBar label="Contacts" used={data.usage.contacts} limit={data.limits.maxContacts} />
          <UsageBar label="Active Deals" used={data.usage.deals} limit={data.limits.maxDeals} />
          <UsageBar label="Prospect Lists" used={data.usage.prospectLists} limit={data.limits.maxProspectLists} />
          <UsageBar label="Team Members" used={data.usage.teamMembers} limit={data.limits.maxTeamMembers} />
        </div>
      </div>

      {/* Upgrade Cards (shown for free users) */}
      {!isPaid && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Pro Plan */}
          <div className="bg-white rounded-xl border-2 border-blue-200 p-6 relative">
            <div className="absolute -top-3 left-4">
              <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                Most Popular
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Pro</h3>
            <div className="flex items-baseline gap-1 mt-1 mb-4">
              <span className="text-3xl font-bold text-slate-900">$79</span>
              <span className="text-sm text-slate-500">/month</span>
            </div>
            <ul className="space-y-2 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout("pro")}
              disabled={!!checkoutLoading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {checkoutLoading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
            </button>
          </div>

          {/* Team Plan */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900">Team</h3>
            <div className="flex items-baseline gap-1 mt-1 mb-4">
              <span className="text-3xl font-bold text-slate-900">$149</span>
              <span className="text-sm text-slate-500">/month</span>
            </div>
            <ul className="space-y-2 mb-6">
              {TEAM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <svg className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout("team")}
              disabled={!!checkoutLoading}
              className="w-full bg-violet-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {checkoutLoading === "team" ? "Redirecting..." : "Upgrade to Team"}
            </button>
          </div>
        </div>
      )}

      {/* Paid user — plan change options */}
      {isPaid && data.plan !== "enterprise" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Change Plan</h2>
          <p className="text-sm text-slate-500 mb-4">
            Use the Manage Subscription button above to upgrade, downgrade, or cancel your plan through the Stripe billing portal.
          </p>
        </div>
      )}

      {/* Enterprise CTA */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
        <h3 className="text-base font-semibold text-slate-900 mb-1">Need more?</h3>
        <p className="text-sm text-slate-500 mb-3">
          Enterprise plans include unlimited everything, dedicated support, and custom integrations.
        </p>
        <a
          href="mailto:support@vettdre.com?subject=Enterprise%20Plan%20Inquiry"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Contact Sales
        </a>
      </div>
    </div>
  );
}
