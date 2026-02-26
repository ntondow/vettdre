"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const REPORT_TABS = [
  { label: "P&L", href: "/brokerage/reports/pnl" },
  { label: "Agent Production", href: "/brokerage/reports/production" },
  { label: "1099 Prep", href: "/brokerage/reports/tax-prep" },
  { label: "Pipeline", href: "/brokerage/reports/pipeline" },
] as const;

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-100 bg-slate-50/50 px-6">
        <nav className="flex items-center gap-5">
          {REPORT_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`py-2 text-xs font-medium border-b-2 transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </>
  );
}
