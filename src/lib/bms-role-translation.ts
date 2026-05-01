// Slice 6-ext — pure User.role → BrokerageRole translation.
//
// The codebase has two distinct role vocabularies:
//
//   User.role         : super_admin | admin | agent          (Prisma)
//   BrokerageRoleType : brokerage_admin | broker | manager | agent
//
// Most consumers need to translate a User.role into a BrokerageRole. The
// full translation lives in bms-auth.ts:getCurrentBrokerageRole and
// includes DB-dependent branches (firstOrgUser fallback, BrokerAgent
// join). This module exposes the PURE subset of that translation —
// the part that depends only on the User.role string and nothing else.
//
// Why "pure subset" matters:
//   - It can be unit-tested without any auth context, Prisma client, or
//     async runtime.
//   - It can be called synchronously from edge contexts (middleware,
//     layout-level decisions) where async DB work isn't available.
//   - It keeps the cross-role landing-permission contract in
//     tests/smoke/role-landing.test.ts honest — slice 6 covered "agent"
//     end-to-end via the role-string identity; slice 6-ext extends to
//     owner/admin/manager via this helper.
//
// What this helper does NOT cover:
//   - The agent path. Returns null because mapping User.role="agent" to
//     a BrokerageRole requires reading BrokerAgent.brokerageRole from
//     the DB. Callers needing the agent translation must use
//     getCurrentBrokerageRole.
//   - The "first user in the org is the de facto owner" fallback. That
//     branch in getCurrentBrokerageRole catches users with no User.role
//     who created their org and never had a role assigned. Pure helper
//     can't see that — DB-dependent.
//
// IMPORTANT: behavior parity with the original inline ROLE_MAP is
// load-bearing. If a future edit changes the mapping here, run
// `tests/smoke/role-landing.test.ts` and verify all assertions still pass.

// NO "use server" directive. The helper is consumed by both server-only
// files (bms-auth.ts) and pure smoke tests. Server-only directive would
// force the test runner to load the server-action wrapper, which is
// unnecessary here.

import type { BrokerageRoleType } from "./bms-types";

/**
 * Pure User.role → BrokerageRole mapping. Returns null when the User.role
 * value can't be pure-translated (agent path requires DB; unknown values
 * fall through).
 *
 * Behavior table (locked by tests/smoke/role-landing.test.ts):
 *
 *   User.role          → BrokerageRole
 *   "super_admin"      → "brokerage_admin"
 *   "owner"            → "brokerage_admin"
 *   "admin"            → "brokerage_admin"
 *   "manager"          → "manager"
 *   "agent"            → null         (needs BrokerAgent.brokerageRole DB lookup)
 *   null / undefined   → null
 *   ""                 → null
 *   anything else      → null
 */
export function translateUserRoleToBrokerageRole(
  userRole: string | null | undefined,
): BrokerageRoleType | null {
  if (
    userRole === "owner" ||
    userRole === "admin" ||
    userRole === "super_admin"
  ) {
    return "brokerage_admin";
  }
  if (userRole === "manager") {
    return "manager";
  }
  return null;
}
