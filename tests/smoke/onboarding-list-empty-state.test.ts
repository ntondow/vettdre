// Slice 18 smoke — onboarding list empty state + B-019 regression guards.
//
// Source-level assertions only (same pattern as 7a + 17 — the page is a
// client component with effects + actions; mounting under happy-dom would
// require mocking the entire server runtime).
//
// Two concerns covered:
//
//   U-071 — empty state must differentiate the filter-narrowed branch from
//           the slate-zero branch. On a status tab with 0 records, don't
//           push "Invite your first client" — point at the All tab instead.
//
//   B-019 — same URL → different data. Already closed by slice 0c2 (commit
//           772c897 threaded ?as_org through 12 BMS client pages). These
//           assertions lock in the threading invariants for the LIST page
//           specifically — the existing override-scoping smoke covers the
//           ACTION layer + DETAIL pages but not list pages. Without these
//           guards, a future edit could remove `overrideOpts` from a single
//           callsite and re-introduce the cross-tenant leak.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 18 — Onboarding list empty state + B-019 regression (U-071)", () => {
  const pageSrc = readSource(
    "src/app/(dashboard)/brokerage/client-onboarding/page.tsx",
  );

  // ── U-071: filter-aware empty state ─────────────────────────────────

  it("(U-071a) empty-state branch differentiates filter-narrowed vs slate-zero via statusFilter", () => {
    // The empty render must inspect statusFilter to choose between the two
    // branches. Without this conditional, a manager on the Pending tab with
    // 0 pending records sees "Invite your first client" even when 5 records
    // exist on other tabs — same misleading copy the audit flagged.
    expect(pageSrc).toMatch(
      /onboardings\.length\s*===\s*0\s*\?\s*[\s\S]{0,1000}statusFilter\s*!==\s*["']{2}/,
    );
  });

  it("(U-071b) filter-narrowed empty state has NO 'New Client Onboarding' CTA", () => {
    // The filter-narrowed branch (testid: onboarding-empty-filtered) must
    // not include the Link to /new — pushing a manager to invite a new
    // client when 5 records already exist on other tabs is wrong UX. The
    // CTA only belongs in the slate-zero branch.
    const filteredBranch = pageSrc.match(
      /data-testid=["']onboarding-empty-filtered["'][\s\S]*?(?=data-testid=["']onboarding-empty-zero["']|<\/div>\s*\)\s*:\s*\()/,
    );
    expect(filteredBranch).not.toBeNull();
    expect(filteredBranch?.[0]).not.toMatch(/href=["']\/brokerage\/client-onboarding\/new["']/);
  });

  it("(U-071c) slate-zero branch keeps the CTA", () => {
    // Conversely, the slate-zero branch (testid: onboarding-empty-zero) must
    // still have the New Client Onboarding link — that's the point of the
    // empty state when there genuinely are no records.
    const zeroBranch = pageSrc.match(
      /data-testid=["']onboarding-empty-zero["'][\s\S]*?(?=<\/div>\s*\)\s*\)\s*:|<\/div>\s*\}\s*\))/,
    );
    expect(zeroBranch).not.toBeNull();
    expect(zeroBranch?.[0]).toMatch(/href=["']\/brokerage\/client-onboarding\/new["']/);
  });

  it("(U-071d) filter-narrowed copy points to the All tab (action-oriented)", () => {
    // Per Nathan's copy review on the slice 18 proposal: "Try the All tab
    // to see everything." — one sentence, action-oriented, no jargon.
    expect(pageSrc).toMatch(/Try the All tab to see everything/);
  });

  // ── B-019 regression guards ──────────────────────────────────────────

  it("(B-019a) page reads as_org from useSearchParams and computes overrideOpts", () => {
    // Slice 0c2 wired this. Locking it in: a future edit removing the read
    // would silently reintroduce the cross-tenant leak from the audit.
    expect(pageSrc).toMatch(
      /import\s*\{[^}]*useSearchParams[^}]*\}\s*from\s*["']next\/navigation["']/,
    );
    expect(pageSrc).toMatch(/sp\.get\(["']as_org["']\)/);
    expect(pageSrc).toMatch(/overrideOpts\s*=\s*useMemo/);
  });

  it("(B-019b) fetchData useCallback deps include overrideOpts so URL changes re-trigger fetch", () => {
    // The URL→refetch trigger is the load-bearing part of slice 0c2 for the
    // LIST page. Without overrideOpts in the dep array, switching ?as_org
    // wouldn't re-run fetchData — the page would keep showing the previous
    // tenant's data until the user manually reloaded. Match anchors at the
    // declaration (`const fetchData = useCallback`) and finds the closing
    // dep array containing overrideOpts before any other `const ` declaration.
    expect(pageSrc).toMatch(
      /const\s+fetchData\s*=\s*useCallback\([\s\S]{0,2000}\},\s*\[\s*overrideOpts\s*\]\s*\)/,
    );
  });

  it("(B-019c) all four mutation handlers thread overrideOpts into their action calls", () => {
    // resendOnboarding, voidOnboarding, deleteOnboarding, archiveOnboarding
    // each take options as their trailing argument. If any one drops
    // overrideOpts, that mutation will silently target the home-org record
    // instead of the override target — a B-019-class regression on writes.
    expect(pageSrc).toMatch(/resendOnboarding\(\s*[a-zA-Z]+,\s*overrideOpts\s*\)/);
    expect(pageSrc).toMatch(/voidOnboarding\(\s*[a-zA-Z]+,\s*[a-zA-Z]+,\s*overrideOpts\s*\)/);
    expect(pageSrc).toMatch(/deleteOnboarding\(\s*[a-zA-Z]+,\s*overrideOpts\s*\)/);
    expect(pageSrc).toMatch(/archiveOnboarding\(\s*[a-zA-Z]+,\s*overrideOpts\s*\)/);
  });

  it("(B-019d) initial fetch passes overrideOpts (locks in the read-side of 0c2)", () => {
    // getOnboardings must be called with overrideOpts on both the first
    // attempt AND the slice-14 retry. Anything less re-introduces the
    // "9 records on first load, 0 on reload" symptom from the audit.
    const getOnboardingsCalls = pageSrc.match(/getOnboardings\([^)]*\)/g) ?? [];
    expect(getOnboardingsCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of getOnboardingsCalls) {
      expect(call).toMatch(/overrideOpts/);
    }
  });
});
