// Slice 19-B2a smoke — vault editor multi-page navigation.
//
// Surfaces the editor wiring for templates with more than one page:
// page tabs, currentPage-scoped render + filter, currentPage-aware
// new-field placement, variable per-page canvas size derived from the
// pdfjs viewport, and a Page selector in the field editor sidebar so
// users can reassign fields between pages without delete + re-place.
//
// Drag/resize on rendered overlays is B2b (separate slice). Cross-page
// drag is intentionally NOT supported — fields clamp at page boundaries
// (see 19-fix-followup-cross-page-move Phase 5 stub for the rationale).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = fs.readFileSync(
  path.join(ROOT, "src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx"),
  "utf8",
);

describe("slice 19-B2a — vault editor multi-page navigation", () => {
  // ── currentPage state + page tab strip ────────────────────

  it("declares currentPage state defaulting to 0", () => {
    // Default-0 keeps single-page templates working without behavior
    // change — they read pages[0] either way.
    expect(
      SRC,
      "must declare currentPage state with default 0",
    ).toMatch(/useState\(\s*0\s*\)/);
    expect(
      SRC,
      "must name the setter setCurrentPage",
    ).toMatch(/\[\s*currentPage\s*,\s*setCurrentPage\s*\]/);
  });

  it("page tab strip renders only when pages.length > 1 (no clutter on single-page)", () => {
    // The strip is gated on pages.length > 1 so a single-page template
    // doesn't get a no-op tab. Lives outside the canvas div so tab
    // clicks don't trigger handlePdfClick.
    const conditional = SRC.match(
      /\{pages\.length\s*>\s*1\s*&&\s*\([\s\S]*?Page \{i \+ 1\}/,
    );
    expect(
      conditional,
      "must render page tab strip inside `pages.length > 1 && (...)` block with 'Page {i + 1}' label",
    ).not.toBeNull();
  });

  // ── Render + filter scoped to currentPage ─────────────────

  it("rendered image src binds to pages[currentPage], not pages[0]", () => {
    // Pre-B2a: hardcoded pages[0]. Post-B2a: currentPage-driven so
    // switching tabs swaps the displayed page.
    expect(
      SRC,
      "img src must reference pages[currentPage].dataUrl",
    ).toMatch(/src=\{\s*pages\[currentPage\]\.dataUrl\s*\}/);
    expect(
      SRC,
      "img src must NOT reference pages[0].dataUrl (regression guard)",
    ).not.toMatch(/src=\{\s*pages\[0\]\.dataUrl\s*\}/);
  });

  it("field overlay filter scopes to the current page, not page 0", () => {
    // The pre-B2a filter `f.page === 0` made pages 2+ unusable. Post-B2a
    // it's currentPage-driven.
    expect(
      SRC,
      "field overlay filter must use f.page === currentPage",
    ).toMatch(/fields\.filter\(\s*\(f\)\s*=>\s*f\.page\s*===\s*currentPage\s*\)/);
    expect(
      SRC,
      "field overlay filter must NOT hardcode f.page === 0 (regression guard)",
    ).not.toMatch(/fields\.filter\(\s*\(f\)\s*=>\s*f\.page\s*===\s*0\s*\)/);
  });

  // ── New-field placement uses currentPage ──────────────────

  it("handlePdfClick + addField write page: currentPage on new fields", () => {
    // Both new-field paths (click-to-place via handlePdfClick, programmatic
    // via addField) must write currentPage so a field placed while looking
    // at page 2 lands on page 2, not page 0.
    const handlePdfClick = SRC.match(/const\s+handlePdfClick\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(handlePdfClick, "must define handlePdfClick callback").not.toBeNull();
    expect(
      handlePdfClick![0],
      "handlePdfClick must write page: currentPage on new field",
    ).toMatch(/page:\s*currentPage/);

    const addField = SRC.match(/const\s+addField\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(addField, "must define addField callback").not.toBeNull();
    expect(
      addField![0],
      "addField must write page: currentPage on new field",
    ).toMatch(/page:\s*currentPage/);

    // Hardcoded `page: 0` in either callback would mean future placements
    // silently land on page 1 regardless of which tab is active.
    expect(
      handlePdfClick![0],
      "handlePdfClick must NOT hardcode page: 0",
    ).not.toMatch(/page:\s*0\b/);
    expect(
      addField![0],
      "addField must NOT hardcode page: 0",
    ).not.toMatch(/page:\s*0\b/);
  });

  // ── Variable per-page canvas size ─────────────────────────

  it("canvas container size derives from pages[currentPage] viewport, not hardcoded 612x792", () => {
    // pdfjs gives us per-page width/height at 2x retina; display at half.
    // The pre-B2a hardcoded 612px (US Letter portrait at 1x) misaligned
    // legal/A4/landscape PDFs.
    expect(
      SRC,
      "container style must derive width from pages[currentPage].width / 2",
    ).toMatch(/width:\s*`\$\{pages\[currentPage\]\.width\s*\/\s*2\}px`/);
    expect(
      SRC,
      "container style must derive minHeight from pages[currentPage].height / 2",
    ).toMatch(/minHeight:\s*`\$\{pages\[currentPage\]\.height\s*\/\s*2\}px`/);
  });

  // ── Page selector in field editor sidebar ─────────────────

  it("field editor sidebar contains a Page selector bound to selectedField.page (multi-page only)", () => {
    // Critical UX recovery — without this, a field placed on the wrong
    // page has no fix short of delete + re-place. The selector lives
    // alongside the existing Type/Prefill controls and updates field.page
    // via updateField. Hidden on single-page templates (pages.length > 1
    // gate) to avoid a no-op control.
    const pageSelectorBlock = SRC.match(
      /\{pages\.length\s*>\s*1\s*&&\s*\([\s\S]*?Page[\s\S]*?<select[\s\S]*?value=\{selectedField\.page\}[\s\S]*?onChange[\s\S]*?updateField\(\s*selectedField\.id\s*,\s*\{\s*page:[\s\S]*?\}\s*\)\s*\}/,
    );
    expect(
      pageSelectorBlock,
      "field editor must include a <select> bound to selectedField.page that updates via updateField",
    ).not.toBeNull();
  });
});
