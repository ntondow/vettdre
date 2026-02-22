"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { getUnreadCount } from "@/app/(dashboard)/messages/actions";
import { getFollowUpCount } from "@/app/(dashboard)/messages/follow-up-actions";
import { useSidebar } from "./sidebar-context";

const nav = [
  { label: "Main", items: [
    { name: "Dashboard", href: "/dashboard", icon: "📊" },
    { name: "Contacts", href: "/contacts", icon: "👥" },
    { name: "Pipeline", href: "/pipeline", icon: "📋" },
    { name: "Properties", href: "/properties", icon: "🏠" },
  ]},
  { label: "Activity", items: [
    { name: "Tasks", href: "/tasks", icon: "✅" },
    { name: "Calendar", href: "/calendar", icon: "📅" },
    { name: "Messages", href: "/messages", icon: "📬", badge: true },
  ]},
  { label: "Intelligence", items: [
    { name: "AI Insights", href: "/insights", icon: "🧠" },
    { name: "Analytics", href: "/analytics", icon: "📈" },
    { name: "Prospecting", href: "/prospecting", icon: "🎯" },
    { name: "Market Intel", href: "/market-intel", icon: "🔍" },
  ]},
  { label: "Settings", items: [
    { name: "Settings", href: "/settings", icon: "⚙️" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { collapsed, toggle } = useSidebar();
  const [unread, setUnread] = useState(0);
  const [followUps, setFollowUps] = useState(0);

  useEffect(() => {
    getUnreadCount().then(n => setUnread(n)).catch(() => {});
    getFollowUpCount().then(n => setFollowUps(n)).catch(() => {});
  }, [pathname]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

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
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        {nav.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href} title={collapsed ? item.name : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group ${
                      collapsed ? "justify-center" : ""
                    } ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}>
                    <span className={`${collapsed ? "text-lg" : "text-base"}`}>{item.icon}</span>
                    {!collapsed && <span className="flex-1">{item.name}</span>}
                    {/* Badge */}
                    {!collapsed && "badge" in item && item.badge && (unread > 0 || followUps > 0) && (
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
                    {collapsed && "badge" in item && item.badge && unread > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                    {/* Tooltip on hover when collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                        {item.name}
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
