"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, FileText, Receipt, Layers, FileBarChart, Shield, CreditCard, Users, Briefcase, Settings } from "lucide-react";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { canAccessPage } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";

const ALL_NAV_ITEMS = [
  { label: "Dashboard", href: "/brokerage/dashboard", icon: BarChart3 },
  { label: "Deal Submissions", href: "/brokerage/deal-submissions", icon: FileText },
  { label: "My Deals", href: "/brokerage/my-deals", icon: Briefcase },
  { label: "Invoices", href: "/brokerage/invoices", icon: Receipt },
  { label: "Plans", href: "/brokerage/commission-plans", icon: Layers },
  { label: "Reports", href: "/brokerage/reports", icon: FileBarChart },
  { label: "Compliance", href: "/brokerage/compliance", icon: Shield },
  { label: "Payments", href: "/brokerage/payments", icon: CreditCard },
  { label: "Agents", href: "/brokerage/agents", icon: Users },
  { label: "Settings", href: "/brokerage/settings", icon: Settings },
] as const;

function getVisibleItems(role: BrokerageRoleType | null) {
  if (!role || role === "agent") {
    // Agents and users without a BrokerAgent link — show only My Deals
    return ALL_NAV_ITEMS.filter(item => item.href === "/brokerage/my-deals");
  }
  // Admin/broker/manager — show management tabs, hide My Deals (they use Deal Submissions)
  return ALL_NAV_ITEMS.filter(
    item => item.href !== "/brokerage/my-deals" && canAccessPage(role, item.href)
  );
}

export default function BrokerageLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<BrokerageRoleType | null | undefined>(undefined);

  useEffect(() => {
    getCurrentBrokerageRole().then(setRole);
  }, []);

  const loading = role === undefined;
  const visibleItems = loading ? [] : getVisibleItems(role);

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-6">
        <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {loading ? (
            // Shimmer placeholders while loading role
            <>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-2 py-3">
                  <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
                  <div className="h-4 rounded bg-slate-200 animate-pulse" style={{ width: `${50 + i * 14}px` }} />
                </div>
              ))}
            </>
          ) : (
            visibleItems.map(item => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })
          )}
        </nav>
      </div>
      <div>{children}</div>
    </>
  );
}
