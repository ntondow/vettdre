# Prompt: Fix User Management Table + Add Role Column + Fix BMS Access

## Problem Summary

Three issues on the admin User Management page (`/settings/admin/users`):

1. **Table overflows the container** — the Name column is cut off on the left, columns extend past the viewport. The Settings layout (`src/app/(dashboard)/settings/layout.tsx`) constrains content to `max-w-[720px]` which is too narrow for an 8-column admin table.
2. **No Role column** — admins can change Plan, Approved, and Active status, but there's no way to change a user's `role` (owner/admin/manager/agent/viewer). The `role` field is already fetched by `getUsers()` and present in the `UserRow` interface, it's just never rendered.
3. **BMS "Access Denied"** — the Brokerage module checks `getCurrentBrokerageRole()` in `src/lib/bms-auth.ts`, which maps `User.role === "owner" | "admin"` → `brokerage_admin`. But all users are created with `role: "agent"` by default, including the org creator (nathan@ntrec.co). Without a way to change roles from the admin UI, nobody can get BMS admin access.

## Root Cause

All three issues trace to the same gap: there's no Role column on the User Management table, the table container is too narrow, and users default to `role: "agent"` with no admin UI to change it.

---

## Files to Modify

### File 1: `src/app/(dashboard)/settings/layout.tsx`

**Current** (line 15):
```tsx
<div className="max-w-[720px] mx-auto px-4 md:px-8 py-6 md:py-8">
```

**Change to:**
```tsx
<div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
```

`max-w-5xl` (1024px) gives enough room for 8 compact columns. This affects all settings pages — they'll have slightly more breathing room, which is fine.

---

### File 2: `src/app/(dashboard)/settings/admin/admin-actions.ts`

**Add** this new server action between `updateUserPlan` and `deleteUser` (around line 136). NOTE: this may already exist — if it does, skip this step:

```typescript
export async function updateUserRole(userId: string, role: string) {
  await requireAdmin();
  const validRoles = ["owner", "admin", "manager", "agent", "viewer"];
  if (!validRoles.includes(role)) throw new Error("Invalid role");
  await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
  });
  return { success: true };
}
```

---

### File 3: `src/app/(dashboard)/settings/admin/users/admin-users-client.tsx`

This is the main file. Make these changes:

#### 3a. Import `updateUserRole`

Add `updateUserRole` to the import block from `"../admin-actions"`. If it's already there, skip.

#### 3b. Add `handleRoleChange` handler

Place it right after `handlePlanChange`. Same pattern:

```typescript
const handleRoleChange = async (userId: string, role: string) => {
  setUpdating(userId);
  try {
    await updateUserRole(userId, role);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    showToast(`Role updated to ${role}`);
  } catch (e: any) {
    showToast("Error: " + e.message, "error");
  }
  setUpdating(null);
};
```

#### 3c. Add Role column header

In the `<thead>`, add a Role `<th>` between Plan and Approved:

```html
<th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase">Role</th>
```

#### 3d. Add Role cell in table body

In each `<tr>`, add a `<td>` between the Plan cell and the Approved cell:

```tsx
<td className="px-3 py-2.5">
  <select
    value={user.role}
    onChange={(e) => handleRoleChange(user.id, e.target.value)}
    disabled={updating === user.id}
    className={`text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer ${
      user.role === "owner" ? "bg-amber-50 border-amber-200 text-amber-700" :
      user.role === "admin" ? "bg-purple-50 border-purple-200 text-purple-700" :
      user.role === "manager" ? "bg-blue-50 border-blue-200 text-blue-700" :
      user.role === "agent" ? "bg-slate-50 border-slate-200 text-slate-600" :
      "bg-slate-50 border-slate-200 text-slate-400"
    }`}
  >
    <option value="owner">Owner</option>
    <option value="admin">Admin</option>
    <option value="manager">Manager</option>
    <option value="agent">Agent</option>
    <option value="viewer">Viewer</option>
  </select>
</td>
```

#### 3e. Tighten table layout to fit

To keep 8 columns from overflowing:
- Change ALL existing `px-4 py-3` on `<th>` and `<td>` elements to `px-3 py-2.5`
- Change header text from `text-xs` to `text-[11px]`
- Remove the **Last Login** column entirely (both `<th>` and `<td>`) — low-value data that wastes horizontal space
- In the Actions column: use `text-[11px]` for buttons, reduce gap to `gap-1.5`, add pipe separators (`<span className="text-slate-200">|</span>`) between Reset/Set Pwd/Delete, shorten "Reset Pwd" to "Reset"
- Add `whitespace-nowrap` to the Created date `<td>`
- Change the filter bar padding from `p-4 mb-6` to `p-3 mb-4`
- Change the subtitle margin from `mb-6` to `mb-4`

#### 3f. Fix Plan select Explorer color

The Plan `<select>` class logic is missing the `explorer` case (it falls through to enterprise amber). Add this case between `free` and `pro`:

```
user.plan === "explorer" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
```

#### 3g. Update subtitle text

Change `"Manage user accounts, plans, and approval status."` to `"Manage user accounts, plans, roles, and approval status."`

---

## How It Fixes the BMS Access Problem

Once the Role column is in place:
1. Admin sets nathan@ntrec.co's role to `owner` via the dropdown
2. `getCurrentBrokerageRole()` in `src/lib/bms-auth.ts` (line 31) checks `if (user.role === "owner" || user.role === "admin")` → returns `"brokerage_admin"`
3. The brokerage layout (`src/app/(dashboard)/brokerage/layout.tsx` line 131) checks `if (orgRole === "owner" || orgRole === "admin")` → sets role to `"brokerage_admin"` → shows full admin nav
4. The brokerage settings page (`src/app/(dashboard)/brokerage/settings/page.tsx` line 222) checks `if (!info || info.role !== "brokerage_admin")` → now passes → shows settings instead of "Access Denied"

No changes needed to `bms-auth.ts`, the brokerage layout, or settings page. The role mapping logic already exists — it just needs the admin UI to actually set the role.

---

## What NOT to Change

- `src/lib/bms-auth.ts` — role mapping already handles owner/admin → brokerage_admin
- `src/lib/bms-permissions.ts` — permission matrix is correct
- `src/lib/bms-types.ts` — BrokerageRoleType and permission definitions are correct
- `src/app/(dashboard)/brokerage/layout.tsx` — nav filtering already works with role
- `src/app/(dashboard)/brokerage/settings/page.tsx` — auth check is correct
- `src/components/layout/sidebar.tsx` — sidebar role filtering is correct
- `src/lib/feature-gate.ts` — enterprise plan already returns true for all features
- Do NOT add a role filter dropdown to the filter bar (not needed right now)
- Do NOT change the `UserRow` interface — `role: string` is already there
- Do NOT change the `getUsers()` query — `role` is already selected

---

## Testing Checklist

1. Navigate to `/settings/admin/users` — table should fit without horizontal overflow
2. Verify 8 columns visible: Name, Email, Plan, **Role**, Approved, Active, Created, Actions
3. Change nathan@ntrec.co's Role from "Agent" to "Owner" — should see toast "Role updated to owner"
4. Refresh the page — Role should persist as "Owner"
5. Navigate to `/brokerage` — should see the full admin nav (Dashboard, Listings, Properties, Submissions, Invoices, etc.) instead of "Access Denied"
6. Navigate to `/brokerage/settings` — should load the settings page, NOT "Access Denied"
7. Change another user (e.g. kristin@gulinogroupny.com) to "Admin" — they should also get full BMS access on next login
8. Set a user to "Agent" — they should only see "My Deals" in the Brokerage sidebar
