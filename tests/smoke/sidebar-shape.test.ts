// Slice 7 smoke — role-segmented sidebar restructure.
//
// Source-level contracts on the global sidebar (sidebar.tsx) and its
// mobile mirror (mobile-nav.tsx). These tests parse the constant arrays
// inside both files via regex over file contents and assert exact item
// sets per role, removed-surface invariants, the role-set polarity flip,
// and mobile-desktop parity.
//
// ── Why source-level (not runtime) ────────────────────────────────────
// Both files are "use client" with imports that don't load cleanly in a
// node test runner (next/navigation, supabase client). Pure source-level
// regex tests match the pattern used by slices 1b / 6 / 13-cross-cut
// elsewhere in this suite and have proven reliable.
//
// ── Failure-message intent ────────────────────────────────────────────
// Contracts are grouped by topic (Wireframe A, Wireframe B, removed
// surfaces, polarity, badge wiring, parity) so test reporter output
// surfaces the *kind* of regression first, not the line number. When
// this test fails six months from now, the describe block name is the
// first thing the developer sees.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const sidebarSrc = readSource("src/components/layout/sidebar.tsx");
const mobileSrc = readSource("src/components/layout/mobile-nav.tsx");

// Extract the body of `const NAME[: type] = [ ... ];` — works because
// section constants in these files end the top-level array with `];`
// (semicolon) while inner items arrays end with `],` (comma). The
// non-greedy `[\s\S]*?` then anchors on the first `];` it encounters,
// which is the constant terminator.
function extractConstantBody(src: string, constName: string): string {
  const re = new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not find constant "${constName}"`);
  return m[1];
}

function extractItemNames(body: string): string[] {
  return [...body.matchAll(/name:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function extractSectionLabels(body: string): string[] {
  return [...body.matchAll(/label:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("Slice 7 — Wireframe A: agent sidebar shape", () => {
  // Locks the agent's sidebar to exactly the items in Wireframe A — order
  // included. Order matters because the daily-flow ordering ("My Deals
  // first") is a deliberate UX choice, not incidental. A future edit that
  // reshuffles or adds an item fails here so the change is deliberate.
  const agentBody = extractConstantBody(sidebarSrc, "AGENT_NAV_SECTIONS");

  it("has exactly the 9 items from Wireframe A, in order", () => {
    const names = extractItemNames(agentBody);
    expect(names).toEqual([
      "My Deals",
      "Client Onboarding",
      "Messages",
      "Calendar",
      "Contacts",
      "Market Intel",
      "Terminal",
      "Prospecting",
      "Screening",
    ]);
  });

  it("has exactly 2 sections (My Work + Research)", () => {
    const labels = extractSectionLabels(agentBody);
    expect(labels).toEqual(["My Work", "Research"]);
  });

  it("does NOT contain admin-only surface labels", () => {
    // Defensive: agent sidebar must never silently surface manager
    // tooling. If a future edit reuses the agent's NAV constant and
    // adds e.g. "Brokerage" to it (because manager ergonomics seemed
    // similar), this test fails so the cross-role boundary is preserved.
    expect(agentBody).not.toMatch(/name:\s*["']Brokerage["']/);
    expect(agentBody).not.toMatch(/name:\s*["']Underwrite["']/);
    expect(agentBody).not.toMatch(/name:\s*["']Leasing["']/);
    expect(agentBody).not.toMatch(/name:\s*["']Properties["']/);
  });
});

describe("Slice 7 — Wireframe B: brokerage_admin sidebar shape", () => {
  const adminBody = extractConstantBody(sidebarSrc, "ADMIN_NAV_SECTIONS");

  it("has exactly the 10 items from Wireframe B, in order", () => {
    const names = extractItemNames(adminBody);
    expect(names).toEqual([
      "Brokerage",
      "Messages",
      "Calendar",
      "Contacts",
      "Properties",
      "Underwrite",
      "Leasing",
      "Market Intel",
      "Terminal",
      "Screening",
    ]);
  });

  it("has exactly 3 sections (My Work, Listings & Deals, Intel)", () => {
    const labels = extractSectionLabels(adminBody);
    expect(labels).toEqual(["My Work", "Listings & Deals", "Intel"]);
  });
});

describe("Slice 7 — Removed surfaces", () => {
  // Three items audited as "noise" or "redundant" must stay gone:
  //   1. Property Management coming-soon section (premature surface).
  //   2. Automation top-level entry (lives in /settings/automations).
  //   3. Coming-soon items as a *category* — the supporting code path
  //      was deleted; readding via comingSoon: true would crash render.

  it("PROPERTY MANAGEMENT section is removed", () => {
    expect(sidebarSrc).not.toMatch(/Property Management/);
    expect(sidebarSrc).not.toMatch(/Property Mgmt/);
  });

  it("AUTOMATION section is removed from sidebar (still accessible via /settings/automations)", () => {
    // We only assert "Automations" doesn't appear as a sidebar item name —
    // /settings/automations the route still exists.
    expect(sidebarSrc).not.toMatch(/name:\s*["']Automations["']/);
  });

  it("no comingSoon: true anywhere in sidebar.tsx", () => {
    expect(sidebarSrc).not.toMatch(/comingSoon:\s*true/);
  });

  it("ComingSoonItem function is deleted (dead-code removal)", () => {
    // "Future use" scaffolds rot silently. If the function comes back,
    // the test fails — re-adding requires a fresh decision about whether
    // the new coming-soon item warrants the rendering pathway.
    expect(sidebarSrc).not.toMatch(/function\s+ComingSoonItem/);
  });
});

describe("Slice 7 — Role-segmentation polarity", () => {
  // Today's `role === "agent" ? AGENT : ADMIN` granted the admin
  // sidebar to anything that wasn't literally "agent" — including
  // unknown roles and empty strings. Slice 7 flips the polarity so
  // only known admin roles get the admin sidebar; everything else
  // (including unknown values and future enum additions) falls
  // through to the agent shape. This test locks the boundary so a
  // future edit can't silently re-grant by accident.

  it("admin role set is exactly {admin, owner, super_admin}", () => {
    // Locked-in by Set construction: any new role added means a
    // deliberate grant, never an implicit one.
    expect(sidebarSrc).toMatch(
      /ADMIN_USER_ROLES\s*=\s*new Set<string>\(\[\s*["']admin["']\s*,\s*["']owner["']\s*,\s*["']super_admin["']\s*\]\)/,
    );
  });

  it("renders admin sidebar via positive isAdminRole match (not agent-negation)", () => {
    // The render-time branch must call isAdminRole(role) — the helper —
    // not inline `role === "agent"`. Without this, polarity-flip drift:
    // someone re-introduces the agent-negation pattern, defeating the
    // privilege-by-default fix.
    expect(sidebarSrc).toMatch(
      /isAdminRole\(role\)\s*\?\s*ADMIN_NAV_SECTIONS\s*:\s*AGENT_NAV_SECTIONS/,
    );
  });
});

describe("Slice 7 — Submitted-count badge wiring", () => {
  // The whole point of moving Brokerage to the global sidebar's WORK
  // section is to surface the deal-submission queue. Without the
  // badge, the queue is just one more click — the audit's premise
  // about queue invisibility re-emerges.

  it("Brokerage NavItem has badge: true in ADMIN_NAV_SECTIONS", () => {
    const adminBody = extractConstantBody(sidebarSrc, "ADMIN_NAV_SECTIONS");
    // Match `name: "Brokerage", ... badge: true` allowing other props between.
    expect(adminBody).toMatch(/name:\s*["']Brokerage["'][\s\S]{0,200}badge:\s*true/);
  });

  it("submitted state + getSubmittedCount fetch are wired in Sidebar component", () => {
    expect(sidebarSrc).toMatch(/import\s*\{\s*getSubmittedCount\s*\}/);
    expect(sidebarSrc).toMatch(/const\s+\[submitted,\s*setSubmitted\]\s*=\s*useState\(0\)/);
    // Override-aware: super_admin viewing tenant ?as_org= must see the
    // tenant's queue, not their own. Without this the badge is wrong
    // half the time when the override is active.
    expect(sidebarSrc).toMatch(/getSubmittedCount\(\s*overrideOpts\s*\)/);
  });

  it("badge dispatch branch on /brokerage exists in SidebarItem", () => {
    // Locks the new render branch. If a future edit collapses badges
    // into a polymorphic shape and forgets the /brokerage case, the
    // submitted count silently disappears.
    expect(sidebarSrc).toMatch(
      /item\.href\s*===\s*["']\/brokerage["'][\s\S]{0,300}submitted\s*>\s*0/,
    );
  });

  it("submitted-count fetch is gated on isAdminRole (no fetch for agents)", () => {
    // Save the COUNT query on every agent page load. Also documents
    // that the submitted state is never relevant for the agent path.
    expect(sidebarSrc).toMatch(
      /if\s*\(\s*!isAdminRole\(role\)\s*\)\s*return;[\s\S]{0,400}getSubmittedCount/,
    );
  });
});

describe("Slice 7 — Mobile-desktop parity", () => {
  // Mobile must surface every desktop item — drift between the two
  // surfaces is a real regression class (an item added to the desktop
  // sidebar but not wired to mobile is unreachable for half the user
  // base). Bidirectional check: we want both directions to track each
  // other so neither file becomes the "real" sidebar at the other's
  // expense.
  //
  // Modulo:
  //   - Dashboard: rendered above sections on desktop, in bottom tabs
  //     on mobile — neither side is in a NavSection constant.
  //   - Settings: rendered below sections on desktop, in More sheet
  //     on mobile — same exclusion.
  //   - "More": a mobile-only construct.

  function getDesktopNamesForRole(role: "agent" | "admin"): Set<string> {
    const constName = role === "agent" ? "AGENT_NAV_SECTIONS" : "ADMIN_NAV_SECTIONS";
    const body = extractConstantBody(sidebarSrc, constName);
    return new Set(extractItemNames(body));
  }

  function getMobileNamesForRole(role: "agent" | "admin"): Set<string> {
    const tabsConst = role === "agent" ? "AGENT_TABS" : "ADMIN_TABS";
    const moreConst = role === "agent" ? "AGENT_MORE_SECTIONS" : "ADMIN_MORE_SECTIONS";
    const tabBody = extractConstantBody(mobileSrc, tabsConst);
    const moreBody = extractConstantBody(mobileSrc, moreConst);
    const all = new Set([...extractItemNames(tabBody), ...extractItemNames(moreBody)]);
    all.delete("More"); // mobile-only construct, not a real surface
    all.delete("Dashboard"); // tab-bar always pins it; not a section item
    return all;
  }

  it("agent: every desktop item appears on mobile (tab bar or More sheet)", () => {
    const desktop = getDesktopNamesForRole("agent");
    const mobile = getMobileNamesForRole("agent");
    const missing = [...desktop].filter((n) => !mobile.has(n));
    expect(missing, `Mobile missing desktop items: ${missing.join(", ")}`).toEqual([]);
  });

  it("admin: every desktop item appears on mobile (tab bar or More sheet)", () => {
    const desktop = getDesktopNamesForRole("admin");
    const mobile = getMobileNamesForRole("admin");
    const missing = [...desktop].filter((n) => !mobile.has(n));
    expect(missing, `Mobile missing desktop items: ${missing.join(", ")}`).toEqual([]);
  });

  it("agent: every mobile item appears on desktop (no orphan mobile-only surfaces)", () => {
    // Reverse direction: catches the case where a feature ships only
    // on mobile and silently never gets a desktop home.
    const desktop = getDesktopNamesForRole("agent");
    const mobile = getMobileNamesForRole("agent");
    const orphan = [...mobile].filter((n) => !desktop.has(n));
    expect(orphan, `Mobile-only orphans: ${orphan.join(", ")}`).toEqual([]);
  });

  it("admin: every mobile item appears on desktop (no orphan mobile-only surfaces)", () => {
    const desktop = getDesktopNamesForRole("admin");
    const mobile = getMobileNamesForRole("admin");
    const orphan = [...mobile].filter((n) => !desktop.has(n));
    expect(orphan, `Mobile-only orphans: ${orphan.join(", ")}`).toEqual([]);
  });

  it("Settings item appears on both desktop and mobile (modulo render position)", () => {
    // Settings is special-cased outside the section constants. Direct
    // string check rather than parsing — keeps the contract robust to
    // future structural changes that re-home Settings.
    expect(sidebarSrc).toMatch(/SETTINGS_ITEM[\s\S]{0,200}name:\s*["']Settings["']/);
    expect(mobileSrc).toMatch(/SETTINGS_ITEM[\s\S]{0,200}name:\s*["']Settings["']/);
  });
});
