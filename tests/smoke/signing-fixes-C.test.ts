// Slice 20-fixes-C smoke — public signing flow P1 mobile UX fixes.
//
// Three defects shipped in one PR. Each contract below pins the
// architectural shape of the fix; runtime mobile behavior verification
// (touch events, iOS Safari rendering, viewport quirks) is Nathan's
// post-deploy manual phone test — see PR body for the checklist.
//
// Defects:
//   #8  signature-pad — auto-emit on endStroke (debounced) + onBlur
//        for typed mode. Drop the "Confirm Signature" button and
//        handleConfirm callback. Add aria-live region for screen
//        reader feedback that the button used to provide.
//   #9  pdf-viewer — replace iframe with self-hosted pdfjs render.
//        iOS Safari iframe was silently failing while still firing
//        onLoad → "Reviewed" badge fired without content visible.
//   #13 pdf-field-viewer — minHeight/minWidth conditional: 44px for
//        interactive (non-prefill) fields, 16px for prefill (locked).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 20-fixes-C — public signing flow P1 mobile UX fixes", () => {
  // ── #8: auto-emit signature, drop Confirm button ──────────

  it("#8 signature-pad endStroke listener auto-emits via onSignature (no Confirm button needed)", () => {
    const src = readSource("src/components/onboarding/signature-pad.tsx");

    // The endStroke listener must call onSignature (via the ref) so the
    // parent's fieldValues stays in sync without an explicit Confirm click.
    // The pre-fix listener only updated local hasDrawn state.
    const endStrokeBlock = src.match(
      /pad\.addEventListener\(\s*["']endStroke["'][\s\S]*?\}\s*\)\s*;/,
    );
    expect(
      endStrokeBlock,
      "must declare a pad.addEventListener('endStroke', ...) handler",
    ).not.toBeNull();
    expect(
      endStrokeBlock![0],
      "endStroke handler must call onSignatureRef.current(...) to auto-emit",
    ).toMatch(/onSignatureRef\.current\(/);

    // Debounced — setTimeout inside the handler so we don't spam emit per
    // stroke. The post-stop emit fires once after DRAW_DEBOUNCE_MS.
    expect(
      endStrokeBlock![0],
      "endStroke emit must be debounced (setTimeout)",
    ).toMatch(/setTimeout\(/);
  });

  it("#8 signature-pad typed mode auto-emits on blur and on debounced change", () => {
    const src = readSource("src/components/onboarding/signature-pad.tsx");

    // Blur handler exists and is wired to the typed input.
    expect(
      src,
      "must define a handleTypedBlur callback",
    ).toMatch(/const\s+handleTypedBlur\s*=\s*useCallback/);
    expect(
      src,
      "typed input must wire onBlur={handleTypedBlur}",
    ).toMatch(/onBlur=\{handleTypedBlur\}/);

    // Debounced auto-emit on typed name change — useEffect with a setTimeout.
    // This means the parent gets the rendered signature without a click.
    const typedEffect = src.match(
      /useEffect\(\(\) => \{[\s\S]*?if \(!isTyping[\s\S]*?renderTypedSignature\([\s\S]*?\}\s*,\s*\[/,
    );
    expect(
      typedEffect,
      "must have a useEffect that auto-emits typed signature (debounced)",
    ).not.toBeNull();
  });

  it("#8 signature-pad no longer has a Confirm button or handleConfirm callback", () => {
    const src = readSource("src/components/onboarding/signature-pad.tsx");

    // The handler that fired on Confirm click is gone — auto-emit replaces it.
    // This is the architectural change: no callback, no button to wire it to.
    expect(
      src,
      "handleConfirm callback must be removed (auto-emit replaces it)",
    ).not.toMatch(/handleConfirm/);

    // The Check icon import that the button used is also removed — it was
    // the button's only consumer in this file. Two independent signals
    // (no handleConfirm + no Check import) prove the button is gone
    // without depending on the user-visible label string, which can
    // legitimately appear in JSX comments referring to the historical
    // pattern.
    expect(
      src,
      "Check icon import must be removed (was only used by Confirm button)",
    ).not.toMatch(/import\s*\{[^}]*\bCheck\b[^}]*\}\s*from\s*["']lucide-react["']/);
  });

  it("#8 signature-pad announces capture via aria-live region for screen readers", () => {
    const src = readSource("src/components/onboarding/signature-pad.tsx");

    // The Confirm button used to give screen reader feedback ("Confirm
    // Signature" / "Type your name above"). With the button gone, an
    // aria-live region replaces that affordance — fires when the auto-emit
    // captures the signature.
    expect(
      src,
      "must have an aria-live region replacing the dropped Confirm button feedback",
    ).toMatch(/aria-live=["']polite["']/);
    expect(
      src,
      "aria-live region announces 'Signature captured' on success",
    ).toMatch(/Signature captured/);
  });

  // ── #9: iframe → pdfjs render ─────────────────────────────

  it("#9 pdf-viewer no longer uses <iframe> — uses pdfjs render path instead", () => {
    const src = readSource("src/components/onboarding/pdf-viewer.tsx");

    // iframe was the bug — silent failures on iOS Safari while onLoad
    // still fired, so the IntersectionObserver-based "Reviewed" badge
    // would mark the doc as reviewed when nothing was actually visible.
    // Regex matches JSX form `<iframe ` or `<iframe\n` (whitespace after
    // the tag name, indicating real element); historical references in
    // JS comments use `<iframe>` which doesn't match this pattern.
    expect(
      src,
      "must not contain <iframe in JSX form — pdfjs render replaces it",
    ).not.toMatch(/<iframe[\s/]/);

    // Same self-hosted worker path as pdf-field-viewer (slice 20-fixes-A).
    expect(
      src,
      "must import pdfjs-dist for client-side rendering",
    ).toMatch(/import\(\s*["']pdfjs-dist["']\s*\)/);
    expect(
      src,
      "must reference self-hosted pdfjs worker (NOT cdn.jsdelivr.net)",
    ).toMatch(/workerSrc\s*=\s*["']\/pdfjs\/pdf\.worker\.min\.mjs["']/);
    expect(src, "must NOT reference jsdelivr CDN").not.toMatch(/jsdelivr/);

    // pdfjs's getDocument call mirrors the pdf-field-viewer pattern.
    expect(
      src,
      "must call pdfjsLib.getDocument({ url: pdfUrl, ... })",
    ).toMatch(/getDocument\(\s*\{\s*url:\s*pdfUrl/);
  });

  it("#9 pdf-viewer preserves Reviewed badge + Download link + IntersectionObserver UX", () => {
    const src = readSource("src/components/onboarding/pdf-viewer.tsx");

    // The Reviewed badge UX is intentional — preserved from the iframe era.
    expect(src, "Reviewed badge must still render").toMatch(/Reviewed/);

    // The 3-second view delay is preserved.
    expect(
      src,
      "VIEW_DELAY_MS constant must remain (3000ms)",
    ).toMatch(/VIEW_DELAY_MS\s*=\s*3000/);

    // IntersectionObserver pattern preserved — but anchored to the rendered
    // images container, not to a (now non-existent) iframe wrapper.
    expect(
      src,
      "IntersectionObserver-based view tracking must still be present",
    ).toMatch(/new\s+IntersectionObserver\(/);

    // Download PDF link still exists for users who want the file.
    expect(
      src,
      "Download PDF link must still render",
    ).toMatch(/Download PDF/);
  });

  // ── #13: 44px hit area for interactive fields ─────────────

  it("#13 pdf-field-viewer field overlays use 44px hit area for interactive (non-prefill, non-signature) fields", () => {
    const src = readSource("src/components/onboarding/pdf-field-viewer.tsx");

    // The conditional must distinguish prefill (read-only, locked) from
    // interactive. Prefill stays at 16px because it's never tapped;
    // bumping all fields to 44px would cause overlap on dense forms.
    //
    // Slice 19-fix-tra-sig-height added an OUTER signature ternary that
    // wraps the prefill ternary: signatures get 24px (WCAG 2.5.8 AA) not
    // 44px (WCAG 2.5.5 AAA / iOS HIG) because tapping a signature opens a
    // full-screen pad — the inline overlay just needs to be tappable, not
    // the actual signing surface. The regex tolerates that wrapping
    // ternary while still pinning the prefill ? "16px" : "44px" branch
    // for everything that ISN'T a signature.
    expect(
      src,
      "minHeight must keep the prefill ? '16px' : '44px' branch for non-signature interactive fields",
    ).toMatch(
      /minHeight:\s*(?:field\.type\s*===\s*["']signature["']\s*\?\s*["']\d+px["']\s*:\s*\(?\s*)?field\.prefillKey\s*\?\s*["']16px["']\s*:\s*["']44px["']/,
    );
    expect(
      src,
      "minWidth must keep the prefill ? '16px' : '44px' branch for non-signature interactive fields",
    ).toMatch(
      /minWidth:\s*(?:field\.type\s*===\s*["']signature["']\s*\?\s*["']\d+px["']\s*:\s*\(?\s*)?field\.prefillKey\s*\?\s*["']16px["']\s*:\s*["']44px["']/,
    );

    // The unconditional 16px from the pre-fix code must be gone.
    expect(
      src,
      "old unconditional 16px minHeight must be removed",
    ).not.toMatch(/minHeight:\s*["']16px["']\s*,\s*\n\s*minWidth:\s*["']16px["']/);
  });
});
