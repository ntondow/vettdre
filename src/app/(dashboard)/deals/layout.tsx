"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Zap,
  Calculator,
  GitCompare,
  BarChart3,
  TrendingUp,
  Scale,
  Receipt,
  Building2,
  Hammer,
  Layers,
  Bookmark,
  FileText,
  FileSignature,
  FileSpreadsheet,
  FolderOpen,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
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

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Pipeline",
    items: [
      { href: "/deals/pipeline", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    group: "Import",
    items: [
      { href: "/deals/import", icon: Upload, label: "Import Deal" },
    ],
  },
  {
    group: "Screen",
    items: [
      { href: "/deals/screen", icon: Zap, label: "Quick Screen" },
    ],
  },
  {
    group: "Underwrite",
    items: [
      { href: "/deals/new", icon: Calculator, label: "Modeler" },
      { href: "/deals/compare", icon: GitCompare, label: "Comparison" },
    ],
  },
  {
    group: "Research",
    items: [
      { href: "/deals/comps", icon: BarChart3, label: "Comps" },
      { href: "/deals/cap-rates", icon: TrendingUp, label: "Cap Rates" },
      { href: "/deals/benchmarks", icon: Scale, label: "Benchmarks" },
      { href: "/deals/closing-costs", icon: Receipt, label: "Closing Costs" },
      { href: "/deals/rent-stabilization", icon: Building2, label: "Rent Stab" },
      { href: "/deals/renovation", icon: Hammer, label: "Renovation" },
    ],
  },
  {
    group: "Syndication",
    items: [
      { href: "/deals/promote", icon: Layers, label: "GP/LP Waterfall" },
    ],
  },
  {
    group: "Generate",
    items: [
      { href: "/deals/saved", icon: Bookmark, label: "Saved Analyses" },
      { href: "/deals/export/investment-summary", icon: FileText, label: "Inv Summary" },
      { href: "/deals/export/loi", icon: FileSignature, label: "LOI Generator" },
      { href: "/deals/export/bov", icon: FileSpreadsheet, label: "BOV Generator" },
      { href: "/deals/documents", icon: FolderOpen, label: "Documents" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const STORAGE_KEY = "vettdre-deals-sidebar-collapsed";

// ── Component ────────────────────────────────────────────────

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Load persisted collapse state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  // Active link matching (same logic as brokerage)
  function isActive(href: string) {
    if (pathname === href) return true;
    if (pathname.startsWith(href + "/")) {
      const moreSpecific = ALL_ITEMS.some(
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
          {ALL_ITEMS.map((item) => {
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
      <nav
        className={`hidden md:flex flex-col flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto transition-all duration-200 ${
          collapsed ? "w-[52px]" : "w-[200px]"
        }`}
      >
        {/* Collapse toggle */}
        <div className={`flex items-center py-2 px-2 ${collapsed ? "justify-center" : "justify-end"}`}>
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.group} className="mb-3">
              {!collapsed && (
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
                  {group.group}
                </p>
              )}
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`relative group flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-white text-blue-600 font-medium shadow-sm border border-slate-200"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && item.label}
                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
