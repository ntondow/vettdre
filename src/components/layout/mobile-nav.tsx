"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission, getRequiredPlan } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";

const tabs = [
  { name: "Market Intel", href: "/market-intel", icon: "🔍" },
  { name: "Deal Modeler", href: "/deals/new", icon: "🧮" },
  { name: "Pipeline", href: "/pipeline", icon: "📋" },
  { name: "More", href: "#more", icon: "☰" },
];

interface MoreItem {
  name: string;
  href: string;
  icon: string;
  feature?: Feature;
}

const moreItems: MoreItem[] = [
  { name: "Prospecting", href: "/prospecting", icon: "🎯", feature: "nav_prospecting" },
  { name: "Properties", href: "/properties", icon: "🏠" },
  { name: "Contacts", href: "/contacts", icon: "👥" },
  { name: "Messages", href: "/messages", icon: "📬" },
  { name: "Portfolios", href: "/portfolios", icon: "🏢", feature: "nav_portfolios" },
  { name: "Campaigns", href: "/campaigns", icon: "📣", feature: "nav_campaigns" },
  { name: "Calendar", href: "/calendar", icon: "📅" },
  { name: "Financing", href: "/financing", icon: "💰", feature: "nav_financing" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { plan } = useUserPlan();
  const [showMore, setShowMore] = useState(false);
  const [entered, setEntered] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<Feature | null>(null);

  // Close sheet on route change
  useEffect(() => {
    setShowMore(false);
    setEntered(false);
  }, [pathname]);

  const openMore = useCallback(() => {
    setShowMore(true);
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const closeMore = useCallback(() => {
    setEntered(false);
    setTimeout(() => setShowMore(false), 200);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isMoreActive = moreItems.some(item => {
    const locked = item.feature ? !hasPermission(plan, item.feature) : false;
    return !locked && pathname.startsWith(item.href);
  });

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe md:hidden">
        <div className="flex items-center justify-around h-14">
          {tabs.map((tab) => {
            const isMore = tab.href === "#more";
            const isActive = isMore ? isMoreActive : pathname.startsWith(tab.href);
            const cls = `flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-full text-[10px] font-medium transition-colors ${
              isActive ? "text-blue-600" : "text-slate-500"
            }`;

            if (isMore) {
              return (
                <button key={tab.name} onClick={() => showMore ? closeMore() : openMore()} className={cls}>
                  <span className="text-lg leading-none">{tab.icon}</span>
                  <span>{tab.name}</span>
                </button>
              );
            }
            return (
              <Link key={tab.name} href={tab.href} className={cls}>
                <span className="text-lg leading-none">{tab.icon}</span>
                <span>{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* More Sheet */}
      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={closeMore}
          />
          {/* Sheet */}
          <div
            className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pb-safe transition-transform duration-200 ease-out ${
              entered ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            <div className="px-4 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Navigate</p>
              <div className="grid grid-cols-4 gap-1">
                {moreItems.map((item) => {
                  const locked = item.feature ? !hasPermission(plan, item.feature) : false;
                  const isActive = !locked && pathname.startsWith(item.href);
                  const cls = `flex flex-col items-center gap-1 py-3 rounded-xl text-[11px] font-medium transition-colors relative ${
                    locked
                      ? "text-slate-400 active:bg-slate-100"
                      : isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 active:bg-slate-100"
                  }`;
                  const inner = (
                    <>
                      <span className={`text-2xl ${locked ? "opacity-50" : ""}`}>{item.icon}</span>
                      <span>{item.name}</span>
                      {locked && (
                        <span className="absolute top-2 right-2">
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </span>
                      )}
                    </>
                  );
                  if (locked) {
                    return (
                      <button key={item.name} onClick={() => { closeMore(); item.feature && setPaywallFeature(item.feature); }} className={cls}>
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <Link key={item.name} href={item.href} className={cls}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 mb-14">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-600 active:bg-red-50 transition-colors"
              >
                <span>🚪</span> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      {paywallFeature && (
        <Paywall
          featureName={moreItems.find(i => i.feature === paywallFeature)?.name || "Feature"}
          currentPlan={plan}
          requiredPlan={getRequiredPlan(paywallFeature)}
          onClose={() => setPaywallFeature(null)}
        />
      )}
    </>
  );
}
