"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  adminOnly?: boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
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
      { href: "/settings/lead-rules", icon: "🎯", label: "Lead Rules", adminOnly: true },
    ],
  },
  {
    group: "CRM",
    items: [
      { href: "/settings/pipeline", icon: "📊", label: "Pipeline", adminOnly: true },
      { href: "/settings/ai", icon: "🤖", label: "AI Settings", adminOnly: true },
      { href: "/settings/branding", icon: "🎨", label: "Branding", adminOnly: true },
    ],
  },
  {
    group: "Communications",
    items: [
      { href: "/settings/gmail", icon: "📬", label: "Gmail" },
      { href: "/settings/phone", icon: "📞", label: "Phone & SMS", adminOnly: true },
      { href: "/settings/sync", icon: "⏱️", label: "Sync" },
      { href: "/settings/templates", icon: "📝", label: "Templates" },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/settings/billing", icon: "💳", label: "Billing" },
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/settings/api-keys", icon: "🔑", label: "API Keys", adminOnly: true },
      { href: "/settings/export", icon: "📤", label: "Export" },
    ],
  },
];

const ADMIN_NAV: NavGroup = {
  group: "Admin",
  items: [
    { href: "/settings/admin", icon: "🛡️", label: "Dashboard" },
    { href: "/settings/admin/users", icon: "👥", label: "Manage Users" },
    { href: "/settings/admin/teams", icon: "🏢", label: "Teams" },
    { href: "/settings/admin/waitlist", icon: "➕", label: "Add User" },
  ],
};

/* Pages agents are allowed to see */
const AGENT_ALLOWED = new Set([
  "/settings/profile",
  "/settings/signature",
  "/settings/notifications",
  "/settings/hours",
  "/settings/gmail",
  "/settings/sync",
]);

export default function SettingsSidebar({ userEmail, userRole }: { userEmail?: string; userRole?: string }) {
  const pathname = usePathname();
  const adminRoles = ["super_admin", "admin", "owner"];
  const isOrgAdmin = adminRoles.includes(userRole ?? "");
  const isSuperAdmin = userRole === "super_admin";
  const isAgent = userRole === "agent";

  // Agents get a minimal settings view; admins/owners get everything
  const filteredNav = (isSuperAdmin ? [...NAV, ADMIN_NAV] : NAV)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (isAgent) return AGENT_ALLOWED.has(item.href);
        return !item.adminOnly || isOrgAdmin;
      }),
    }))
    .filter((g) => g.items.length > 0);

  const allItems = filteredNav.flatMap((g) => g.items);

  return (
    <>
      {/* Mobile: horizontal scrolling pills */}
      <div className="md:hidden overflow-x-auto no-scrollbar bg-slate-50 border-b border-slate-200 px-3 py-2">
        <div className="flex gap-1.5">
          {allItems.map((item) => {
            const active = pathname === item.href;
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
                <span className="text-sm">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:block w-[220px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-4">
        {filteredNav.map((group) => (
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
    </>
  );
}
