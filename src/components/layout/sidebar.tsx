"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    { name: "Messages", href: "/messages", icon: "💬" },
  ]},
  { label: "Intelligence", items: [
    { name: "AI Insights", href: "/insights", icon: "🧠" },
    { name: "Analytics", href: "/analytics", icon: "📈" },
    { name: "Prospecting", href: "/prospecting", icon: "🎯" },
    { name: "Market Intel", href: "/market-intel", icon: "🔍" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-slate-200 flex flex-col z-40">
      <div className="h-14 flex items-center px-5 border-b border-slate-100">
        <Link href="/dashboard" className="text-xl font-bold text-slate-900">Vettd<span className="text-blue-600">RE</span></Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}>
                    <span className="text-base">{item.icon}</span>{item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
          <span className="text-base">🚪</span>Sign out
        </button>
      </div>
    </aside>
  );
}
