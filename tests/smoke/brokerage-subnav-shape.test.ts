// Slice 8 smoke — brokerage sub-nav flatten.
//
// Source-level contracts on the brokerage sub-nav (brokerage/layout.tsx),
// the relocated-route Settings cards (brokerage/settings/page.tsx), and
// the new Compliance Dashboard alert (brokerage/dashboard/page.tsx +
// components/compliance-alert.tsx).
//
// Same parsing pattern as slice 7's sidebar-shape contracts: read each
// file as text, regex-extract item names from the constant bodies,
// assert exact sets and section counts.
//
// Failure-output intent: contracts grouped in describe blocks by topic
// so a regression six months from now reads "Compliance Dashboard
// alert wiring" as the first thing in the test reporter, not a line
// number.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const layoutSrc = readSource("src/app/(dashboard)/brokerage/layout.tsx");
const dashboardSrc = readSource("src/app/(dashboard)/brokerage/dashboard/page.tsx");
const alertSrc = readSource("src/app/(dashboard)/brokerage/dashboard/components/compliance-alert.tsx");
const settingsSrc = readSource("src/app/(dashboard)/brokerage/settings/page.tsx");

// Same pattern as sidebar-shape.test.ts: non-greedy match anchored on
// the `];` constant terminator. Inner items arrays end with `],` so the
// non-greedy match doesn't close prematurely.
function extractConstantBody(src: string, constName: string): string {
  const re = new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not find constant "${constName}"`);
  return m[1];
}

function extractItemHrefs(body: string): string[] {
  return [...body.matchAll(/href:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function extractItemLabels(body: string): string[] {
  return [...body.matchAll(/label:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function extractGroupNames(body: string): string[] {
  return [...body.matchAll(/group:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("Slice 8 — Wireframe C: brokerage_admin sub-nav shape", () => {
  // The audit's "17 items / 7 sections = overload" finding was the
  // premise. Wireframe C flattens to 11 items / 4 groups (3 primary +
  // Admin link). Order matters because the mobile pill scroller renders
  // items in this exact sequence — see Mobile Pill Parity below.
  //
  // Slice 19-B1 extends this to 12 items / 5 groups by adding a
  // "Documents" group with a "Templates" item, surfacing the previously-
  // invisible Document Vault. The new group is inserted before "Admin"
  // (right after "Reports") so Settings remains the last entry; this
  // preserves the muscle-memory invariant that Settings sits at the
  // bottom of the rail.
  const adminBody = extractConstantBody(layoutSrc, "ADMIN_NAV");

  it("ADMIN_NAV has exactly the 12 items (Wireframe C + slice 19-B1 Templates), in order, by label", () => {
    const labels = extractItemLabels(adminBody);
    expect(labels).toEqual([
      "Dashboard",
      "Submissions",
      "Transactions",
      "Invoices",
      "Payments",
      "Agents",
      "My Deals",
      "Listings",
      "Properties",
      "Reports",
      "Leaderboard",
      "Templates",
      "Settings",
    ]);
  });

  it("ADMIN_NAV has exactly 5 groups (Operations / Agents & Listings / Reports / Documents / Admin)", () => {
    const groups = extractGroupNames(adminBody);
    expect(groups).toEqual(["Operations", "Agents & Listings", "Reports", "Documents", "Admin"]);
  });
});

describe("Slice 8 — Removed surfaces (relocated, not deleted as routes)", () => {
  // Four sub-nav items moved out of ADMIN_NAV. Routes still exist;
  // entry points relocated to Settings cards (Setup / Commission Plans
  // / Compliance), Dashboard alert (Compliance), or in-page button
  // (Bulk Invoices via existing /brokerage/invoices header). If any
  // future edit re-adds them as top-level sub-nav items, this fails.
  const adminBody = extractConstantBody(layoutSrc, "ADMIN_NAV");
  const adminHrefs = new Set(extractItemHrefs(adminBody));

  it.each([
    ["/brokerage/setup", "moved to Settings → Brokerage Configuration"],
    ["/brokerage/commission-plans", "moved to Settings → Brokerage Configuration"],
    ["/brokerage/compliance", "moved to Settings → Brokerage Configuration + Dashboard alert"],
    ["/brokerage/invoices/bulk", "now via existing Bulk Generate button in /brokerage/invoices"],
  ])("ADMIN_NAV does NOT include %s (%s)", (href) => {
    expect(adminHrefs.has(href)).toBe(false);
  });
});

describe("Slice 8 — Agent sub-nav cleanup", () => {
  // Pre-slice-8 AGENT_NAV had an "Admin > Setup" entry that agents
  // could see (getVisibleNav returns AGENT_NAV unfiltered for agents —
  // no canAccessPage gate). Stale entry from before the agent variant
  // was added. Slice 8 drops the entire Admin section.
  const agentBody = extractConstantBody(layoutSrc, "AGENT_NAV");

  it("AGENT_NAV has exactly 1 group (My Brokerage), 5 items", () => {
    const groups = extractGroupNames(agentBody);
    expect(groups).toEqual(["My Brokerage"]);
    const labels = extractItemLabels(agentBody);
    expect(labels).toEqual([
      "Earnings",
      "My Deals",
      "Listings",
      "Client Onboarding",
      "Leaderboard",
    ]);
  });

  it("AGENT_NAV does NOT include /brokerage/setup (admin onboarding flow)", () => {
    const hrefs = new Set(extractItemHrefs(agentBody));
    expect(hrefs.has("/brokerage/setup")).toBe(false);
  });
});

describe("Slice 8 — Sub-nav Submissions badge wiring", () => {
  // The submitted-count badge is the highest-stakes invariant on this
  // surface. It's the queue-visibility signal that the slice 7 audit
  // identified as the missing piece — without it, John/Kristin miss
  // submissions. Locks: badge map exists, binds the count to the
  // Submissions href, and the href hasn't drifted.

  it("badges map binds submitted count to /brokerage/deal-submissions", () => {
    expect(layoutSrc).toMatch(
      /badges:\s*Record<string,\s*number>\s*=\s*\{[\s\S]{0,200}["']\/brokerage\/deal-submissions["']\s*:\s*submittedCount/,
    );
  });

  it("Submissions item is in ADMIN_NAV's Operations group at href /brokerage/deal-submissions", () => {
    const adminBody = extractConstantBody(layoutSrc, "ADMIN_NAV");
    expect(adminBody).toMatch(
      /group:\s*["']Operations["'][\s\S]{0,500}href:\s*["']\/brokerage\/deal-submissions["'][\s\S]{0,100}label:\s*["']Submissions["']/,
    );
  });
});

describe("Slice 8 — Mobile pill ordering parity", () => {
  // The mobile horizontal pill scroller (md:hidden block in
  // brokerage/layout.tsx) renders the same flattened nav items as the
  // desktop sidebar. This is structural: both call `allItems.map(...)`
  // off the same `nav` constant. If a future edit forks the mobile
  // and desktop renders, drift becomes possible — this contract
  // catches that.

  it("mobile pill scroller iterates allItems flattened from the same nav constant as desktop", () => {
    // Both renders share `allItems = nav.flatMap((g) => g.items)`.
    expect(layoutSrc).toMatch(/const\s+allItems\s*=\s*nav\.flatMap\(\s*\(g\)\s*=>\s*g\.items\s*\)/);
    // Mobile render path uses allItems.map; desktop iterates nav directly.
    // Both sourced from getVisibleNav(role) — the smoke check is that
    // there's no separate mobile constant.
    expect(layoutSrc).not.toMatch(/MOBILE_NAV\s*=/);
    expect(layoutSrc).not.toMatch(/MOBILE_TABS\s*=/);
  });

  it("mobile pill render uses the same allItems variable (no separate flatten)", () => {
    // The md:hidden block must call .map on allItems — anything else
    // means a fork.
    expect(layoutSrc).toMatch(
      /md:hidden[\s\S]{0,800}allItems\.map\(/,
    );
  });
});

describe("Slice 8 — Compliance Dashboard alert wiring", () => {
  // *** THE LOAD-BEARING SAFEGUARD ***
  //
  // Slice 8 took Compliance OUT of the brokerage sub-nav. The Dashboard
  // alert is the only daily-flow surface that flags an expiring NYS
  // license before a manager visits Settings → Compliance. License
  // lapse is a real-world legal risk for the brokerage. If a future
  // edit removes the alert, this test fails so we catch it at PR
  // review, not when a license actually expires.
  //
  // Three contracts here lock the chain end-to-end: import + render +
  // auto-hide guard. Each layer is independently necessary.

  it("dashboard/page.tsx imports ComplianceAlert from ./components/compliance-alert", () => {
    expect(dashboardSrc).toMatch(
      /import\s*\{\s*ComplianceAlert\s*\}\s*from\s*["']\.\/components\/compliance-alert["']/,
    );
  });

  it("dashboard/page.tsx renders <ComplianceAlert ... /> in the JSX", () => {
    expect(dashboardSrc).toMatch(/<ComplianceAlert\s/);
  });

  it("ComplianceAlert auto-hides when count is null or zero (no initial-paint flash)", () => {
    // The double guard — `!count` covers null (loading), `count === 0`
    // covers resolved-but-empty. Without this, the amber callout would
    // flash on every Dashboard load before the count resolves.
    expect(alertSrc).toMatch(/if\s*\(\s*!count\s*\|\|\s*count\s*===\s*0\s*\)\s*return\s+null/);
  });

  it("ComplianceAlert View link propagates ?as_org= when override is active", () => {
    // Override-scope leakage was a recurring class of regression in
    // Phase 1 (slices 0c / 0c2 / 0c3). Locking the conditional path
    // here so super_admin viewing a tenant lands on the tenant's
    // compliance page, not their own.
    expect(alertSrc).toMatch(
      /asOrg\s*\?\s*`\/brokerage\/compliance\?as_org=\$\{asOrg\}`\s*:\s*["']\/brokerage\/compliance["']/,
    );
  });

  it("ComplianceAlert calls getExpiringItems with the 60-day window", () => {
    // Threshold hard-coded with intent (see component comment). If a
    // future edit changes the window without a new slice, this fails
    // so the change is deliberate.
    expect(alertSrc).toMatch(/EXPIRING_WINDOW_DAYS\s*=\s*60/);
    expect(alertSrc).toMatch(/getExpiringItems\(\s*EXPIRING_WINDOW_DAYS\s*,\s*opts\s*\)/);
  });
});

describe("Slice 8 — Settings page hosts the three relocated routes", () => {
  // The brokerage Settings page is the only entry point for Setup,
  // Commission Plans, and Compliance management after slice 8. If any
  // card disappears, the route becomes stranded — reachable only via
  // direct URL, which Gulino won't remember. Locks reachability.

  it.each([
    ["/brokerage/setup", "brokerage-config-setup"],
    ["/brokerage/commission-plans", "brokerage-config-commission-plans"],
    ["/brokerage/compliance", "brokerage-config-compliance"],
  ])("settings page renders a Brokerage Configuration card to %s (testid %s)", (href, testid) => {
    expect(settingsSrc).toMatch(
      new RegExp(`href=["']${href.replace(/\//g, "\\/")}["'][\\s\\S]{0,400}data-testid=["']${testid}["']`),
    );
  });

  it("settings page has a 'Brokerage Configuration' section header", () => {
    expect(settingsSrc).toMatch(/Brokerage Configuration/);
  });
});
