"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  FileText,
  Receipt,
  Package,
  Users,
  Layers,
  ShieldCheck,
  CreditCard,
  FileBarChart,
  Settings,
  Briefcase,
  FolderOpen,
  Home,
  Building2,
  Trophy,
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

const ADMIN_NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { href: "/brokerage/dashboard", icon: BarChart3, label: "Dashboard" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { href: "/brokerage/listings", icon: Home, label: "Listings" },
      { href: "/brokerage/listings/properties", icon: Building2, label: "Properties" },
    ],
  },
  {
    group: "Deals",
    items: [
      { href: "/brokerage/deal-submissions", icon: FileText, label: "Submissions" },
      { href: "/brokerage/invoices", icon: Receipt, label: "Invoices" },
      { href: "/brokerage/invoices/bulk", icon: Package, label: "Bulk Invoices" },
      { href: "/brokerage/transactions", icon: FolderOpen, label: "Transactions" },
    ],
  },
  {
    group: "Management",
    items: [
      { href: "/brokerage/agents", icon: Users, label: "Agents" },
      { href: "/brokerage/commission-plans", icon: Layers, label: "Commission Plans" },
      { href: "/brokerage/compliance", icon: ShieldCheck, label: "Compliance" },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/brokerage/payments", icon: CreditCard, label: "Payments" },
      { href: "/brokerage/reports", icon: FileBarChart, label: "Reports" },
    ],
  },
  {
    group: "Performance",
    items: [
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

const AGENT_NAV: NavGroup[] = [
  {
    group: "My Brokerage",
    items: [
      { href: "/brokerage/my-deals", icon: Briefcase, label: "My Deals" },
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
  const { role: orgRole } = useUserPlan();
  const [role, setRole] = useState<BrokerageRoleType | null | undefined>(undefined);

  useEffect(() => {
    // Org owners/admins always get brokerage_admin — use context role directly
    // (avoids server action that may fail silently due to cookies/RPC issues)
    if (orgRole === "owner" || orgRole === "admin") {
      setRole("brokerage_admin");
      return;
    }
    // Other users: check BrokerAgent record via server action
    getCurrentBrokerageRole().then(setRole).catch(() => setRole(null));
  }, [orgRole]);

  const loading = role === undefined;
  const nav = loading ? [] : getVisibleNav(role);
  const allItems = nav.flatMap((g) => g.items);

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
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 active:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
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
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
                  {group.group}
                </p>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-white text-blue-600 font-medium shadow-sm border border-slate-200"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
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
