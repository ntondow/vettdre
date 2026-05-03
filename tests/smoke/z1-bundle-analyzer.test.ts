// Slice Z.1 smoke — pin the bundle-analyzer scaffold shape.
//
// Three structural contracts (static-source assertions, no build):
//   1. package.json scripts contain `analyze` keyed to `ANALYZE=true`
//      so future agents can't silently rename or rewire the entrypoint.
//   2. next.config.ts wires withBundleAnalyzer behind `ANALYZE` env
//      so the analyzer is opt-in (and Sentry remains the outermost wrap).
//   3. docs/handoff/speed-2026-q2-baselines.md exists and lists at
//      least 10 priority-route table rows — a loose proxy for "the
//      top-10 route table is still present."
//
// Loose by design: the script body, the analyzer wrapper internals, and
// the exact baselines copy can all change without breaking these tests.
// What MUST stay stable: the analyze entrypoint, the env-flag gate, and
// the existence of the baselines artifact with its priority-route table.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.1 — package.json wires the analyze script behind ANALYZE=true", () => {
  const pkg = read("package.json");

  it("scripts block contains an `analyze` key", () => {
    expect(pkg).toMatch(/"analyze":\s*"[^"]+"/);
  });

  it("the analyze script sets ANALYZE=true (env-flag gate)", () => {
    // Loose: allows `ANALYZE=true next build --webpack`, `cross-env ANALYZE=true ...`,
    // or any future wrapper that still threads ANALYZE=true through.
    // Use [\s\S] instead of `s` flag — tsconfig target predates ES2018.
    const scriptsBlock = pkg.match(/"scripts":\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(scriptsBlock).toMatch(/"analyze":\s*"[^"]*ANALYZE=true[^"]*"/);
  });
});

describe("Slice Z.1 — next.config.ts wraps with @next/bundle-analyzer behind ANALYZE", () => {
  const cfg = read("next.config.ts");

  it("imports / references the bundle analyzer wrapper", () => {
    expect(cfg).toMatch(/withBundleAnalyzer/);
  });

  it("gates the analyzer on process.env.ANALYZE", () => {
    expect(cfg).toMatch(/process\.env\.ANALYZE/);
  });
});

describe("Slice Z.1 — baselines doc exists and lists ≥10 priority routes", () => {
  const baselinesPath = path.join(ROOT, "docs/handoff/speed-2026-q2-baselines.md");

  it("file exists at the documented path", () => {
    expect(fs.existsSync(baselinesPath)).toBe(true);
  });

  it("contains ≥10 markdown table rows starting with a backticked route path", () => {
    // Pins on the priority-routes table shape (rows like `| \`/dashboard\` | ... |`).
    // Future edits can swap which 10 routes are listed, change column counts, or add
    // notes — but at least 10 route rows must remain documented.
    const body = fs.readFileSync(baselinesPath, "utf8");
    const tableRows = body.match(/^\| `\/[^`]+` \|/gm)?.length ?? 0;
    expect(tableRows).toBeGreaterThanOrEqual(10);
  });
});
