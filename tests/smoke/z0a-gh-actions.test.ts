// Slice Z.0a smoke — verify the GitHub Actions CI workflow shape:
// the workflow file exists at the expected path, names all 4 required
// jobs (typecheck, lint, test, build) — the stable contract for branch
// protection — runs on both pull_request AND push, and pins Node 20
// to match the production Dockerfile.
//
// Static-source assertions over the YAML file content. The contract
// here is structural — pin the workflow shape so a future agent who
// renames a job (breaking branch protection) or forgets the push
// trigger (missing direct-merge coverage) trips this immediately.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const WORKFLOW = ".github/workflows/ci.yml";

describe("Slice Z.0a — GitHub Actions CI workflow exists with all 4 jobs", () => {
  it("workflow file exists at .github/workflows/ci.yml", () => {
    expect(fs.existsSync(path.join(ROOT, WORKFLOW))).toBe(true);
  });

  // Each job ID is a stable contract for GitHub branch protection rules
  // (Settings → Branches → Required status checks). Renaming any of these
  // breaks branch protection silently — pin the names here so a rename
  // shows up as a smoke-test failure instead.
  const requiredJobs = ["typecheck", "lint", "test", "build"];
  const ci = read(WORKFLOW);

  for (const job of requiredJobs) {
    it(`names the \`${job}\` job (branch protection contract)`, () => {
      // Match `<job-id>:` at the start of a line with optional indent.
      // The job ID lives at 2-space indent under `jobs:`; pin loosely
      // to allow future indent reformatting without breaking the test.
      const re = new RegExp(`^\\s*${job}:\\s*$`, "m");
      expect(ci).toMatch(re);
    });
  }
});

describe("Slice Z.0a — workflow runs on both pull_request and push", () => {
  const ci = read(WORKFLOW);

  it("includes pull_request trigger", () => {
    // Catches direct-merges from PR flow (the normal path).
    expect(ci).toMatch(/^\s*pull_request:\s*$/m);
  });

  it("includes push trigger", () => {
    // Catches direct-to-main commits (hotfixes, force-pushed merges).
    // PR-only would miss these — having both ensures every commit on
    // main is verified.
    expect(ci).toMatch(/^\s*push:\s*$/m);
  });
});

describe("Slice Z.0a — Node version matches production Dockerfile", () => {
  const ci = read(WORKFLOW);

  it("uses node-version 20 (matches FROM node:20-alpine)", () => {
    // Pin Node 20 specifically. If we bump the Dockerfile to Node 22,
    // we must bump CI in lockstep — this contract surfaces drift.
    expect(ci).toMatch(/node-version:\s*['"]?20['"]?/);
  });
});
