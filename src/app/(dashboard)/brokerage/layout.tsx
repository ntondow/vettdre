"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, FileText, Receipt, Layers, FileBarChart, Shield, CreditCard, Users } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/brokerage/dashboard", icon: BarChart3, disabled: false },
  { label: "Deal Submissions", href: "/brokerage/deal-submissions", icon: FileText, disabled: false },
  { label: "Invoices", href: "/brokerage/invoices", icon: Receipt, disabled: false },
  { label: "Plans", href: "/brokerage/commission-plans", icon: Layers, disabled: false },
  { label: "Reports", href: "/brokerage/reports", icon: FileBarChart, disabled: false },
  { label: "Compliance", href: "/brokerage/compliance", icon: Shield, disabled: false },
  { label: "Payments", href: "/brokerage/payments", icon: CreditCard, disabled: false },
  { label: "Agents", href: "/brokerage/agents", icon: Users, disabled: false },
] as const;

export default function BrokerageLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-6">
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="flex items-center gap-2 py-3 text-sm font-medium border-b-2 border-transparent text-slate-300 cursor-not-allowed pointer-events-none"
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  <span className="text-[10px] bg-slate-100 text-slate-400 rounded-full px-1.5 py-0.5">Soon</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div>{children}</div>
    </>
  );
}
