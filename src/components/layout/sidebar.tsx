"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { getUnreadCount } from "@/app/(dashboard)/messages/actions";
import { getFollowUpCount } from "@/app/(dashboard)/messages/follow-up-actions";
import { getEscalatedCount } from "@/app/(dashboard)/leasing/actions";
import { useSidebar } from "./sidebar-context";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";
import { getRequiredPlan } from "@/lib/feature-gate";

/* ------------------------------------------------------------------ */
/*  Types & Config                                                     */
/* ------------------------------------------------------------------ */

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: boolean;
  feature?: Feature;
  roles?: string[];
  comingSoon?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
  comingSoon?: boolean;
  comingSoonTooltip?: string;
}

/* Dashboard — rendered above sections (no group header) */
const DASHBOARD_ITEM: NavItem = { name: "Dashboard", href: "/dashboard", icon: "📊" };

/* ── Agent-focused sidebar (simplified for agent role) ────── */
const AGENT_NAV_SECTIONS: NavSection[] = [
  {
    label: "My Work",
    items: [
      { name: "Client Onboarding", href: "/brokerage/client-onboarding", icon: "📋" },
      { name: "My Deals", href: "/brokerage/my-deals", icon: "💼" },
      { name: "Contacts", href: "/contacts", icon: "👥" },
    ],
  },
  {
    label: "Communication",
    items: [
      { name: "Messages", href: "/messages", icon: "📬", badge: true },
      { name: "Calendar", href: "/calendar", icon: "📅" },
    ],
  },
  {
    label: "Research",
    items: [
      { name: "Prospecting", href: "/prospecting", icon: "🎯" },
      { name: "Market Intel", href: "/market-intel", icon: "🔍", feature: "nav_market_intel" },
    ],
  },
];

/* ── Admin / Owner sidebar (full platform) ────────────────── */
const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    label: "Research",
    items: [
      { name: "Market Intel", href: "/market-intel", icon: "🔍", feature: "nav_market_intel" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { name: "Properties", href: "/properties", icon: "🏢" },
    ],
  },
  {
    label: "Acquisitions",
    items: [
      { name: "Underwrite", href: "/deals", icon: "🧮", feature: "nav_deal_modeler" },
    ],
  },
  {
    label: "Closing",
    items: [
      { name: "Contacts", href: "/contacts", icon: "👥" },
      { name: "Messages", href: "/messages", icon: "📬", badge: true },
      { name: "Calendar", href: "/calendar", icon: "📅" },
    ],
  },
  {
    label: "Leasing",
    items: [
      { name: "Leasing", href: "/leasing", icon: "🤖", badge: true },
    ],
  },
  {
    label: "Property Management",
    comingSoon: true,
    comingSoonTooltip: "Rent roll, tenant tracking, maintenance requests, and lease management.",
    items: [
      { name: "Property Mgmt", href: "#", icon: "🏠", comingSoon: true },
    ],
  },
  {
    label: "Brokerage",
    items: [
      { name: "Brokerage", href: "/brokerage", icon: "🏛️", feature: "bms_submissions" },
      { name: "Client Onboarding", href: "/brokerage/client-onboarding", icon: "📋" },
    ],
  },
  {
    label: "Automation",
    items: [
      { name: "Automations", href: "/settings/automations", icon: "⚡" },
    ],
  },
];

/* Settings — rendered below separator at bottom */
const SETTINGS_ITEM: NavItem = { name: "Settings", href: "/settings", icon: "⚙️" };

/* All items flattened (for paywall lookup) */
const ALL_ITEMS = [DASHBOARD_ITEM, ...ADMIN_NAV_SECTIONS.flatMap(s => s.items), ...AGENT_NAV_SECTIONS.flatMap(s => s.items), SETTINGS_ITEM];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const { plan, role } = useUserPlan();
  const [unread, setUnread] = useState(0);
  const [followUps, setFollowUps] = useState(0);
  const [escalated, setEscalated] = useState(0);
  const [paywallFeature, setPaywallFeature] = useState<Feature | null>(null);

  useEffect(() => {
    getUnreadCount().then(n => setUnread(n)).catch(() => {});
    getFollowUpCount().then(n => setFollowUps(n)).catch(() => {});
    getEscalatedCount().then(n => setEscalated(n)).catch(() => {});
  }, [pathname]);

  const handleSignOut = async () => { const supabase = createClient(); await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

  /** Check if any item in a section is active */
  const isSectionActive = (section: NavSection) =>
    section.items.some(item => !item.comingSoon && pathname.startsWith(item.href));

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
      <nav className="flex-1 overflow-y-auto px-2 py-4 flex flex-col">
        {/* Dashboard — above all sections */}
        <div className="mb-3">
          <SidebarItem item={DASHBOARD_ITEM} pathname={pathname} collapsed={collapsed}
            plan={plan} role={role} unread={unread} followUps={followUps} escalated={escalated}
            onPaywall={setPaywallFeature} />
        </div>

        {/* Lifecycle sections — agents get a focused sidebar */}
        <div className="flex-1 space-y-4">
          {(role === "agent" ? AGENT_NAV_SECTIONS : ADMIN_NAV_SECTIONS).map((section) => {
            const isSuperAdmin = role === "super_admin";
            const hasVisibleItems = section.items.some(item => isSuperAdmin || !item.roles || item.roles.includes(role));
            if (!hasVisibleItems) return null;

            const active = isSectionActive(section);

            return (
              <div key={section.label}>
                {/* Section header */}
                {!collapsed && (
                  <p className={`px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                    active ? "text-slate-300" : "text-slate-400"
                  }`}>
                    {section.label}
                  </p>
                )}

                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    if (item.roles && !isSuperAdmin && !item.roles.includes(role)) return null;

                    if (item.comingSoon) {
                      return (
                        <ComingSoonItem key={item.name} item={item} collapsed={collapsed}
                          tooltip={section.comingSoonTooltip} />
                      );
                    }

                    return (
                      <SidebarItem key={item.name} item={item} pathname={pathname} collapsed={collapsed}
                        plan={plan} role={role} unread={unread} followUps={followUps} escalated={escalated}
                        onPaywall={setPaywallFeature} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Settings — above footer, below separator */}
        <div className="pt-4 border-t border-slate-100">
          <SidebarItem item={SETTINGS_ITEM} pathname={pathname} collapsed={collapsed}
            plan={plan} role={role} unread={0} followUps={0} escalated={0}
            onPaywall={setPaywallFeature} />
        </div>
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
          featureName={ALL_ITEMS.find(i => i.feature === paywallFeature)?.name || "Feature"}
          currentPlan={plan}
          requiredPlan={getRequiredPlan(paywallFeature)}
          onClose={() => setPaywallFeature(null)}
        />
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  SidebarItem — standard nav item                                    */
/* ------------------------------------------------------------------ */

function SidebarItem({ item, pathname, collapsed, plan, role, unread, followUps, escalated, onPaywall }: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  plan: string;
  role: string;
  unread: number;
  followUps: number;
  escalated: number;
  onPaywall: (f: Feature) => void;
}) {
  const locked = item.feature ? !hasPermission(plan as any, item.feature) : false;
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
      {/* Badge — Messages: unread + follow-ups; Leasing: escalated */}
      {!collapsed && item.badge && item.href === "/leasing" && escalated > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
          {escalated > 9 ? "9+" : escalated}
        </span>
      )}
      {!collapsed && item.badge && item.href !== "/leasing" && (unread > 0 || followUps > 0) && (
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
      {collapsed && item.badge && item.href === "/leasing" && escalated > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
      {collapsed && item.badge && item.href !== "/leasing" && unread > 0 && (
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
      <button onClick={() => item.feature && onPaywall(item.feature)} title={collapsed ? item.name : undefined} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={item.href} title={collapsed ? item.name : undefined} className={cls}>
      {inner}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  ComingSoonItem — grayed-out placeholder                            */
/* ------------------------------------------------------------------ */

function ComingSoonItem({ item, collapsed, tooltip }: {
  item: NavItem;
  collapsed: boolean;
  tooltip?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 cursor-default relative group ${
        collapsed ? "justify-center" : ""
      }`}
      title={collapsed ? `${item.name} — Coming Soon` : tooltip}
    >
      <span className={`${collapsed ? "text-lg" : "text-base"} opacity-50`}>{item.icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1">{item.name}</span>
          <span className="text-[10px] bg-slate-100 text-slate-400 rounded-full px-1.5 py-0.5 font-medium">Soon</span>
        </>
      )}
      {/* Tooltip when collapsed */}
      {collapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
          {item.name} — Coming Soon
        </span>
      )}
    </div>
  );
}
