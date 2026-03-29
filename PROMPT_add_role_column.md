# Prompt: Add Editable Role Column to User Management Table

## Context

VettdRE has a **two-layer permission system**:

1. **Plan** (`User.plan`: free | explorer | pro | team | enterprise) — controls which features/nav items are visible via `src/lib/feature-gate.ts`. Enterprise & Team users get all features (`hasPermission()` returns `true` for both).
2. **Role** (`User.role`: owner | admin | manager | agent | viewer) — controls BMS (Brokerage Management System) access. In the sidebar (`src/components/layout/sidebar.tsx`), certain nav items are filtered by `roles` — e.g. "Brokerage" requires `["owner", "admin"]`, while "My Deals" requires `["agent"]`.

**The problem:** The admin User Management page at `Settings > Admin > Manage Users` lets admins change a user's Plan, Approved, and Active status — but there is **no way to change a user's Role**. This means Enterprise users with role `agent` only see "Dashboard" + "My Deals" in the Brokerage section, missing the full Brokerage admin view and any other role-gated items.

## Files to modify

### 1. `src/app/(dashboard)/settings/admin/admin-actions.ts` (server action)

Add `updateUserRole` server action. It should:
- Accept `userId: string` and `role: string`
- Call `requireAdmin()` for authorization (same pattern as `updateUserPlan`)
- Validate that `role` is one of: `"owner"`, `"admin"`, `"manager"`, `"agent"`, `"viewer"` — throw an error if not
- Use `prisma.user.update()` to set `role: role as any`
- Return `{ success: true }`

Place it between `updateUserPlan` and `deleteUser`.

### 2. `src/app/(dashboard)/settings/admin/users/admin-users-client.tsx` (client component)

#### Import
Add `updateUserRole` to the import from `"../admin-actions"`.

#### Handler
Add `handleRoleChange` async function (same pattern as `handlePlanChange`):
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

#### Table header
Add a **Role** column header between the Plan and Approved columns:
```html
<th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase">Role</th>
```

#### Table body
Add a Role `<td>` cell between the Plan and Approved cells. Use a `<select>` dropdown with color-coded styling per role:
- `owner` → amber (`bg-amber-50 border-amber-200 text-amber-700`)
- `admin` → purple (`bg-purple-50 border-purple-200 text-purple-700`)
- `manager` → blue (`bg-blue-50 border-blue-200 text-blue-700`)
- `agent` → slate (`bg-slate-50 border-slate-200 text-slate-600`)
- `viewer` → light slate (`bg-slate-50 border-slate-200 text-slate-400`)

The select should:
- Use `value={user.role}` and `onChange={(e) => handleRoleChange(user.id, e.target.value)}`
- Be `disabled={updating === user.id}`
- Have `cursor-pointer` class
- Match the styling pattern of the Plan select (text-xs font-medium px-2 py-1 rounded-lg border)

Options: Owner, Admin, Manager, Agent, Viewer (values: owner, admin, manager, agent, viewer).

#### Layout tightening (fit to screen)
To accommodate the new Role column without horizontal overflow:
- Reduce all cell padding from `px-4 py-3` to `px-3 py-2.5`
- Reduce header text from `text-xs` to `text-[11px]`
- Remove the "Last Login" column entirely (header + cell) — it's low-value for this view
- In the Actions column, use `text-[11px]` for button text, `gap-1.5` between buttons, and add `<span className="text-slate-200">|</span>` separators between Reset/Set Pwd/Delete
- Shorten "Reset Pwd" to just "Reset"
- Change the Created cell to `text-xs whitespace-nowrap`
- Change the filter bar wrapper from `p-4 mb-6` to `p-3 mb-4`
- Change the subtitle `mb-6` to `mb-4`

#### Plan select: fix Explorer color
The existing Plan `<select>` is missing the `explorer` case in its color logic (it falls through to the enterprise amber). Add:
```
user.plan === "explorer" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
```
between the `free` and `pro` cases.

## What NOT to change
- Do NOT touch `feature-gate.ts`, `feature-gate-server.ts`, `sidebar.tsx`, `mobile-nav.tsx`, or any other files
- Do NOT change the `UserRow` interface — `role` is already included
- Do NOT modify the `getUsers` query — `role` is already selected
- Do NOT add role filtering to the filter bar (plan and status filters are enough for now)
- Do NOT change the `hasPermission()` logic — enterprise already returns `true` for everything

## Testing
After the change, the Manage Users table should show 8 columns: Name, Email, Plan, **Role**, Approved, Active, Created, Actions. The Role dropdown should be inline-editable just like Plan. Changing a user's role from `agent` to `admin` should let them see the "Brokerage" nav item instead of just "My Deals" on their next page load.
