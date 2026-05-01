"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSubmittedCount } from "./deal-submissions/actions";
import {
  BarChart3,
  FileText,
  Receipt,
  Users,
  CreditCard,
  FileBarChart,
  Settings,
  Briefcase,
  FolderOpen,
  Home,
  Building2,
  Trophy,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { canAccessPage } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";
import type { LucideIcon } from "lucide-react";

// ── Nav Structure ────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// ── Slice 8: brokerage_admin sub-nav (Wireframe C) ──────────────
//
// Three sections + Admin link, eleven primary items. Down from seven
// sections × seventeen items in slice 7's inventory.
//
// OPERATIONS holds the daily money-and-deal flow: Dashboard at the top
// because it's the at-a-glance landing, then Submissions (highest-
// frequency action — same item that carries the global sidebar's slice 7
// badge), then the rest of the lifecycle. AGENTS & LISTINGS groups
// roster + inventory ("what we manage"). REPORTS is the past/insight
// surface.
//
// Removed from this constant (relocated, not deleted as routes):
//   - /brokerage/setup            → Settings → Brokerage Configuration card
//   - /brokerage/commission-plans → Settings → Brokerage Configuration card
//   - /brokerage/compliance       → Settings → Brokerage Configuration card
//                                   AND /brokerage/dashboard → ComplianceAlert
//                                   panel when totalItems > 0
//   - /brokerage/invoices/bulk    → already-existing "Bulk Generate" button
//                                   in /brokerage/invoices header
//
// canAccessPage filtering still runs per-item in getVisibleNav below;
// no permission changes needed.
const ADMIN_NAV: NavGroup[] = [
  {
    group: "Operations",
    items: [
      { href: "/brokerage/dashboard", icon: BarChart3, label: "Dashboard" },
      { href: "/brokerage/deal-submissions", icon: FileText, label: "Submissions" },
      { href: "/brokerage/transactions", icon: FolderOpen, label: "Transactions" },
      { href: "/brokerage/invoices", icon: Receipt, label: "Invoices" },
      { href: "/brokerage/payments", icon: CreditCard, label: "Payments" },
    ],
  },
  {
    group: "Agents & Listings",
    items: [
      { href: "/brokerage/agents", icon: Users, label: "Agents" },
      { href: "/brokerage/my-deals", icon: Briefcase, label: "My Deals" },
      { href: "/brokerage/listings", icon: Home, label: "Listings" },
      { href: "/brokerage/listings/properties", icon: Building2, label: "Properties" },
    ],
  },
  {
    group: "Reports",
    items: [
      { href: "/brokerage/reports", icon: FileBarChart, label: "Reports" },
      { href: "/brokerage/leaderboard", icon: Trophy, label: "Leaderboard" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/brokerage/settings", icon: Settings, label: "Settings" },
    ],
  },
];

// ── Slice 8: agent sub-nav cleanup ──────────────────────────────
//
// Drops the prior `Admin > Setup` entry. /brokerage/setup is a
// brokerage_admin onboarding flow — agents had no business seeing it.
// The pre-slice-8 layout returned AGENT_NAV unfiltered (no
// canAccessPage gate on the agent path), so agents could literally
// click into the brokerage Setup wizard. Stale entry from before
// AGENT_NAV existed; cleaning up here.
const AGENT_NAV: NavGroup[] = [
  {
    group: "My Brokerage",
    items: [
      { href: "/brokerage/earnings", icon: Wallet, label: "Earnings" },
      { href: "/brokerage/my-deals", icon: Briefcase, label: "My Deals" },
      { href: "/brokerage/listings", icon: Home, label: "Listings" },
      { href: "/brokerage/client-onboarding", icon: UserPlus, label: "Client Onboarding" },
      { href: "/brokerage/leaderboard", icon: Trophy, label: "Leaderboard" },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────

const ADMIN_ROLES = new Set<BrokerageRoleType>(["brokerage_admin", "broker", "manager"]);

function getVisibleNav(role: BrokerageRoleType | null | undefined): NavGroup[] {
  // Explicit positive match: only known admin roles get the full nav.
  // null, undefined, "agent", or any unexpected value → agent nav.
  if (!role || !ADMIN_ROLES.has(role)) return AGENT_NAV;

  // Filter each group's items by page permission, drop empty groups
  return ADMIN_NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPage(role, item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

// ── Component ────────────────────────────────────────────────

export default function BrokerageLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const asOrg = searchParams.get("as_org");
  const overrideOpts = useMemo(
    () => (asOrg ? { overrideAsOrg: asOrg } : {}),
    [asOrg],
  );
  const { role: orgRole } = useUserPlan();
  const [role, setRole] = useState<BrokerageRoleType | null | undefined>(undefined);
  const [submittedCount, setSubmittedCount] = useState<number>(0);

  useEffect(() => {
    // Org owners/admins always get brokerage_admin — use context role directly
    // (avoids server action that may fail silently due to cookies/RPC issues)
    if (orgRole === "owner" || orgRole === "admin" || orgRole === "super_admin") {
      setRole("brokerage_admin");
      return;
    }
    // Other users: check BrokerAgent record via server action
    getCurrentBrokerageRole()
      .then(setRole)
      .catch((err) => {
        console.error("Failed to fetch brokerage role:", err);
        setRole(null);
      });
  }, [orgRole]);

  // Slice 1.5: refetch the Submissions badge count on mount + every
  // pathname change. Cheap COUNT query; refetching on navigation means
  // approving/rejecting in /brokerage/deal-submissions naturally
  // updates the badge when the manager moves to another section. Only
  // fires once role is admin-tier — agents see count 0 by default
  // (initial state, never overwritten because the effect is skipped).
  const shouldFetchCount = !!role && role !== "agent";
  useEffect(() => {
    if (!shouldFetchCount) return;
    let cancelled = false;
    getSubmittedCount(overrideOpts)
      .then((result) => {
        if (!cancelled) setSubmittedCount(result.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setSubmittedCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchCount, pathname, overrideOpts]);

  const loading = role === undefined;
  const nav = loading ? [] : getVisibleNav(role);
  const allItems = nav.flatMap((g) => g.items);

  // Slice 1.5: per-href badge values. Hidden when zero. Today only the
  // Submissions item ships a badge — the map keeps the surface ready for
  // future items (Invoices unpaid, Compliance expiring, etc.) without
  // touching the render branches again.
  const badges: Record<string, number> = {
    "/brokerage/deal-submissions": submittedCount,
  };

  // Active link: exact match, or startsWith for sub-routes (but not /invoices matching /invoices/bulk)
  function isActive(href: string) {
    if (pathname === href) return true;
    // For parent routes, match if pathname starts with href + "/"
    // but exclude when a more specific sibling also matches
    if (pathname.startsWith(href + "/")) {
      // Check if there's a more specific nav item that matches
      const moreSpecific = allItems.some(
        (item) => item.href !== href && item.href.startsWith(href + "/") && pathname.startsWith(item.href),
      );
      return !moreSpecific;
    }
    return false;
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-57px)]">
      {/* Mobile: horizontal scrolling pills */}
      <div className="md:hidden overflow-x-auto no-scrollbar bg-slate-50 border-b border-slate-200 px-3 py-2">
        <div className="flex gap-1.5">
          {loading
            ? [1, 2, 3, 4].map((i) => (
                <div key={i} className="h-7 rounded-full bg-slate-200 animate-pulse" style={{ width: `${60 + i * 12}px` }} />
              ))
            : allItems.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                const badge = badges[item.href];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 active:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                    {badge && badge > 0 ? (
                      <span
                        data-testid={`brokerage-nav-badge-${item.href}`}
                        className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold ${
                          active ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                        }`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:block w-[220px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-4">
        {loading
          ? [1, 2, 3].map((g) => (
              <div key={g} className="mb-4">
                <div className="h-3 w-16 bg-slate-200 animate-pulse rounded mx-4 mb-2" />
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 mx-2 px-3 py-2">
                    <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
                    <div className="h-4 rounded bg-slate-200 animate-pulse" style={{ width: `${60 + i * 20}px` }} />
                  </div>
                ))}
              </div>
            ))
          : nav.map((group) => (
              <div key={group.group} className="mb-4">
                <p className="text-[10px] font-semibold text-slate-400 tracking-wider px-4 py-1.5">
                  {group.group}
                </p>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const badge = badges[item.href];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-white text-blue-600 font-medium shadow-sm border border-slate-200"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {badge && badge > 0 ? (
                        <span
                          data-testid={`brokerage-nav-badge-${item.href}`}
                          className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-semibold ${
                            active
                              ? "bg-blue-100 text-blue-700"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {children}
      </div>
    </div>
  );
}
