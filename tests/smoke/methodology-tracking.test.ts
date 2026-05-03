// Slice bms-audit-closeout-followup-methodology-tracking smoke — verify
// docs/methodology/ + audit-roadmap are tracked in git on this branch
// AND the v2.2 methodology bump landed (header pinned, verified-claim
// audit pattern + B-019 worked example present in §6, read/write
// surface bullet present in §9).
//
// Static-source assertions over file content + `git ls-files` checks.
// The contract here is structural: future agents who attempt to
// untrack the methodology tree, revert the v2.2 bump, or remove the
// B-019 worked example trip these tests immediately.

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function isTracked(rel: string): boolean {
  // `git ls-files <path>` prints the path if tracked, empty if not.
  // Trim trailing newline; non-empty result == tracked.
  const out = execSync(`git ls-files -- ${rel}`, {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  return out === rel;
}

describe("Slice methodology-tracking — methodology tree tracked in git", () => {
  it("docs/methodology/slice-based-audit.md is tracked", () => {
    expect(isTracked("docs/methodology/slice-based-audit.md")).toBe(true);
  });
});

describe("Slice methodology-tracking — v2.2 bump landed", () => {
  const methodology = read("docs/methodology/slice-based-audit.md");

  it("header pins v2.2 (not v2.1.1 or earlier)", () => {
    expect(methodology).toMatch(/^# Slice-Based Audit Methodology \(v2\.2\)$/m);
  });

  it("§6 Verified-claim audit pattern + B-019 worked example present", () => {
    expect(methodology).toMatch(/Verified-claim audit pattern/);
    expect(methodology).toMatch(/B-019/);
  });

  it("§9 Read surface ≠ write surface bullet present", () => {
    expect(methodology).toMatch(/Read surface ≠ write surface/);
  });
});

describe("Slice methodology-tracking — audit roadmap tracked + Foundation referenced", () => {
  // The roadmap is the master backlog Nathan wrote post-decision.
  // Tracking it is gate-zero for the Foundation Audit; this contract
  // pins both the tracked-state AND that the tracked content is the
  // right doc (i.e. references the audit's actual name, not a stub).
  it("audit-roadmap-2026-q2-q4.md is tracked", () => {
    expect(isTracked("docs/handoff/audit-roadmap-2026-q2-q4.md")).toBe(true);
  });

  it("audit roadmap references Foundation Audit", () => {
    const roadmap = read("docs/handoff/audit-roadmap-2026-q2-q4.md");
    expect(roadmap).toMatch(/Foundation/);
  });
});
