// Phase 0 prep smoke — pin Phase Z gate close + swarm template widening.
//
// Three structural contracts (static-source assertions, no runtime):
//   1. POSITIVE: Phase 0 swarm prompt template contains "VERTICAL SLICE
//      MODE" section header. This is the new default mode (one agent
//      per area covering perf + functional + UX + a11y + RBAC) that
//      replaces dimension-themed mode (one agent per area-dimension
//      pair). Without this section, the template is back to its old
//      LEGACY-only shape and the next-agent picking up Phase 0 will
//      spawn 4× the agent runs for the same surface coverage.
//   2. POSITIVE: SLICES-speed.md contains the "Phase Z — Gate (signed
//      off ...)" header. This is the marker that Phase Z is closed and
//      Phase 0 swarm can open. Without it, future agents reading the
//      ledger top-to-bottom can't tell whether Phase Z is still open.
//   3. POSITIVE: Z.5 status is `done` AND its outcome line cites BOTH
//      PR #56 AND build SHA `2cd4a3b6`. The status flip is the
//      cross-slice flip pattern's closing event for Phase Z; the PR +
//      build SHA in the outcome line make Phase Z's deploy traceable
//      months from now (e.g. when somebody reads "what changed between
//      Z.5 ship and the first regression?").
//
// Loose by design: phase-0-prep entry placement, exact gate-checklist
// item count, vertical-slice-mode worded definition can all evolve
// without breaking these tests. What MUST stay stable: the template
// has a VERTICAL SLICE MODE section, Phase Z gate is signed off in the
// ledger, and Z.5's outcome line carries traceable deploy refs.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Phase 0 prep — swarm template gains VERTICAL SLICE MODE section", () => {
  const template = read("docs/methodology/templates/phase-0-swarm-prompt.md");

  it("template contains 'VERTICAL SLICE MODE' section header", () => {
    // Loose pin: matches the literal phrase regardless of header level
    // (## or ### — the doc may reorganize). The phrase itself is the
    // contract.
    expect(template).toMatch(/VERTICAL SLICE MODE/);
  });
});

describe("Phase 0 prep — SLICES-speed.md gate header signals Phase Z close", () => {
  const ledger = read("SLICES-speed.md");

  it("contains 'Phase Z — Gate (signed off ...)' header", () => {
    // Loose pin on the date so the header can be re-dated if needed
    // without breaking the contract; tight pin on the structural
    // marker "Phase Z — Gate (signed off".
    expect(ledger).toMatch(/## Phase Z — Gate \(signed off/);
  });
});

describe("Phase 0 prep — Z.5 done flip with traceable deploy refs", () => {
  const ledger = read("SLICES-speed.md");

  it("Z.5 status is `done` AND outcome cites PR #56 + build 2cd4a3b6", () => {
    // Extract the Z.5 section: from "### Z.5 —" up to (but not
    // including) the next "### " heading or end-of-file. The pin
    // asserts on three signals within that section: status `done`,
    // "PR #56", and "build 2cd4a3b6". Done as one extracted-section
    // assertion so a bug like "moved Z.5 outcome line into a different
    // slice's section" can't pass spuriously. Note: we deliberately
    // do NOT use `\n## ` as a boundary because Z.5's body contains a
    // nested `## Plan of record` heading; the next `### ` is the next
    // slice and is the correct stop signal.
    const z5Match = ledger.match(/### Z\.5 —[\s\S]*?(?=\n### |$)/);
    expect(z5Match).not.toBeNull();
    const z5Section = z5Match![0];
    expect(z5Section).toMatch(/\*\*Status:\*\*\s+`done`/);
    expect(z5Section).toMatch(/PR #56/);
    expect(z5Section).toMatch(/build 2cd4a3b6/);
  });
});
