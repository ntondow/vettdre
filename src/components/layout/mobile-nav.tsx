"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { getUnreadCount } from "@/app/(dashboard)/messages/actions";

const tabs = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Contacts", href: "/contacts", icon: "👥" },
  { name: "Pipeline", href: "/pipeline", icon: "📋" },
  { name: "Messages", href: "/messages", icon: "📬", badge: true },
  { name: "More", href: "#more", icon: "☰" },
];

const moreItems = [
  { name: "Properties", href: "/properties", icon: "🏠" },
  { name: "Tasks", href: "/tasks", icon: "✅" },
  { name: "Calendar", href: "/calendar", icon: "📅" },
  { name: "AI Insights", href: "/insights", icon: "🧠" },
  { name: "Analytics", href: "/analytics", icon: "📈" },
  { name: "Prospecting", href: "/prospecting", icon: "🎯" },
  { name: "Market Intel", href: "/market-intel", icon: "🔍" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    getUnreadCount().then(n => setUnread(n)).catch(() => {});
  }, [pathname]);

  // Close sheet on route change
  useEffect(() => {
    setShowMore(false);
    setEntered(false);
  }, [pathname]);

  const openMore = useCallback(() => {
    setShowMore(true);
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const closeMore = useCallback(() => {
    setEntered(false);
    setTimeout(() => setShowMore(false), 200);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isMoreActive = moreItems.some(item => pathname.startsWith(item.href));

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe md:hidden">
        <div className="flex items-center justify-around h-14">
          {tabs.map((tab) => {
            const isMore = tab.href === "#more";
            const isActive = isMore ? isMoreActive : pathname.startsWith(tab.href);

            return (
              <button
                key={tab.name}
                onClick={() => {
                  if (isMore) {
                    showMore ? closeMore() : openMore();
                  } else {
                    router.push(tab.href);
                  }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-full text-[10px] font-medium transition-colors ${
                  isActive ? "text-blue-600" : "text-slate-500"
                }`}
              >
                <span className="text-lg leading-none relative">
                  {tab.icon}
                  {tab.badge && unread > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] flex items-center justify-center px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* More Sheet */}
      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={closeMore}
          />
          {/* Sheet */}
          <div
            className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pb-safe transition-transform duration-200 ease-out ${
              entered ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            <div className="px-4 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Navigate</p>
              <div className="grid grid-cols-4 gap-1">
                {moreItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl text-[11px] font-medium transition-colors ${
                        isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 active:bg-slate-100"
                      }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 mb-14">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-600 active:bg-red-50 transition-colors"
              >
                <span>🚪</span> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
