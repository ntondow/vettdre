// Slice 20-fixes-A smoke — public signing flow P0 fixes.
//
// Five defects collapsed in one PR. Each contract below pins one fix
// against regression. Source-level static assertions only — the signing
// flow has deep deps (Prisma, Supabase Storage, pdfjs runtime worker)
// that would test the mock more than the code under happy-dom.
//
// Defects:
//   #1  signature guard — sign route must NOT call .slice on undefined
//   #2  per-doc download links — completion screen renders one link per
//        signed doc with explicit ?docType=
//   #3  verify returns 200 (not 410) for completed onboardings
//   #4  no false "emailed to you" claim on completion screen
//   #5  pdf-field-viewer uses self-hosted /pdfjs/ worker, not jsdelivr CDN

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 20-fixes-A — public signing flow P0 fixes", () => {
  // ── #1: signature guard ────────────────────────────────────

  it("#1 sign route guards signatureData against undefined signatureImage", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // The unguarded form was: signatureData: signatureImage.slice(0, 100) + "..."
    // Crashes 500 when template has no signature fields → sigImage is undefined.
    // The fix uses a ternary guard.
    expect(
      src,
      "signatureData line must not call .slice() unconditionally on signatureImage",
    ).not.toMatch(/signatureData:\s*signatureImage\.slice\(/);

    // Positive: ternary or null/undefined guard around .slice()
    expect(
      src,
      "signatureData line must guard against undefined signatureImage",
    ).toMatch(
      /signatureData:\s*signatureImage\s*\?\s*signatureImage\.slice\(0,\s*100\)/,
    );
  });

  // ── #2: per-doc download links ────────────────────────────

  it("#2 SigningComplete renders one download link per signed doc with explicit ?docType=", () => {
    const src = readSource("src/components/onboarding/signing-complete.tsx");

    // The old shape passed a single downloadUrl prop and rendered one
    // "Download Your Copies" button that hit the no-docType path (which
    // returns JSON, not a PDF). The fix renders the documents list as
    // links, each with ?docType=...
    expect(
      src,
      "SigningComplete must build per-doc download URLs with ?docType=",
    ).toMatch(/href=\{`\/api\/onboarding\/\$\{token\}\/download\?docType=/);

    // The single-button "Download Your Copies" path should be gone.
    expect(
      src,
      "old single 'Download Your Copies' button (no docType) must not be present",
    ).not.toMatch(/href=\{downloadUrl\}/);

    // The component must accept `token` (used to build per-doc URLs) and
    // each doc must carry docType so the link can target the right file.
    expect(src, "Props must include token: string").toMatch(/token:\s*string/);
    expect(src, "SignedDoc must include docType: string").toMatch(
      /docType:\s*string/,
    );

    // Cross-check the consumer: client.tsx passes token + docType through.
    const consumer = readSource("src/app/sign/[token]/client.tsx");
    expect(
      consumer,
      "client.tsx /complete branch must pass token to SigningComplete",
    ).toMatch(/<SigningComplete[\s\S]*?token=\{token\}/);
    expect(
      consumer,
      "client.tsx must include docType in each doc passed to SigningComplete",
    ).toMatch(/docType:\s*d\.docType/);
  });

  // ── #3: verify returns 200 for completed ──────────────────

  it("#3 verify route does NOT 410 on completed status", () => {
    const src = readSource("src/app/api/onboarding/[token]/verify/route.ts");

    // The pre-fix form short-circuited completed onboardings with a 410:
    //   if (onboarding.status === "completed") {
    //     return NextResponse.json({ error: "..." }, { status: 410 });
    //   }
    // That made the client.tsx already_complete branch unreachable.
    //
    // After the fix, completed onboardings return 200 with the normal
    // payload (incl. onboardingStatus) so the client can route to the
    // already_complete branch and offer downloads.

    // Allow the variable name `onboarding`, but disallow a status-completed
    // check that returns a 410. We grep for the structural shape.
    const completedBranch =
      /if\s*\(\s*onboarding\.status\s*===\s*"completed"\s*\)\s*\{[\s\S]*?status:\s*410/;
    expect(
      src,
      "verify route must not 410 on completed status (already_complete branch must be reachable)",
    ).not.toMatch(completedBranch);

    // Voided remains a 410 (cancelled is genuinely an error case).
    expect(src, "voided status remains a 410").toMatch(
      /onboarding\.status\s*===\s*"voided"[\s\S]*?status:\s*410/,
    );
  });

  it("#3 client.tsx routes 200+completed payload to already_complete branch", () => {
    const src = readSource("src/app/sign/[token]/client.tsx");

    // The verify success handler must check onboardingStatus === "completed"
    // and route to the already_complete step.
    expect(
      src,
      "client must route completed onboardings to already_complete step",
    ).toMatch(
      /onboardingStatus\s*===\s*"completed"[\s\S]*?setStep\("already_complete"\)/,
    );

    // The already_complete branch must render per-doc download links too —
    // not just the old generic single-link form.
    expect(
      src,
      "already_complete branch must render per-doc download links",
    ).toMatch(
      /step\s*===\s*"already_complete"[\s\S]*?\/api\/onboarding\/\$\{token\}\/download\?docType=/,
    );
  });

  // ── #4: no false "emailed to you" claim ───────────────────

  it("#4 SigningComplete does not falsely claim docs were emailed to the client", () => {
    const src = readSource("src/components/onboarding/signing-complete.tsx");

    // The old footer line read: "A copy of all signed documents has been
    // emailed to you for your records." But no client-facing email is ever
    // sent — only the agent gets a notification. That false claim has legal/
    // trust risk and was removed.
    //
    // Regex is intentionally loose to catch any rephrasing that still implies
    // an email was sent: "emailed", "email has been sent", "sent to your email".
    expect(
      src,
      "must not claim documents were emailed to the client",
    ).not.toMatch(/emailed to you/i);
    expect(src, "must not claim a copy was emailed").not.toMatch(
      /copy\s+(?:of\s+(?:all\s+)?(?:signed\s+)?documents?\s+)?has been emailed/i,
    );
    expect(src, "must not say 'sent to your email'").not.toMatch(
      /sent to your email/i,
    );

    // Positive: the honest replacement copy mentions the agent will follow
    // up. Loose regex — wording can shift, but "follow" + "next steps" is
    // the contract Nathan approved.
    expect(
      src,
      "must include honest follow-up copy mentioning next steps",
    ).toMatch(/next steps/i);
  });

  // ── #5: self-hosted pdfjs worker ──────────────────────────

  it("#5 pdf-field-viewer uses self-hosted /pdfjs/ paths, not jsdelivr CDN", () => {
    const src = readSource(
      "src/components/onboarding/pdf-field-viewer.tsx",
    );

    // External CDN dependency is gone — corp networks, CSP, and offline
    // clients should still be able to render the PDF preview.
    expect(
      src,
      "workerSrc must not point to cdn.jsdelivr.net",
    ).not.toMatch(/cdn\.jsdelivr\.net/);
    expect(src, "cMapUrl must not point to cdn.jsdelivr.net").not.toMatch(
      /jsdelivr/,
    );

    // Positive: local paths.
    expect(src, "workerSrc must reference /pdfjs/pdf.worker.min.mjs").toMatch(
      /workerSrc\s*=\s*["']\/pdfjs\/pdf\.worker\.min\.mjs["']/,
    );
    expect(src, "cMapUrl must reference /pdfjs/cmaps/").toMatch(
      /cMapUrl:\s*["']\/pdfjs\/cmaps\/["']/,
    );
  });

  it("#5 self-hosted pdfjs assets exist in public/pdfjs/", () => {
    const workerPath = path.join(ROOT, "public/pdfjs/pdf.worker.min.mjs");
    expect(
      fs.existsSync(workerPath),
      "public/pdfjs/pdf.worker.min.mjs must exist (self-hosted worker)",
    ).toBe(true);

    const cmapsDir = path.join(ROOT, "public/pdfjs/cmaps");
    expect(
      fs.existsSync(cmapsDir) && fs.statSync(cmapsDir).isDirectory(),
      "public/pdfjs/cmaps/ must exist (cmaps for non-Latin scripts)",
    ).toBe(true);

    // Sanity: at least one cmap file present.
    const cmapFiles = fs.readdirSync(cmapsDir).filter((f) => f.endsWith(".bcmap"));
    expect(
      cmapFiles.length,
      "cmaps directory must contain at least one .bcmap file",
    ).toBeGreaterThan(0);
  });
});
