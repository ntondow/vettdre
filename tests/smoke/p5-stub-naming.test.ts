// Slice slices-stub-naming-cleanup smoke — verify Phase 5 stub naming
// matches the methodology v2.1.1 §8 format `<parent-slice-id>-followup-<short-name>`,
// the `gcloudignore` slice is closed with prod-verified outcome, and the
// new `gcloudignore-followup-further-reduction` stub is filed with all
// methodology fields.
//
// Static-source assertions over SLICES.md content. Phase 5 stubs are
// authored as documentation; the contract here is purely structural —
// pin the naming format so a future agent who files a stub with an
// inconsistent ID trips this test immediately.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const SLICES = read("SLICES.md");

// Extract just the Phase 5 section (everything after the "## Phase 5 —
// Polish backlog" heading). Stop at EOF since Phase 5 is the last section.
function getPhase5Section(): string {
  const start = SLICES.indexOf("## Phase 5 — Polish backlog");
  if (start === -1) throw new Error("Phase 5 section not found");
  return SLICES.slice(start);
}

describe("Slice gcloudignore — closeout outcome line", () => {
  // Scope to the gcloudignore slice section.
  const sliceStart = SLICES.indexOf("### gcloudignore — Augment");
  const sliceEnd = SLICES.indexOf("\n### ", sliceStart + 1);
  const gcloudignore = SLICES.slice(sliceStart, sliceEnd === -1 ? undefined : sliceEnd);

  it("section exists", () => {
    expect(sliceStart).toBeGreaterThan(-1);
  });

  it("status flipped to done with PR #45 reference", () => {
    expect(gcloudignore).toMatch(/Status:.*done.*PR #45/);
  });

  it("outcome line records build ID + reduction figure + PR ref", () => {
    expect(gcloudignore).toMatch(/PR #45/);
    expect(gcloudignore).toMatch(/build 55d8db5e/);
    // Either the percentage or the before/after MiB figures are acceptable
    // proof of the reduction metric.
    expect(gcloudignore).toMatch(/50\.6%|269\.08|132\.88/);
  });
});

describe("Slice gcloudignore-followup-further-reduction — new stub filed", () => {
  const phase5 = getPhase5Section();

  // Backticks optional per methodology template (some IDs render in code
  // formatting, both forms are valid). Anchor with ^ + m flag so we don't
  // match mentions of the stub ID inside paragraph prose elsewhere in the
  // section (e.g. the chore-slice plan-of-record references this ID).
  const stubMatch = phase5.match(
    /^### `?gcloudignore-followup-further-reduction`?[^\n]*\n([\s\S]*?)(?=^### |^## |$(?![\r\n]))/m,
  );

  it("stub header exists", () => {
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

  it("Filed line carries a YYYY-MM-DD date and an attribution", () => {
    expect(stubBody).toMatch(/\*\*Filed:\*\*\s+\d{4}-\d{2}-\d{2}\s+by\s+\S/);
  });
});

describe("Phase 5 stubs — every header matches `<parent-slice-id>-followup-<short-name>`", () => {
  const phase5 = getPhase5Section();

  // Pull every `### <id> — ...` header out of Phase 5. Backticks are
  // allowed (`### `id` — ...`) and discarded for the format check.
  const headerLines = Array.from(phase5.matchAll(/^### (.+?)\s+—\s+/gm)).map(
    (m) => m[1].replace(/^`|`$/g, ""),
  );

  it("Phase 5 section is non-empty (at least 8 stubs after rename pass)", () => {
    // 11 existing renames + 1 new = 12 expected; pin lower bound to catch
    // accidental deletion.
    expect(headerLines.length).toBeGreaterThanOrEqual(8);
  });

  it("every Phase 5 stub matches the methodology format", () => {
    const FORMAT = /^[\w.\-]+-followup-[\w\-]+$/;
    const violations = headerLines.filter((id) => !FORMAT.test(id));
    expect(violations).toEqual([]);
  });

  it("no stub uses the legacy `-fix-followup-` truncated prefix", () => {
    // The pre-rename naming used `-fix-followup-` with a truncated parent
    // ID (e.g. `19-fix-followup-...` for parent `19-B1`). All renames
    // should use the full parent slice ID.
    const violators = headerLines.filter((id) => id.includes("-fix-followup-"));
    expect(violators).toEqual([]);
  });
});
