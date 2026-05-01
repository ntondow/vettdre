// Slice 20-fixes-B smoke — public signing flow P1 fixes.
//
// Four defects shipped in one PR. Each contract below pins one fix
// against regression. Source-level static assertions only — these
// fixes touch DOM event handlers (orientation change), browser-only
// storage (sessionStorage), and Prisma transaction internals, none of
// which simulate cleanly under happy-dom without testing the mock.
//
// Defects:
//   #6  signature-pad — snapshot before resize-clear, rehydrate after
//   #7  client.tsx — sessionStorage draft per (token, docId), restore
//        on mount, debounced write, clear on success, self-heal corrupt
//   #10 sign route — idempotent sign via two-level CAS:
//        document update with status: { not: "signed" }
//        onboarding completion via updateMany with allDocsSigned: false
//        wonRace boolean gates the post-completion fire-and-forget
//   #12 sign route — fail-fast 503 if PDF upload fails, BEFORE
//        the database transaction marks the doc signed

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 20-fixes-B — public signing flow P1 fixes", () => {
  // ── #6: signature snapshot/restore on resize ──────────────

  it("#6 signature-pad resize handler snapshots before clear and rehydrates after", () => {
    const src = readSource("src/components/onboarding/signature-pad.tsx");

    // Find the body of the `resize` arrow function. It must contain a
    // `toDataURL()` snapshot capture BEFORE the `pad.clear()` call, and a
    // `fromDataURL(...)` rehydrate AFTER. We extract just the resize body
    // so the assertion is local to the right function.
    const resizeMatch = src.match(/const resize = \(\) => \{([\s\S]*?)\n    \};/);
    expect(resizeMatch, "must declare a `resize` arrow function").not.toBeNull();
    const body = resizeMatch![1];

    const snapshotIdx = body.search(/toDataURL\s*\(\s*\)/);
    const clearIdx = body.search(/pad\.clear\s*\(\s*\)/);
    const restoreIdx = body.search(/fromDataURL\s*\(/);

    expect(
      snapshotIdx,
      "resize must call pad.toDataURL() to snapshot in-progress signatures",
    ).toBeGreaterThan(-1);
    expect(clearIdx, "resize must call pad.clear() to reset canvas dimensions").toBeGreaterThan(
      -1,
    );
    expect(
      restoreIdx,
      "resize must call pad.fromDataURL(...) to rehydrate after clear",
    ).toBeGreaterThan(-1);

    expect(
      snapshotIdx,
      "snapshot (toDataURL) must come BEFORE clear",
    ).toBeLessThan(clearIdx);
    expect(
      restoreIdx,
      "rehydrate (fromDataURL) must come AFTER clear",
    ).toBeGreaterThan(clearIdx);
  });

  // ── #7: sessionStorage draft persistence ──────────────────

  it("#7 client.tsx persists fieldValues to sessionStorage with per-doc key", () => {
    const src = readSource("src/app/sign/[token]/client.tsx");

    // Per-doc key shape — token + docId so two different signing flows in
    // the same browser tab don't cross-contaminate.
    expect(
      src,
      "must define a draftKey helper keyed by token + docId",
    ).toMatch(
      /vettdre:signing-draft:\$\{token\}:\$\{docId\}/,
    );

    // Read on mount.
    expect(
      src,
      "must read draft from sessionStorage on doc mount",
    ).toMatch(/sessionStorage\.getItem\(/);

    // Write on change (debounced).
    expect(
      src,
      "must write draft to sessionStorage on fieldValues change",
    ).toMatch(/sessionStorage\.setItem\(/);

    // Debounce — the write must be inside a setTimeout that's cleared on cleanup.
    const writeBlock = src.match(
      /useEffect\(\(\) => \{[\s\S]*?sessionStorage\.setItem\([\s\S]*?return \(\) => clearTimeout\([\s\S]*?\}\s*,\s*\[/,
    );
    expect(
      writeBlock,
      "sessionStorage write must be debounced (setTimeout + cleanup)",
    ).not.toBeNull();

    // Clear on successful sign.
    expect(
      src,
      "must remove draft from sessionStorage on successful sign",
    ).toMatch(/sessionStorage\.removeItem\(draftKey/);

    // SSR guard — typeof window check before sessionStorage access. Required
    // because "use client" components still SSR during initial render.
    expect(
      src,
      "must guard sessionStorage access with typeof window check",
    ).toMatch(/typeof window\s*!==?\s*["']undefined["']/);
  });

  it("#7 corrupt draft self-heals — JSON parse catch removes the bad entry", () => {
    const src = readSource("src/app/sign/[token]/client.tsx");

    // The catch block around JSON.parse must call sessionStorage.removeItem
    // — otherwise a corrupt draft persists across every refresh.
    // Match: try { ... JSON.parse(stored) ... } catch { ... sessionStorage.removeItem(...) ... }
    const tryCatchPattern =
      /try\s*\{[\s\S]*?JSON\.parse\(stored\)[\s\S]*?\}\s*catch\s*\{[\s\S]*?sessionStorage\.removeItem\([\s\S]*?\}/;
    expect(
      src,
      "JSON.parse catch block must call sessionStorage.removeItem to self-heal corrupt drafts",
    ).toMatch(tryCatchPattern);
  });

  // ── #10: idempotent sign (two-level CAS) ──────────────────

  it("#10 sign route document update uses idempotent updateMany with status guard", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // The pre-fix shape was a plain `update` against a single id, which
    // races on double-click. The fix uses `updateMany` so a count of 0
    // means another transaction won — clean idempotent semantics.
    const docGuardPattern =
      /tx\.onboardingDocument\.updateMany\(\s*\{\s*where:\s*\{\s*id:\s*documentId\s*,\s*status:\s*\{\s*not:\s*["']signed["']\s*\}\s*\}/;
    expect(
      src,
      "document update must use updateMany with status: { not: 'signed' } guard",
    ).toMatch(docGuardPattern);

    // The transaction must check the count and bail with `already_signed`.
    expect(
      src,
      "transaction must check docUpdate.count === 0 and bail with already_signed",
    ).toMatch(/docUpdate\.count\s*===\s*0[\s\S]*?kind:\s*["']already_signed["']/);

    // Outer handler must surface the bail as a 409 — clean retry semantics.
    expect(
      src,
      "must return 409 for already_signed result",
    ).toMatch(
      /txResult\.kind\s*===\s*["']already_signed["'][\s\S]*?status:\s*409/,
    );
  });

  it("#10 sign route onboarding completion uses CAS via updateMany on allDocsSigned", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // Atomic compare-and-swap: only one transaction can flip allDocsSigned
    // false → true. Pre-fix used findMany().every() + update(), which races.
    const casPattern =
      /tx\.clientOnboarding\.updateMany\(\s*\{\s*where:\s*\{\s*id:\s*onboarding\.id\s*,\s*allDocsSigned:\s*false\s*\}/;
    expect(
      src,
      "onboarding completion must use updateMany with allDocsSigned: false guard",
    ).toMatch(casPattern);

    // The CAS result count gates whether this transaction "won" the race.
    expect(
      src,
      "must compute completionWonRace from cas.count === 1",
    ).toMatch(/completionWonRace\s*=\s*cas\.count\s*===\s*1/);
  });

  it("#10 post-completion workflow fires only when this transaction won the race", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // The outer if-guard for runPostCompletionWorkflow must include
    // completionWonRace — without this the second concurrent transaction
    // would also fire the workflow → duplicate Contact + FileAttachments.
    expect(
      src,
      "runPostCompletionWorkflow guard must include completionWonRace",
    ).toMatch(
      /if\s*\([\s\S]*?completionWonRace[\s\S]*?\)\s*\{[\s\S]*?runPostCompletionWorkflow/,
    );

    // Fire-and-forget pattern — must NOT await; must use .catch for error
    // logging. The response shouldn't block on background work.
    expect(
      src,
      "post-completion must be fire-and-forget — .catch, not await",
    ).toMatch(
      /runPostCompletionWorkflow\([\s\S]*?\)\.catch\(/,
    );
    // Defensive: the literal `await runPostCompletionWorkflow(` should be gone.
    expect(
      src,
      "post-completion must not be awaited (fire-and-forget intentional)",
    ).not.toMatch(/await\s+runPostCompletionWorkflow\(/);
  });

  // ── #12: fail-fast on PDF upload error ────────────────────

  it("#12 sign route returns 503 if PDF processing fails, BEFORE the transaction", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // Track failure with an explicit boolean, not a swallowed try/catch.
    expect(
      src,
      "must declare pdfProcessingFailed flag",
    ).toMatch(/let\s+pdfProcessingFailed\s*=\s*false/);

    // 503 return for the fail-fast case.
    expect(
      src,
      "must return 503 when pdfProcessingFailed",
    ).toMatch(
      /if\s*\(\s*pdfProcessingFailed\s*\)\s*\{[\s\S]*?status:\s*503/,
    );

    // CRITICAL: the 503 return must come BEFORE prisma.$transaction. If it
    // came after, the doc would be marked signed in DB despite the failed
    // PDF — the bug we're fixing.
    const failCheckIdx = src.search(
      /if\s*\(\s*pdfProcessingFailed\s*\)/,
    );
    const txIdx = src.search(/prisma\.\$transaction\(/);
    expect(failCheckIdx, "pdfProcessingFailed check must exist").toBeGreaterThan(-1);
    expect(txIdx, "prisma.$transaction call must exist").toBeGreaterThan(-1);
    expect(
      failCheckIdx,
      "pdfProcessingFailed 503 return must come BEFORE prisma.$transaction (otherwise doc gets marked signed despite failed PDF)",
    ).toBeLessThan(txIdx);

    // The pre-fix swallowed catch comment is gone — was a load-bearing comment
    // in the old code that future readers might restore. Belt-and-suspenders
    // assertion; remove this contract if the comment is ever legitimately
    // needed for a different reason.
    expect(
      src,
      "old swallowed-catch comment must be gone (was the bug's anchor)",
    ).not.toMatch(/Continue — the signing status update is more important than the PDF/);
  });
});
