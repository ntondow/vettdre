// Slice Z.2 smoke — pin the Lighthouse CI scaffold shape.
//
// Three structural contracts (static-source assertions, no run):
//   1. package.json scripts contain `lighthouse` keyed to `lhci collect`
//      so future agents can't silently rewire the entrypoint.
//   2. lighthouserc.cjs exists at repo root and configures ≥10 URLs.
//      The contract is "the matrix is set up for 10 priority routes"
//      — counted against the URL strings in the config (whether
//      currently active in `ci.collect.url` or staged for auth-gated
//      future activation in `_allRoutes`/comments).
//   3. docs/handoff/speed-2026-q2-baselines.md contains a "Core Web
//      Vitals baseline" section with ≥10 route × metric rows. Per Q4
//      of pre-approval, TBD rows count — the contract is structural,
//      not "all numbers captured." Future agents who fill in TBD rows
//      don't need to update the smoke.
//
// Loose by design: lhci config internals, the script body, and the
// exact baselines copy can all change without breaking these tests.
// What MUST stay stable: the lighthouse entrypoint, the 10-route
// scope, and the baselines section's existence.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.2 — package.json wires lighthouse + lighthouse:report scripts", () => {
  const pkg = read("package.json");

  it("scripts block contains a `lighthouse` key", () => {
    // Use [\s\S] not the `s` flag — tsconfig target predates ES2018
    // (lesson from Z.1's smoke).
    const scriptsBlock = pkg.match(/"scripts":\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(scriptsBlock).toMatch(/"lighthouse":\s*"[^"]*lhci collect[^"]*"/);
  });

  it("scripts block contains a `lighthouse:report` key for opening the report", () => {
    const scriptsBlock = pkg.match(/"scripts":\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(scriptsBlock).toMatch(/"lighthouse:report":\s*"[^"]+"/);
  });
});

describe("Slice Z.2 — lighthouserc.cjs exists with ≥10 URLs configured", () => {
  const cfgPath = path.join(ROOT, "lighthouserc.cjs");

  it("file exists at repo root", () => {
    expect(fs.existsSync(cfgPath)).toBe(true);
  });

  it("config references ≥10 URL strings shaped like ${baseUrl}/<route>", () => {
    // Pin on the count of `${baseUrl}/...` template strings — captures
    // both the active public-routes list AND the AUTH-GATED priority
    // routes regardless of whether they're currently commented out or
    // staged in a constant. Loose: future agents can rearrange how
    // those 10+ entries are organized as long as the count holds.
    const body = fs.readFileSync(cfgPath, "utf8");
    const urlMatches = body.match(/\$\{baseUrl\}\/[a-zA-Z\-/[\]]+/g) ?? [];
    expect(urlMatches.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Slice Z.2 — baselines doc has a Core Web Vitals section with ≥10 rows", () => {
  const baselinesPath = path.join(ROOT, "docs/handoff/speed-2026-q2-baselines.md");

  it("file still exists (Z.1 deliverable)", () => {
    expect(fs.existsSync(baselinesPath)).toBe(true);
  });

  it("contains a `Core Web Vitals` section header", () => {
    // Match the section header at any heading level (Z.2 appends as
    // ## but future restructure could promote/demote).
    const body = fs.readFileSync(baselinesPath, "utf8");
    expect(body).toMatch(/^#+ .*Core Web Vitals/m);
  });

  it("section contains ≥10 markdown table rows starting with a backticked route path", () => {
    // Pin on the priority-routes table shape (rows like
    // `| \`/dashboard\` | TBD | TBD | ...`). TBD rows count per Q4.
    // This same regex shape is used by Z.1's smoke — future bundle
    // sections + Web Vitals sections can both contribute rows.
    const body = fs.readFileSync(baselinesPath, "utf8");
    const tableRows = body.match(/^\| `\/[^`]+` \|/gm)?.length ?? 0;
    // Z.1 contributed 10 rows; Z.2 contributes 10 more (TBD priority + 3 public).
    // Floor at 20 to ensure Z.2's contribution is present, not just Z.1's.
    expect(tableRows).toBeGreaterThanOrEqual(20);
  });
});
