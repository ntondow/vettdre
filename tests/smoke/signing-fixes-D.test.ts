// Slice 20-fixes-D smoke — public signing flow P2 polish.
//
// Final pass on the slice 20 audit. Each contract pins the architectural
// shape of the fix so a later refactor can't silently regress it. Runtime
// mobile/network behavior is covered by Nathan's post-deploy checklist.
//
// Defects (10 of 11 from P2 — #23 dropped, see SLICES.md):
//   #14  verify route — fire-and-forget the expired-cache update so the
//        GET response isn't blocked on a write.
//   #15  sign route — cap audit-log fieldValues at 500 chars to bound JSON
//        growth. Image data URLs are filtered out entirely.
//   #16  verify route — return 410 (not 404) for token-not-found. Removes
//        the enumeration vector that distinguished invalid vs voided.
//   #17  sign route — derive signerName/signerEmail from the canonical
//        onboarding record post-lookup; never trust the request body.
//   #18  client.tsx — progress bar uses (docIndex + 0.5) midpoint math so
//        the bar moves *while* signing the current doc, not just on flip.
//   #19  client.tsx — clear focusedFieldId when switching to the next doc;
//        otherwise stale focus state leaks across docs.
//   #20  pdf-viewer + pdf-field-viewer — per-page render progress in the
//        loading UI ("Loading page X of N...") so slow mobile users see
//        motion instead of a static "Loading..." string.
//   #21  pdf-viewer + pdf-field-viewer — Retry button on render error so
//        a transient network blip doesn't strand the user.
//   #22  sign route — signedPath keys by doc.id, not docType, so two docs
//        with the same custom docType in one onboarding don't collide.
//   #24  sign route — server-side date override before embedFieldValues:
//        any field with prefillKey "date" gets stamped with the actual
//        signing time. The embedded PDF is the legal artifact, not the
//        client preview.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 20-fixes-D — public signing flow P2 polish", () => {
  // ── #14: fire-and-forget expired-cache update ─────────────

  it("#14 verify route fires the expired status update without awaiting", () => {
    const src = readSource("src/app/api/onboarding/[token]/verify/route.ts");

    // The expired-cache update must NOT be awaited — that would block the
    // GET response on a write. Pattern is `prisma...update({...}).catch(...)`.
    expect(
      src,
      "expired update must use .catch (fire-and-forget), not await",
    ).toMatch(
      /prisma\.clientOnboarding\s*\n?\s*\.update\(\s*\{[\s\S]*?status:\s*["']expired["'][\s\S]*?\}\s*\)\s*\.catch\(/,
    );
  });

  it("#14 sign route also fires-and-forgets the expired status update", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // Same pattern in the sign route — both endpoints check expiration.
    expect(
      src,
      "sign route expired update must also use .catch, not await",
    ).toMatch(
      /prisma\.clientOnboarding\s*\n?\s*\.update\(\s*\{[\s\S]*?status:\s*["']expired["'][\s\S]*?\}\s*\)\s*\.catch\(/,
    );
  });

  // ── #15: cap audit-log fieldValues at 500 chars ───────────

  it("#15 sign route truncates audit-log fieldValues to 500 chars and filters images", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // The audit log metadata must filter data: image URLs out entirely
    // (signature blobs are huge) AND cap remaining text at 500 chars.
    expect(
      src,
      "audit log must filter values starting with data:image",
    ).toMatch(/!v\.startsWith\(\s*["']data:image["']\s*\)/);
    expect(
      src,
      "audit log must truncate text fieldValues at 500 chars",
    ).toMatch(/v\.length\s*>\s*500\s*\?\s*v\.slice\(\s*0\s*,\s*500\s*\)/);
  });

  // ── #16: 410 for token-not-found ─────────────────────────

  it("#16 verify route returns 410 (not 404) for an invalid token", () => {
    const src = readSource("src/app/api/onboarding/[token]/verify/route.ts");

    // The not-found branch must return 410, matching the voided/expired
    // shape — removes the enumeration vector. Pre-fix code returned 404.
    const notFoundBlock = src.match(
      /if \(\s*!onboarding\s*\)\s*\{[\s\S]*?status:\s*\d+[\s\S]*?\}\s*\)/,
    );
    expect(
      notFoundBlock,
      "must guard with `if (!onboarding)` and return JSON with a status code",
    ).not.toBeNull();
    expect(
      notFoundBlock![0],
      "not-found branch must return status 410, not 404",
    ).toMatch(/status:\s*410/);
    expect(
      notFoundBlock![0],
      "not-found branch must NOT return 404 (enumeration vector)",
    ).not.toMatch(/status:\s*404/);
  });

  // ── #17: server-derived signer identity ─────────────────────

  it("#17 sign route derives signerName/signerEmail from the onboarding record, not the body", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // The destructuring must NOT bind signerName/signerEmail from the body
    // (typed as `string` in the destructure). Body fields are still allowed
    // in the type for client back-compat but ignored at read time.
    // Anchor on `documentId` to find the right destructure (other `const {`
    // statements in the file would confuse a generic match).
    const destructure = src.match(
      /const\s*\{\s*documentId([^}]*)\}\s*=\s*body\s+as\s+\{/,
    );
    expect(
      destructure,
      "must destructure documentId from body",
    ).not.toBeNull();
    const destructured = destructure![1];
    expect(
      destructured,
      "signerName must NOT be destructured from body (server derives it)",
    ).not.toMatch(/\bsignerName\b/);
    expect(
      destructured,
      "signerEmail must NOT be destructured from body (server derives it)",
    ).not.toMatch(/\bsignerEmail\b/);

    // After the onboarding lookup, signerName must be derived from the
    // first/last name on the canonical record. Single source of truth.
    expect(
      src,
      "signerName must be derived from onboarding.clientFirstName/clientLastName",
    ).toMatch(
      /const\s+signerName\s*=\s*`\$\{onboarding\.clientFirstName\}\s+\$\{onboarding\.clientLastName\}`/,
    );
    expect(
      src,
      "signerEmail must be derived from onboarding.clientEmail",
    ).toMatch(/const\s+signerEmail\s*=\s*onboarding\.clientEmail/);
  });

  // ── #18: midpoint progress math ─────────────────────────────

  it("#18 client uses midpoint progress math so the bar moves while signing", () => {
    const src = readSource("src/app/sign/[token]/client.tsx");

    // Pre-fix: progressPct = (docIndex / totalDocs) * 100. The bar only
    // moved on doc flip. Post-fix: (docIndex + 0.5) so the bar shows the
    // user is halfway through the current doc.
    expect(
      src,
      "progressPct must use (docIndex + 0.5) / totalDocs midpoint math",
    ).toMatch(
      /progressPct\s*=\s*\(\(\s*docIndex\s*\+\s*0\.5\s*\)\s*\/\s*totalDocs\s*\)\s*\*\s*100/,
    );
  });

  // ── #19: clear focusedFieldId on doc switch ─────────────────

  it("#19 client resets focusedFieldId when advancing to the next document", () => {
    const src = readSource("src/app/sign/[token]/client.tsx");

    // The post-sign success branch advances docIndex and clears all
    // per-doc state. focusedFieldId must be cleared too — otherwise the
    // overlay highlight from the previous doc carries into the next one.
    const successBranch = src.match(
      /setDocIndex\(\(i\)\s*=>\s*i\s*\+\s*1\)[\s\S]{0,400}/,
    );
    expect(
      successBranch,
      "must have a setDocIndex+1 advance branch in the sign success handler",
    ).not.toBeNull();
    expect(
      successBranch![0],
      "advance branch must include setFocusedFieldId(null) to drop stale focus",
    ).toMatch(/setFocusedFieldId\(\s*null\s*\)/);
  });

  // ── #20: per-page render progress (both viewers) ───────────

  it("#20 pdf-field-viewer tracks per-page render progress in state", () => {
    const src = readSource("src/components/onboarding/pdf-field-viewer.tsx");

    // State declaration: { current, total } — keep both so the loading UI
    // can show the denominator without a separate length prop.
    expect(
      src,
      "must declare a renderProgress state with current/total",
    ).toMatch(
      /useState\(\s*\{\s*current:\s*0\s*,\s*total:\s*0\s*\}\s*\)/,
    );

    // setRenderProgress must be called inside the per-page render loop.
    expect(
      src,
      "must call setRenderProgress to advance the counter inside the render loop",
    ).toMatch(/setRenderProgress\(\s*\{\s*current:\s*i\s*\+\s*1/);

    // Loading UI must show the per-page label, not a static "Loading...".
    expect(
      src,
      "loading UI must show 'Loading page X of N...' format",
    ).toMatch(/Loading page \$\{renderProgress\.current\} of \$\{renderProgress\.total\}/);
  });

  it("#20 pdf-viewer tracks per-page render progress in state (parity with field viewer)", () => {
    const src = readSource("src/components/onboarding/pdf-viewer.tsx");

    expect(
      src,
      "must declare a renderProgress state with current/total",
    ).toMatch(
      /useState\(\s*\{\s*current:\s*0\s*,\s*total:\s*0\s*\}\s*\)/,
    );
    expect(
      src,
      "must call setRenderProgress with i+1 inside the render loop",
    ).toMatch(/setRenderProgress\(\s*\{\s*current:\s*i\s*\+\s*1/);
    expect(
      src,
      "loading UI must show 'Loading page X of N...' format",
    ).toMatch(/Loading page \$\{renderProgress\.current\} of \$\{renderProgress\.total\}/);
  });

  // ── #21: Retry button on render error (both viewers) ───────

  it("#21 pdf-field-viewer renders a Retry button in the error state", () => {
    const src = readSource("src/components/onboarding/pdf-field-viewer.tsx");

    // The error branch must render a button that re-invokes renderPdf.
    // This is what lets a transient network blip recover without a full
    // page reload.
    const errorBranch = src.match(/if \(error[\s\S]*?\)\s*\{[\s\S]*?return\s*\(\s*<div[\s\S]*?<\/div>\s*\)\s*;\s*\}/);
    expect(
      errorBranch,
      "must have an error-state branch returning JSX",
    ).not.toBeNull();
    expect(
      errorBranch![0],
      "error branch must include a Retry button wired to renderPdf",
    ).toMatch(/onClick=\{[^}]*renderPdf\(\)[^}]*\}[\s\S]*?Retry/);
  });

  it("#21 pdf-viewer renders a Retry button in the error state (parity)", () => {
    const src = readSource("src/components/onboarding/pdf-viewer.tsx");

    expect(
      src,
      "error UI must include a Retry button wired to renderPdf",
    ).toMatch(/onClick=\{[^}]*renderPdf\(\)[^}]*\}[\s\S]*?Retry/);
  });

  // ── #22: signedPath keys by doc.id (not docType) ───────────

  it("#22 sign route writes signed PDF to a doc.id-keyed path, not docType-keyed", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // Pre-fix path: `onboarding/${onboarding.id}/signed/${doc.docType}.pdf`
    // — two docs with the same custom docType collided. Post-fix uses doc.id
    // which is unique per OnboardingDocument row.
    expect(
      src,
      "signedPath must be keyed by doc.id (collision-free), not doc.docType",
    ).toMatch(
      /const\s+signedPath\s*=\s*`onboarding\/\$\{onboarding\.id\}\/signed\/\$\{doc\.id\}\.pdf`/,
    );
    expect(
      src,
      "signedPath must NOT use doc.docType (causes collisions for duplicate docTypes)",
    ).not.toMatch(/signedPath\s*=\s*`[^`]*\$\{doc\.docType\}/);
  });

  // ── #24: server-side date override at sign time ─────────────

  it("#24 sign route overrides date prefill fields with the actual sign-time value", () => {
    const src = readSource("src/app/api/onboarding/[token]/sign/route.ts");

    // Before embedFieldValues, the route must walk template fields and
    // overwrite any field with prefillKey "date" with signDate. Without
    // this, a long-open tab would embed the stale client-side date.
    const overrideBlock = src.match(
      /for \(const field of templateFields\)\s*\{[\s\S]*?prefillKey\s*===\s*["']date["'][\s\S]*?fieldValues\[field\.id\]\s*=\s*signDate[\s\S]*?\}/,
    );
    expect(
      overrideBlock,
      "must loop templateFields and overwrite date prefill fields with signDate",
    ).not.toBeNull();

    // signDate is the server timestamp formatted at request time — make
    // sure it's still derived from `new Date()`, not request input.
    expect(
      src,
      "signDate must be derived from `new Date()` at request time",
    ).toMatch(/const\s+signDate\s*=\s*new\s+Date\(\)\.toLocaleDateString\(/);
  });
});
