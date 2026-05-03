// Slice Z.6 smoke — verify the per-audit ledger split landed cleanly:
// top-level SLICES.md is now an index (not BMS content), SLICES-bms.md
// retains the BMS audit-closed gate header (rename preserved content),
// and SLICES-speed.md has all 8 Phase Z entries pre-filed.
//
// Static-source assertions over file contents. The contract here is
// structural — pin the split so a future agent who accidentally
// merges audit content back into the index, or removes a Phase Z
// entry, trips this immediately.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.6 — top-level SLICES.md is an audit ledger index", () => {
  const index = read("SLICES.md");

  it("contains the index header (not the old BMS title)", () => {
    expect(index).toMatch(/Audit Ledger Index/);
  });

  it("references both SLICES-bms.md and SLICES-speed.md", () => {
    expect(index).toMatch(/SLICES-bms\.md/);
    expect(index).toMatch(/SLICES-speed\.md/);
  });
});

describe("Slice Z.6 — SLICES-bms.md preserves BMS audit content", () => {
  const bms = read("SLICES-bms.md");

  it("retains the audit-closed gate header (rename preserved content)", () => {
    // Gate header was added in PR #47 (slice bms-audit-closeout).
    // Pinning it here ensures a future agent who edits SLICES-bms.md
    // doesn't accidentally remove or rewrite the closeout signal.
    expect(bms).toMatch(/BMS Overhaul — Audit Closed/);
  });
});

describe("Slice Z.6 — SLICES-speed.md has all 8 Phase Z entries", () => {
  const speed = read("SLICES-speed.md");

  // Pin one regex per entry so a future agent who deletes an entry —
  // or files Z.0a's plan-of-record into the wrong file — trips
  // immediately with a specific error message.
  const entries = ["Z.0a", "Z.0b", "Z.1", "Z.2", "Z.3", "Z.4", "Z.5", "Z.6"];

  for (const entry of entries) {
    it(`contains entry header for ${entry}`, () => {
      // Match `### Z.X — ...` headers anchored to the start of a line
      // so we don't accidentally match inline prose mentions.
      const escaped = entry.replace(".", "\\.");
      const re = new RegExp(`^### ${escaped} — `, "m");
      expect(speed).toMatch(re);
    });
  }
});

describe("Slice Z.6 — top-level SLICES.md does NOT accumulate audit content", () => {
  // Negative contract — the index is metadata-only. Catches future
  // drift where someone appends a Phase 5 stub or BMS gate header to
  // the index by mistake.
  const index = read("SLICES.md");

  it("does not reference slice 22-as-org-vault (BMS audit content)", () => {
    expect(index).not.toMatch(/22-as-org-vault/);
  });

  it("does not reference gcloudignore slice (BMS audit content)", () => {
    expect(index).not.toMatch(/gcloudignore/);
  });

  it("does not contain the BMS audit-closed gate header", () => {
    expect(index).not.toMatch(/BMS Overhaul — Audit Closed/);
  });
});
