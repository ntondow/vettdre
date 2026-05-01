"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  PenTool,
  Bell,
  Clock,
  Users,
  Target,
  GitBranch,
  Sparkles,
  Palette,
  Mail,
  Phone,
  RefreshCw,
  FileText,
  CreditCard,
  Zap,
  Key,
  Download,
  ShieldCheck,
  Building2,
  UserPlus,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

/* Slice 9 — semantic disambiguations baked in:
 * - Pipeline → GitBranch (BarChart3 reads "reports", which Reports owns).
 * - AI Settings → Sparkles (Bot is reserved for the Leasing surface).
 * - Add User → UserPlus (specific intent vs. generic Plus).
 * Locked by smoke contract #7 in tests/smoke/sidebar-icon-migration.test.ts. */
const NAV: NavGroup[] = [
  {
    group: "Account",
    items: [
      { href: "/settings/profile", icon: User, label: "Profile" },
      { href: "/settings/signature", icon: PenTool, label: "Signature" },
      { href: "/settings/notifications", icon: Bell, label: "Notifications" },
      { href: "/settings/hours", icon: Clock, label: "Working Hours" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "/settings/team", icon: Users, label: "Members" },
      { href: "/settings/lead-rules", icon: Target, label: "Lead Rules", adminOnly: true },
    ],
  },
  {
    group: "CRM",
    items: [
      { href: "/settings/pipeline", icon: GitBranch, label: "Pipeline", adminOnly: true },
      { href: "/settings/ai", icon: Sparkles, label: "AI Settings", adminOnly: true },
      { href: "/settings/branding", icon: Palette, label: "Branding", adminOnly: true },
    ],
  },
  {
    group: "Communications",
    items: [
      { href: "/settings/gmail", icon: Mail, label: "Gmail" },
      { href: "/settings/phone", icon: Phone, label: "Phone & SMS", adminOnly: true },
      { href: "/settings/sync", icon: RefreshCw, label: "Sync" },
      { href: "/settings/templates", icon: FileText, label: "Templates" },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/settings/billing", icon: CreditCard, label: "Billing" },
    ],
  },
  {
    group: "Workflows",
    items: [
      { href: "/settings/automations", icon: Zap, label: "Automations", adminOnly: true },
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/settings/api-keys", icon: Key, label: "API Keys", adminOnly: true },
      { href: "/settings/export", icon: Download, label: "Export" },
    ],
  },
];

const ADMIN_NAV: NavGroup = {
  group: "Admin",
  items: [
    { href: "/settings/admin", icon: ShieldCheck, label: "Dashboard" },
    { href: "/settings/admin/users", icon: Users, label: "Manage Users" },
    { href: "/settings/admin/teams", icon: Building2, label: "Teams" },
    { href: "/settings/admin/waitlist", icon: UserPlus, label: "Add User" },
    { href: "/settings/admin/terminal", icon: Activity, label: "Terminal Health" },
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
      <nav className="hidden md:block w-[220px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-4">
        {filteredNav.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
              {group.group}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
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
                  <Icon className="w-4 h-4 flex-shrink-0" />
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
