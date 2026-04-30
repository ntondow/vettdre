// Slice 4 smoke — manager dashboard rebuild + slice 5 (screening drop)
// rolled in.
//
// Source-level assertions only. The page is a client component fanning
// out to several Prisma-backed actions; mounting it under happy-dom
// would require mocking the entire server runtime. The contracts that
// matter are structural — what the page renders, what it doesn't, and
// which actions back it.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 4 — Manager dashboard rebuild", () => {
  const pageSrc = readSource(
    "src/app/(dashboard)/brokerage/dashboard/page.tsx",
  );

  it("(a) page reuses slice 1.5 getSubmittedCount via PrimaryCtaStrip", () => {
    // The CTA strip imports the existing slice 1.5 action — slice 4
    // does NOT introduce a parallel pending-count action.
    const ctaSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/primary-cta-strip.tsx",
    );
    expect(ctaSrc).toMatch(
      /import\s*\{[^}]*getSubmittedCount[^}]*\}\s*from\s*["']\.\.\/\.\.\/deal-submissions\/actions["']/,
    );
    // And the page wires PrimaryCtaStrip in.
    expect(pageSrc).toMatch(
      /import\s*\{[^}]*PrimaryCtaStrip[^}]*\}\s*from\s*["']\.\/components\/primary-cta-strip["']/,
    );
    expect(pageSrc).toMatch(/<PrimaryCtaStrip\b/);
  });

  it("(b) page does NOT import getScreeningDashboardStats (slice 5 closure / U-010)", () => {
    // Slice 5 (rolled into slice 4) removes the screening KPI strip
    // from BMS dashboard. The action was deleted from the dashboard's
    // actions.ts as part of this slice.
    expect(pageSrc).not.toMatch(/getScreeningDashboardStats/);
    const actionsSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/actions.ts",
    );
    expect(actionsSrc).not.toMatch(/getScreeningDashboardStats/);
  });

  it("(c) no <StatCard> instances + no Financial Overview panel (closes U-006 + U-007)", () => {
    // The pre-rewrite page rendered ≥7 <StatCard> components and a
    // distinct "Financial Overview" panel that duplicated the top KPI
    // strip. Both are gone — the new KPI surface lives entirely in the
    // KpiStrip component (which uses its own KpiCard subcomponent, not
    // the legacy StatCard).
    expect(pageSrc).not.toMatch(/<StatCard\b/);
    expect(pageSrc).not.toMatch(/Financial Overview/);
    // The KpiStrip mounts exactly once.
    const kpiStripMatches = pageSrc.match(/<KpiStrip\b/g) || [];
    expect(kpiStripMatches.length).toBe(1);
  });

  it("(d) page wires the four slice 4 panels + greeting source", () => {
    // Required panels per the approved wireframe.
    expect(pageSrc).toMatch(/<KpiStrip\b/);
    expect(pageSrc).toMatch(/<TasksPanel\b/);
    expect(pageSrc).toMatch(/<TopPerformersPanel\b/);
    expect(pageSrc).toMatch(/<ActiveTransactionsPanel\b/);
    // Greeting source is the override-aware getDashboardHeader, which
    // returns the *real* user name even under ?as_org= (slice 4
    // addition B).
    expect(pageSrc).toMatch(/getDashboardHeader\b/);
    // Period selector keeps the toggle + adds an explicit date-range
    // subtitle (closes U-009).
    expect(pageSrc).toMatch(/periodSubtitle\(/);
  });

  it("getKpiComparison + getTodaysTasksForManager exported with override threading", () => {
    const actionsSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/actions.ts",
    );
    expect(actionsSrc).toMatch(
      /^export\s+async\s+function\s+getKpiComparison\b/m,
    );
    expect(actionsSrc).toMatch(
      /^export\s+async\s+function\s+getTodaysTasksForManager\b/m,
    );
    expect(actionsSrc).toMatch(
      /^export\s+async\s+function\s+getDashboardHeader\b/m,
    );
    // Each new action takes overrideAsOrg in its options arg.
    expect(actionsSrc).toMatch(
      /getKpiComparison\([\s\S]*?options:\s*\{\s*overrideAsOrg\?:\s*string\s*\}/,
    );
    expect(actionsSrc).toMatch(
      /getTodaysTasksForManager\([\s\S]*?options:\s*\{\s*overrideAsOrg\?:\s*string\s*\}/,
    );
    expect(actionsSrc).toMatch(
      /getDashboardHeader\([\s\S]*?options:\s*\{\s*overrideAsOrg\?:\s*string\s*\}/,
    );
  });

  it("each panel manages its own loading/error/retry state (slice 4 addition A)", () => {
    // Independent fetch surfaces — a slow query in one panel cannot
    // hang the others. Guard the existence of the per-panel loading +
    // error testid hooks the panel-shell renders.
    const ctaSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/primary-cta-strip.tsx",
    );
    const kpiSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/kpi-strip.tsx",
    );
    const tasksSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/tasks-panel.tsx",
    );
    const performersSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/top-performers-panel.tsx",
    );
    const activeSrc = readSource(
      "src/app/(dashboard)/brokerage/dashboard/components/active-transactions-panel.tsx",
    );

    // Each component owns its `status` state machine + a setTick
    // retry. Source-level guard: each file declares both.
    for (const [name, src] of [
      ["primary-cta-strip", ctaSrc],
      ["kpi-strip", kpiSrc],
      ["tasks-panel", tasksSrc],
      ["top-performers-panel", performersSrc],
      ["active-transactions-panel", activeSrc],
    ] as const) {
      expect(src, `${name} owns a status state`).toMatch(
        /useState<["']loading["']\s*\|\s*["']ready["']/,
      );
      expect(src, `${name} owns a retry tick`).toMatch(/setTick/);
    }
  });
});
