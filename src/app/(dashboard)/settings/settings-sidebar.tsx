"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    group: "Account",
    items: [
      { href: "/settings/profile", icon: "👤", label: "Profile" },
      { href: "/settings/signature", icon: "✍️", label: "Signature" },
      { href: "/settings/notifications", icon: "🔔", label: "Notifications" },
      { href: "/settings/hours", icon: "🕐", label: "Working Hours" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "/settings/team", icon: "👥", label: "Members" },
      { href: "/settings/lead-rules", icon: "🎯", label: "Lead Rules" },
    ],
  },
  {
    group: "CRM",
    items: [
      { href: "/settings/pipeline", icon: "📊", label: "Pipeline" },
      { href: "/settings/ai", icon: "🤖", label: "AI Settings" },
      { href: "/settings/branding", icon: "🎨", label: "Branding" },
    ],
  },
  {
    group: "Email",
    items: [
      { href: "/settings/gmail", icon: "📬", label: "Gmail" },
      { href: "/settings/sync", icon: "⏱️", label: "Sync" },
      { href: "/settings/templates", icon: "📝", label: "Templates" },
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/settings/api-keys", icon: "🔑", label: "API Keys" },
      { href: "/settings/export", icon: "📤", label: "Export" },
    ],
  },
];

export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-[220px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-4">
      {NAV.map((group) => (
        <div key={group.group} className="mb-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
            {group.group}
          </p>
          {group.items.map((item) => {
            const active = pathname === item.href;
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
                <span className="text-sm w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
