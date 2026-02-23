"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { getUnreadCount } from "@/app/(dashboard)/messages/actions";
import { getFollowUpCount } from "@/app/(dashboard)/messages/follow-up-actions";
import { useSidebar } from "./sidebar-context";

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: boolean;
  locked?: boolean;
}

const nav: { label: string; items: NavItem[] }[] = [
  { label: "Main", items: [
    { name: "Dashboard", href: "/dashboard", icon: "📊" },
    { name: "Contacts", href: "/contacts", icon: "👥" },
    { name: "Calendar", href: "/calendar", icon: "📅" },
    { name: "Messages", href: "/messages", icon: "📬", badge: true },
  ]},
  { label: "Deals", items: [
    { name: "Pipeline", href: "/pipeline", icon: "📋" },
    { name: "Deal Pipeline", href: "/deals", icon: "🏗️" },
    { name: "Deal Modeler", href: "/deals/new", icon: "🧮" },
    { name: "Properties", href: "/properties", icon: "🏠" },
  ]},
  { label: "Intelligence", items: [
    { name: "Market Intel", href: "/market-intel", icon: "🔍" },
    { name: "Prospecting", href: "/prospecting", icon: "🎯" },
  ]},
  { label: "Outreach", items: [
    { name: "Campaigns", href: "/settings/billing", icon: "📣", locked: true },
    { name: "Sequences", href: "/settings/billing", icon: "🔄", locked: true },
  ]},
  { label: "Assets", items: [
    { name: "Portfolios", href: "/portfolios", icon: "🏢" },
    { name: "Comp Analysis", href: "/settings/billing", icon: "📈", locked: true },
  ]},
  { label: "Capital", items: [
    { name: "Financing", href: "/settings/billing", icon: "💰", locked: true },
    { name: "Investors", href: "/settings/billing", icon: "🤝", locked: true },
  ]},
  { label: "Settings", items: [
    { name: "Settings", href: "/settings", icon: "⚙️" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const [unread, setUnread] = useState(0);
  const [followUps, setFollowUps] = useState(0);

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
          <Link href="/dashboard" className="w-full flex items-center justify-center text-xl font-bold text-blue-600">V</Link>
        ) : (
          <Link href="/dashboard" className="text-xl font-bold text-slate-900 px-2">Vettd<span className="text-blue-600">RE</span></Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {nav.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = !item.locked && pathname.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href} title={collapsed ? item.name : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group ${
                      collapsed ? "justify-center" : ""
                    } ${item.locked
                      ? "text-slate-400 hover:text-slate-500 hover:bg-slate-50"
                      : isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}>
                    <span className={`${collapsed ? "text-lg" : "text-base"} ${item.locked ? "opacity-50" : ""}`}>{item.icon}</span>
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.name}</span>
                        {item.locked && (
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
                    {collapsed && item.locked && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-slate-300 rounded-full" />
                    )}
                    {/* Tooltip on hover when collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                        {item.name}{item.locked ? " (Coming Soon)" : ""}
                      </span>
                    )}
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
    </aside>
  );
}
