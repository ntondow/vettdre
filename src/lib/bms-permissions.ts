// BMS role-checking utilities — NO "use server"
// Pure functions safe for both server actions and client components

import { BMS_PERMISSIONS } from "./bms-types";
import type { BrokerageRoleType, BmsPermission } from "./bms-types";

// ── Permission Checks ────────────────────────────────────────

export function hasPermission(role: BrokerageRoleType, permission: BmsPermission): boolean {
  const allowed: readonly string[] = BMS_PERMISSIONS[permission];
  return allowed?.includes(role) ?? false;
}

export function hasAnyPermission(role: BrokerageRoleType, permissions: BmsPermission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: BrokerageRoleType, permissions: BmsPermission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function getPermissionsForRole(role: BrokerageRoleType): BmsPermission[] {
  const keys = Object.keys(BMS_PERMISSIONS) as BmsPermission[];
  return keys.filter((p) => (BMS_PERMISSIONS[p] as readonly string[]).includes(role));
}

// ── Page Access ──────────────────────────────────────────────

export const PAGE_PERMISSION_MAP: Record<string, BmsPermission> = {
  "/brokerage/dashboard": "view_dashboard",
  "/brokerage/deal-submissions": "view_all_submissions",
  "/brokerage/invoices": "view_all_invoices",
  "/brokerage/invoices/new": "create_invoice",
  "/brokerage/commission-plans": "view_plans",
  "/brokerage/reports": "view_reports",
  "/brokerage/reports/pnl": "view_reports",
  "/brokerage/reports/production": "view_reports",
  "/brokerage/reports/tax-prep": "view_1099",
  "/brokerage/reports/pipeline": "view_reports",
  "/brokerage/compliance": "view_compliance",
  "/brokerage/payments": "view_payments",
  "/brokerage/agents": "view_agents",
  "/brokerage/my-deals": "view_own_submissions",
  "/brokerage/settings": "manage_brokerage_settings",
};

export function canAccessPage(role: BrokerageRoleType, page: string): boolean {
  const permission = PAGE_PERMISSION_MAP[page];
  if (!permission) return false;

  // Special case: agents can access deal-submissions via view_own_submissions
  if (page === "/brokerage/deal-submissions" && role === "agent") {
    return hasPermission(role, "view_own_submissions");
  }

  return hasPermission(role, permission);
}
