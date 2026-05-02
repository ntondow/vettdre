// Slice 19-B2b smoke — vault editor field drag/resize via Pointer Events.
//
// Builds on B2A's multi-page navigation. After this slice, placed fields
// can be moved by dragging the field body and resized via 4 corner handles
// rendered on the selected field. Pointer Events API unifies mouse +
// touch + pen so iPad Safari "just works" — touch-action: none on
// draggable elements prevents iOS from intercepting the gesture for
// native scroll/pinch.
//
// Cross-page drag is intentionally NOT supported (filed as Phase 5 stub
// 19-fix-followup-cross-page-move). Keyboard arrow-key precision moves
// also deferred (filed as 19-fix-followup-keyboard-nudge).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = fs.readFileSync(
  path.join(ROOT, "src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx"),
  "utf8",
);

describe("slice 19-B2b — vault editor field drag/resize via Pointer Events", () => {
  // ── Drag wiring ───────────────────────────────────────────

  it("field overlay has onPointerDown handler wired to handleFieldPointerDown", () => {
    // The field overlay is the drag target. onPointerDown initializes
    // dragState; onPointerMove updates field.x/y; onPointerUp clears.
    expect(
      SRC,
      "field overlay must wire onPointerDown to handleFieldPointerDown",
    ).toMatch(/onPointerDown=\{\s*\(e\)\s*=>\s*handleFieldPointerDown\(e\s*,\s*field\.id\s*\)\s*\}/);
  });

  it("handleFieldPointerDown calls setPointerCapture (load-bearing for cross-element drag)", () => {
    // Without setPointerCapture, a fast drag toward the canvas edge
    // drops frames once the cursor leaves the field. This is mandatory
    // for usable drag UX.
    const handler = SRC.match(/const\s+handleFieldPointerDown\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(handler, "must define handleFieldPointerDown callback").not.toBeNull();
    expect(
      handler![0],
      "handleFieldPointerDown must call setPointerCapture(e.pointerId)",
    ).toMatch(/setPointerCapture\(\s*e\.pointerId\s*\)/);
  });

  // ── Touch-action ──────────────────────────────────────────

  it("field overlay AND resize handles have touch-action: none style", () => {
    // iOS Safari intercepts touch sequences as native scroll/pinch
    // unless touch-action: none is explicitly set on the element. This
    // applies BOTH to the field body (drag) AND to the resize handles
    // (resize). Canvas itself is intentionally not touch-action: none —
    // we want pinch-zoom on the canvas between fields.
    //
    // The contract counts occurrences of `touchAction: "none"` in the
    // file and requires at least 2 (one for field overlay, one shared
    // by all resize handles via a single style spread).
    const matches = SRC.match(/touchAction:\s*["']none["']/g);
    expect(
      matches,
      "must have touchAction: 'none' on field overlay AND on resize handles (>= 2 occurrences)",
    ).not.toBeNull();
    expect(
      matches!.length,
      "touchAction: 'none' must appear at least twice (field + handles)",
    ).toBeGreaterThanOrEqual(2);
  });

  // ── Boundary clamping ─────────────────────────────────────

  it("drag boundary clamp uses 100 - field.width / 100 - field.height (page-agnostic)", () => {
    // The clamp formula must constrain newX to [0, 100 - field.width]
    // and newY to [0, 100 - field.height]. This works for any page size
    // because we're operating in normalized 0..100 percentage space.
    // No hardcoded pages[0] reference — the math is page-agnostic by
    // construction.
    const moveHandler = SRC.match(/const\s+handleFieldPointerMove\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(moveHandler, "must define handleFieldPointerMove callback").not.toBeNull();

    expect(
      moveHandler![0],
      "drag move handler must clamp newX with Math.min(..., 100 - field.width)",
    ).toMatch(/Math\.min\([^,]+,\s*100\s*-\s*field\.width\s*\)/);
    expect(
      moveHandler![0],
      "drag move handler must clamp newY with Math.min(..., 100 - field.height)",
    ).toMatch(/Math\.min\([^,]+,\s*100\s*-\s*field\.height\s*\)/);

    // Negative pin: drag math must NOT reference pages[0] (the pre-B2A
    // hardcoded-first-page bug pattern).
    expect(
      moveHandler![0],
      "drag move handler must NOT reference pages[0] (regression guard)",
    ).not.toMatch(/pages\[0\]/);
  });

  // ── Resize handles ────────────────────────────────────────

  it("4 resize handles render only when selectedFieldId === field.id", () => {
    // Handles appear on the selected field only — keeps the canvas
    // visually clean when nothing is selected and during placement
    // mode. The map renders "nw" | "ne" | "sw" | "se" tuples.
    expect(
      SRC,
      "must gate resize handles on selectedFieldId === field.id",
    ).toMatch(/selectedFieldId\s*===\s*field\.id\s*&&[\s\S]*?\(\["nw"\s*,\s*"ne"\s*,\s*"sw"\s*,\s*"se"\]\s*as const\)\.map/);

    // Each rendered handle wires onPointerDown to handleResizePointerDown
    // with the corner identifier.
    expect(
      SRC,
      "each resize handle must wire onPointerDown(e, field.id, corner) to handleResizePointerDown",
    ).toMatch(/onPointerDown=\{\s*\(e\)\s*=>\s*handleResizePointerDown\(e\s*,\s*field\.id\s*,\s*corner\s*\)\s*\}/);
  });

  // ── Min size constants ────────────────────────────────────

  it("MIN_FIELD_WIDTH and MIN_FIELD_HEIGHT constants are declared (3% × 2%)", () => {
    // Constants live at module scope so the resize math references them
    // by name (vs magic numbers scattered across the four corner cases).
    // 3% × 2% renders as ≈18 × 16px on US Letter — small enough for
    // tight forms but big enough to remain visible after a deliberate
    // shrink. Pixel-tap-target concerns evaporate because handles
    // always render on the selected field.
    expect(
      SRC,
      "must declare MIN_FIELD_WIDTH constant",
    ).toMatch(/const\s+MIN_FIELD_WIDTH\s*=\s*3\b/);
    expect(
      SRC,
      "must declare MIN_FIELD_HEIGHT constant",
    ).toMatch(/const\s+MIN_FIELD_HEIGHT\s*=\s*2\b/);

    // Resize math must use these constants (not inline magic numbers).
    const resizeMove = SRC.match(/const\s+handleResizePointerMove\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(resizeMove, "must define handleResizePointerMove").not.toBeNull();
    expect(
      resizeMove![0],
      "resize math must reference MIN_FIELD_WIDTH",
    ).toMatch(/MIN_FIELD_WIDTH/);
    expect(
      resizeMove![0],
      "resize math must reference MIN_FIELD_HEIGHT",
    ).toMatch(/MIN_FIELD_HEIGHT/);
  });

  // ── State integrity ──────────────────────────────────────

  it("drag and resize commit through updateField (no direct DOM mutation)", () => {
    // updateField routes through setFields, which is the canonical
    // state path. Direct DOM mutation (e.g. element.style.left = ...)
    // would lose the change on next render and break the save path.
    const dragMove = SRC.match(/const\s+handleFieldPointerMove\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(dragMove, "must define handleFieldPointerMove").not.toBeNull();
    expect(
      dragMove![0],
      "drag move must call updateField (commit through React state)",
    ).toMatch(/updateField\(/);

    const resizeMove = SRC.match(/const\s+handleResizePointerMove\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/);
    expect(
      resizeMove![0],
      "resize move must call updateField",
    ).toMatch(/updateField\(/);

    // Negative: no direct style.left/top/width/height mutation.
    expect(
      SRC,
      "must NOT mutate DOM .style.left/top/width/height directly",
    ).not.toMatch(/\.style\.(left|top|width|height)\s*=/);
  });

  // ── Pointer Events as the only path ──────────────────────

  it("field overlay and resize handles use ONLY Pointer Events (no onMouseDown)", () => {
    // Pointer Events unify mouse + touch + pen. Adding a parallel
    // onMouseDown would silently break iPad (mouse handlers don't fire
    // for touch on iOS Safari). This negative pin locks Pointer Events
    // as the only path so a future copy-paste from Stack Overflow
    // doesn't regress the iPad story.
    //
    // Regex matches the JSX prop form `onMouseDown={` — it does NOT
    // match comments referring to mouse events historically (those
    // don't have the `={` shape).
    expect(
      SRC,
      "must NOT use onMouseDown prop anywhere — Pointer Events are the only path",
    ).not.toMatch(/onMouseDown=\{/);
  });
});
