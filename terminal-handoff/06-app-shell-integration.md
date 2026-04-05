# Terminal Handoff Prompt 6: App Shell Integration

## Goal
Wire the Terminal into the existing VettdRE app shell: add navigation entries (sidebar + mobile nav), configure feature gating so Terminal is only visible to the right plan tiers, and handle any remaining integration points (layout adjustments, route registration, preference initialization). This is the final prompt that makes Terminal accessible to users.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `src/components/layout/sidebar.tsx`
- `src/components/layout/mobile-nav.tsx`
- `src/lib/feature-gate.ts`
- `src/lib/supabase/middleware.ts` (if needed for route protection)

## Discovery Instructions
Before writing any code, read the following files:

1. `src/components/layout/sidebar.tsx` — Read the full file. Understand:
   - The NavItem interface and how items are structured
   - The nav sections array (how items are grouped under labels like "Research", "Automation", etc.)
   - How feature gates are checked: the `feature` property on nav items
   - How icons are rendered (emoji strings or Lucide components)
   - How badges work (unread counts, etc.)
   - Role-based visibility (ADMIN vs AGENT nav sections)

2. `src/components/layout/mobile-nav.tsx` — Read the full file. Understand:
   - The 5 main tabs (Dashboard, Contacts, Pipeline, Messages, More)
   - The "More" sheet that expands with additional nav items
   - How feature gates are applied on mobile
   - How the bottom bar is styled (fixed, pb-safe for notched devices)

3. `src/lib/feature-gate.ts` — Read the full file. Understand:
   - The Feature type union (all feature strings)
   - The plan tier hierarchy: FREE → EXPLORER → PRO → TEAM → ENTERPRISE
   - How TIER_PERMISSIONS maps plans to feature arrays
   - The UPGRADE_MESSAGES record
   - The `hasPermission(feature, plan)` function
   - How features are inherited (PRO includes all EXPLORER features, etc.)

4. `src/app/(dashboard)/layout.tsx` — Read the full file. Understand:
   - How auth is checked (Supabase createClient + getUser)
   - How UserPlanProvider wraps children
   - How sidebar and mobile-nav are rendered
   - The main content area's padding (pb-16 md:pb-0 md:pl-60)

5. `src/lib/supabase/middleware.ts` — Check the public routes list to make sure /terminal is NOT in it (it shouldn't be — it's under (dashboard) which is already protected).

6. `src/app/(dashboard)/terminal/page.tsx` (created in Prompt 5) — Verify it exists and understand what it renders.

**Propose your plan before writing any code.**

## Implementation Intent

### 1. Feature Gate Configuration (`src/lib/feature-gate.ts`)

Add three new features to the Feature type union:
- `nav_terminal` — Controls whether Terminal appears in navigation
- `terminal_access` — Controls whether Terminal page loads content vs shows paywall
- `terminal_ai_brief` — Controls whether AI briefs are generated (future granularity)

Decide which plan tiers get Terminal access. Recommended:
- **FREE**: No access (Terminal is a premium draw)
- **EXPLORER**: `nav_terminal` only (can see the nav item but gets an upgrade prompt on the page)
- **PRO**: `nav_terminal` + `terminal_access` + `terminal_ai_brief` (full access)
- **TEAM**: inherits PRO
- **ENTERPRISE**: inherits TEAM

Add upgrade messages:
```typescript
nav_terminal: "Upgrade to Pro to access the Terminal",
terminal_access: "Upgrade to Pro to use real-time market intelligence",
terminal_ai_brief: "Upgrade to Pro for AI-generated intelligence briefs",
```

### 2. Sidebar Entry (`src/components/layout/sidebar.tsx`)

Add Terminal to the sidebar navigation. Place it in the "Research" section alongside Market Intel:

```typescript
{
  name: "Terminal",
  href: "/terminal",
  icon: "📡",  // or use a Lucide icon like Monitor or Radio
  feature: "nav_terminal",
}
```

Position it right after Market Intel in the Research section. If there's no explicit "Research" section, find where Market Intel lives and add Terminal next to it.

For both ADMIN and AGENT nav arrays (Terminal should be visible to both roles, gated by plan not role).

### 3. Mobile Nav Entry (`src/components/layout/mobile-nav.tsx`)

Add Terminal to the "More" sheet. Do NOT add it as a main bottom tab (those 5 slots are taken). Instead:
- Add it to the expanded "More" menu
- Same feature gate: `nav_terminal`
- Same icon as sidebar
- Position near Market Intel in the list

### 4. Preference Initialization

When a user first visits `/terminal`, they need a UserTerminalPreferences record. This should be handled in the Terminal page's server component (created in Prompt 5) with a "get or create" pattern:

```typescript
// In terminal/page.tsx server component or terminal/actions.ts
const prefs = await prisma.userTerminalPreferences.upsert({
  where: { userId: user.id },
  create: {
    userId: user.id,
    orgId: user.orgId,
    enabledCategories: defaultCategories,  // from TerminalEventCategory where defaultEnabled = true
    enabledBoroughs: [1, 2, 3, 4, 5],     // all boroughs
    selectedNtas: [],                       // empty = all
  },
  update: {},  // don't overwrite existing prefs
});
```

If this logic isn't already in Prompt 5's page.tsx, add it. If it is, verify it follows this pattern.

### 5. Feature Gate on Terminal Page

The Terminal page component should check for `terminal_access` and show an upgrade prompt if the user's plan doesn't have it:

```typescript
const { plan } = useUserPlan();

if (!hasPermission("terminal_access", plan)) {
  return <TerminalPaywall />;  // Simple upgrade card with feature preview
}
```

Create a simple `TerminalPaywall` component that:
- Shows a preview screenshot or mockup of the Terminal (can be a static dark-themed card)
- Lists key features: "Real-time event detection", "AI intelligence briefs", "Borough & category filters"
- Has an "Upgrade to Pro" button linking to `/settings/billing`
- Uses the Terminal dark theme colors so it feels like a taste of the product

### 6. Verification Checklist

After making all changes, verify:
- [ ] Terminal appears in sidebar under Research section when user has PRO plan
- [ ] Terminal appears in mobile "More" sheet when user has PRO plan
- [ ] Terminal does NOT appear for FREE users
- [ ] Terminal shows in nav but displays paywall for EXPLORER users
- [ ] Clicking Terminal in sidebar navigates to /terminal
- [ ] The Terminal page renders inside the dashboard layout (sidebar visible, correct padding)
- [ ] User preferences are created on first visit
- [ ] Feature gate strings are consistent across all files (no typos)

## Constraints
- Do NOT change the 5 main mobile bottom tabs — Terminal goes in the "More" sheet only
- Do NOT change the dashboard layout padding or structure — Terminal page handles its own internal dark theme
- Follow exact conventions from existing nav items (same interface shape, same feature gate pattern)
- The Terminal icon should visually match the style of other nav items (emoji or Lucide, whichever is the dominant pattern in sidebar.tsx)
- Do NOT gate Terminal by role (admin/agent) — gate by plan only. All roles with the right plan see it.
- Do NOT add Terminal as a `comingSoon` item — it's shipping, not teased
- The paywall component should be minimal — don't over-design it. A card with heading, 3 bullet points, and a CTA button is enough.
- Run the app locally and navigate to /terminal to verify everything works end-to-end
