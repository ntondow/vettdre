"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { getUnreadCount } from "@/app/(dashboard)/messages/actions";
import { getFollowUpCount } from "@/app/(dashboard)/messages/follow-up-actions";
import { useSidebar } from "./sidebar-context";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";
import { getRequiredPlan } from "@/lib/feature-gate";

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: boolean;
  feature?: Feature;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  secondary?: boolean;
}

const nav: NavGroup[] = [
  { label: "Intelligence", items: [
    { name: "Market Intel", href: "/market-intel", icon: "🔍", feature: "nav_market_intel" },
    { name: "Prospecting", href: "/prospecting", icon: "🎯", feature: "nav_prospecting" },
  ]},
  { label: "Deals", items: [
    { name: "Deal Modeler", href: "/deals/new", icon: "🧮", feature: "nav_deal_modeler" },
    { name: "Pipeline", href: "/pipeline", icon: "📋" },
    { name: "Properties", href: "/properties", icon: "🏠" },
  ]},
  { label: "Assets", items: [
    { name: "Portfolios", href: "/portfolios", icon: "🏢", feature: "nav_portfolios" },
    { name: "Comp Analysis", href: "/comp-analysis", icon: "📈", feature: "nav_comp_analysis" },
  ]},
  { label: "Outreach", items: [
    { name: "Campaigns", href: "/campaigns", icon: "📣", feature: "nav_campaigns" },
    { name: "Sequences", href: "/sequences", icon: "🔄", feature: "nav_sequences" },
    { name: "Contacts", href: "/contacts", icon: "👥" },
  ]},
  { label: "Capital", items: [
    { name: "Promote Model", href: "/deals/promote", icon: "📊", feature: "nav_promote_model" },
    { name: "Financing", href: "/financing", icon: "💰", feature: "nav_financing" },
    { name: "Investors", href: "/investors", icon: "🤝", feature: "nav_investors" },
  ]},
  { label: "Brokerage", items: [
    { name: "Brokerage", href: "/brokerage/dashboard", icon: "🏛️", feature: "bms_submissions", roles: ["owner", "admin"] },
    { name: "My Deals", href: "/brokerage/my-deals", icon: "💼", feature: "bms_submissions", roles: ["agent"] },
  ]},
  { label: "Other", secondary: true, items: [
    { name: "Calendar", href: "/calendar", icon: "📅" },
    { name: "Messages", href: "/messages", icon: "📬", badge: true },
    { name: "Settings", href: "/settings", icon: "⚙️" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const { plan, role } = useUserPlan();
  const [unread, setUnread] = useState(0);
  const [followUps, setFollowUps] = useState(0);
  const [paywallFeature, setPaywallFeature] = useState<Feature | null>(null);

  useEffect(() => {
    getUnreadCount().then(n => setUnread(n)).catch(() => {});
    getFollowUpCount().then(n => setFollowUps(n)).catch(() => {});
  }, [pathname]);

  const handleSignOut = async () => { const supabase = createClient(); await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

  return (
    <aside className={`fixed inset-y-0 left-0 bg-white border-r border-slate-200 hidden md:flex flex-col z-40 transition-all duration-200 ${collapsed ? "w-[60px]" : "w-60"}`}>
      {/* Logo */}
      <div className="h-14 flex items-center border-b border-slate-100 px-3">
        {collapsed ? (
          <Link href="/market-intel" className="w-full flex items-center justify-center text-xl font-bold text-blue-600">V</Link>
        ) : (
          <Link href="/market-intel" className="text-xl font-bold text-slate-900 px-2">Vettd<span className="text-blue-600">RE</span></Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {nav.map((group) => (
          <div key={group.label} className={group.secondary ? "mt-auto pt-4 border-t border-slate-100" : ""}>
            {!collapsed && (
              <p className={`px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider ${group.secondary ? "text-slate-300" : "text-slate-400"}`}>{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                if (item.roles && !item.roles.includes(role)) return null;
                const locked = item.feature ? !hasPermission(plan, item.feature) : false;
                const isActive = !locked && pathname.startsWith(item.href);
                const cls = `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group text-left ${
                  collapsed ? "justify-center" : ""
                } ${locked
                  ? "text-slate-400 hover:text-slate-500 hover:bg-slate-50"
                  : isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`;
                const inner = (
                  <>
                    <span className={`${collapsed ? "text-lg" : "text-base"} ${locked ? "opacity-50" : ""}`}>{item.icon}</span>
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.name}</span>
                        {locked && (
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        )}
                      </>
                    )}
                    {/* Badge */}
                    {!collapsed && item.badge && (unread > 0 || followUps > 0) && (
                      <span className="flex items-center gap-1">
                        {unread > 0 && (
                          <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                        {followUps > 0 && (
                          <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                            {followUps > 9 ? "9+" : followUps}
                          </span>
                        )}
                      </span>
                    )}
                    {/* Collapsed badge dot */}
                    {collapsed && item.badge && unread > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                    {/* Collapsed lock dot */}
                    {collapsed && locked && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-slate-300 rounded-full" />
                    )}
                    {/* Tooltip on hover when collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                        {item.name}{locked ? " (Locked)" : ""}
                      </span>
                    )}
                  </>
                );
                if (locked) {
                  return (
                    <button key={item.name} onClick={() => item.feature && setPaywallFeature(item.feature)} title={collapsed ? item.name : undefined} className={cls}>
                      {inner}
                    </button>
                  );
                }
                return (
                  <Link key={item.name} href={item.href} title={collapsed ? item.name : undefined} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 p-2 space-y-1">
        <button onClick={handleSignOut} title={collapsed ? "Sign out" : undefined}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors ${collapsed ? "justify-center" : ""}`}>
          <span className="text-base">🚪</span>
          {!collapsed && <span>Sign out</span>}
        </button>
        <button onClick={toggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors ${collapsed ? "justify-center" : ""}`}>
          <span className="text-base">{collapsed ? "»" : "«"}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* Paywall Modal */}
      {paywallFeature && (
        <Paywall
          featureName={nav.flatMap(g => g.items).find(i => i.feature === paywallFeature)?.name || "Feature"}
          currentPlan={plan}
          requiredPlan={getRequiredPlan(paywallFeature)}
          onClose={() => setPaywallFeature(null)}
        />
      )}
    </aside>
  );
}
