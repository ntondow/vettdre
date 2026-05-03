// Slice bms-audit-closeout smoke — verify the BMS Overhaul audit
// closeout artifacts are in place: new stub for the createOnboarding
// cross-tenant write bug surfaced during Item 4; archived audit and
// closeout docs at expected paths; retrospective written with all
// required sections.
//
// Static-source assertions over file system + SLICES-bms.md (renamed
// from SLICES.md in slice Z.6) + retrospective
// content. The closeout is doc-only; no behavior to assert. The
// contract here is that the artifacts EXIST at the right paths and
// contain the right structure.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("Slice bms-audit-closeout — new stub `22-followup-as-org-onboarding-create`", () => {
  const slices = read("SLICES-bms.md");

  // Scope to the stub section. Backticks optional per methodology format.
  // Anchor with ^ to avoid matching paragraph-prose mentions of the ID
  // elsewhere (the chore-slice plan-of-record references this stub ID
  // in its Files list).
  const stubMatch = slices.match(
    /^### `?22-followup-as-org-onboarding-create`?[^\n]*\n([\s\S]*?)(?=^### |^## |$(?![\r\n]))/m,
  );

  it("stub header exists in Phase 5 section", () => {
    expect(stubMatch).not.toBeNull();
  });

  const stubBody = stubMatch?.[1] ?? "";

  it("contains all 5 methodology fields", () => {
    expect(stubBody).toMatch(/\*\*Status:\*\*/);
    expect(stubBody).toMatch(/\*\*Background:\*\*/);
    expect(stubBody).toMatch(/\*\*Why deferred:\*\*/);
    expect(stubBody).toMatch(/\*\*Required input before slicing:\*\*/);
    expect(stubBody).toMatch(/\*\*Affected surfaces:\*\*/);
    expect(stubBody).toMatch(/\*\*Filed:\*\*/);
  });

  it("Required input enumerates the 3 options approved by Nathan", () => {
    expect(stubBody).toMatch(/Option \(a\)/);
    expect(stubBody).toMatch(/Option \(b\)/);
    expect(stubBody).toMatch(/Option \(c\)/);
  });

  it("references B-019 history (verified-claim mistake)", () => {
    expect(stubBody).toMatch(/B-019/);
    expect(stubBody).toMatch(/0c2/);
  });
});

describe("Slice bms-audit-closeout — archive moves complete", () => {
  it("audit doc moved to archive path", () => {
    expect(exists("docs/handoff/archive/bms-audit-2026-04-28.md")).toBe(true);
  });

  it("closeout doc moved to archive path", () => {
    expect(exists("docs/handoff/archive/bms-closeout-2026-05-02.md")).toBe(true);
  });

  it("audit doc no longer at original path", () => {
    expect(exists("docs/handoff/bms-audit-2026-04-28.md")).toBe(false);
  });

  it("closeout doc no longer at original path", () => {
    expect(exists("docs/handoff/bms-closeout-2026-05-02.md")).toBe(false);
  });
});

describe("Slice bms-audit-closeout — retrospective is real", () => {
  const RETRO = "docs/handoff/bms-overhaul-retrospective-2026-05-02.md";

  it("file exists at expected path", () => {
    expect(exists(RETRO)).toBe(true);
  });

  const retro = exists(RETRO) ? read(RETRO) : "";

  it("contains all required section headers", () => {
    expect(retro).toMatch(/^## Audit summary/m);
    expect(retro).toMatch(/^## What worked/m);
    expect(retro).toMatch(/^## What didn't/m);
    expect(retro).toMatch(/^## What to change/m);
    expect(retro).toMatch(/^## Carryover/m);
  });

  it("references B-019 worked example explicitly (the most valuable retro finding)", () => {
    expect(retro).toMatch(/B-019/);
  });

  it("meets the 80-line floor (≥80 lines, not boilerplate)", () => {
    const lines = retro.split(/\r?\n/).length;
    expect(lines).toBeGreaterThanOrEqual(80);
  });

  it("notes the methodology v2.2 deferral (untracked-methodology finding)", () => {
    // This is the meta-finding — surfaced during the slice and called
    // out explicitly in the retro so future agents see it.
    expect(retro).toMatch(/v2\.2/);
    expect(retro).toMatch(/(deferred|untracked)/i);
  });
});
