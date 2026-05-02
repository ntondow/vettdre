// Slice gcloudignore smoke — verify the .gcloudignore file pins the
// critical exclusions that keep `gcloud builds submit` upload size
// bounded, and verify slice 22-as-org-vault is recorded as shipped in
// SLICES.md.
//
// Why pin patterns statically: .gcloudignore is interpreted by gcloud,
// not loaded at runtime. There's no behavior to assert beyond "this
// pattern is present in the file." A future agent who reformats or
// trims the file would silently regress upload size; the contract here
// is the only structural guard.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice gcloudignore — .gcloudignore pins critical exclusions", () => {
  const src = read(".gcloudignore");

  it("excludes the obvious build dependencies (node_modules, .next, .git)", () => {
    expect(src).toMatch(/^node_modules\/$/m);
    expect(src).toMatch(/^\.next\/$/m);
    expect(src).toMatch(/^\.git\/$/m);
  });

  it("excludes the sibling-project working dirs (the dominant size hit)", () => {
    expect(src).toMatch(/^mobile\/$/m);
    expect(src).toMatch(/^NEW LISTINGS PROJECT agents\/$/m);
    expect(src).toMatch(/^_restore\/$/m);
    expect(src).toMatch(/^terminal-handoff\/$/m);
  });

  it("excludes Finder-dupe .ts/.tsx files (~14.8K of them)", () => {
    // Pattern catches "auth-context 100.ts", "page 42.tsx", etc.
    expect(src).toMatch(/^\* \[0-9\]\*\.ts$/m);
    expect(src).toMatch(/^\* \[0-9\]\*\.tsx$/m);
  });

  it("excludes test/coverage artifacts and one-off backups", () => {
    expect(src).toMatch(/^migration-backup-\*\.json$/m);
    expect(src).toMatch(/^coverage\/$/m);
    expect(src).toMatch(/^\*\.log$/m);
  });
});

describe("Slice gcloudignore — slice 22-as-org-vault closed in SLICES.md", () => {
  const src = read("SLICES.md");

  // Scope to the slice 22 section so other slices' status lines can't
  // accidentally satisfy the regex.
  const sliceStart = src.indexOf("### 22-as-org-vault");
  const sliceEnd = src.indexOf("\n### ", sliceStart + 1);
  const slice22 = src.slice(sliceStart, sliceEnd === -1 ? undefined : sliceEnd);

  it("slice 22 entry exists", () => {
    expect(sliceStart).toBeGreaterThan(-1);
  });

  it("slice 22 status flipped to done with PR #44 reference", () => {
    expect(slice22).toMatch(/Status:.*done.*PR #44/);
  });

  it("slice 22 outcome line records build ID + verified-in-prod", () => {
    expect(slice22).toMatch(/PR #44/);
    expect(slice22).toMatch(/build 9c9eb72d/);
    expect(slice22).toMatch(/verif/i); // matches "verified" / "verification"
  });
});
