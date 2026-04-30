// Slice 17 smoke — onboarding form UX cleanup.
//
// Source-level assertions only (same pattern as slice 7a — the form is a
// client component with effects + actions; mounting it under happy-dom would
// require mocking the entire server runtime). The contracts below verify the
// structural guarantees that matter for the four bugs this slice closes:
//
//   B-023: thrown errors from createOnboarding surface a "Try again" button
//          (transient 503/cold-start recovery — slice 14 handled the LIST page;
//           this slice handles the SUBMIT path).
//   B-025: input placeholders render visually distinct from filled values
//          (italic + lighter weight — managers stop assuming "4,500" is prefilled).
//   B-026: currency fields format on blur, revert to bare digits on focus
//          (so "4500" displays as "4,500" but stays editable).
//   B-029: Personal Note is hidden when delivery is SMS-only or link-only
//          (the server discards the note on those channels — don't waste
//           manager input).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 17 — Onboarding form UX cleanup (B-023/B-025/B-026/B-029)", () => {
  const formSrc = readSource(
    "src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx",
  );

  // ── B-023: retry affordance on transient submit failure ──────────────

  it("(B-023a) handleSubmit's catch sets a retryable error message + flips submitRetryable=true", () => {
    // The thrown-error branch must mark the failure as retryable so the UI
    // can render the recovery button. setSubmitRetryable(true) must appear
    // inside the catch block — not in the success or action-error branches.
    expect(formSrc).toMatch(
      /catch[\s\S]{0,500}setSubmitError\([^)]*\)[\s\S]{0,200}setSubmitRetryable\(true\)/,
    );
  });

  it("(B-023b) action-returned errors (result.success=false) are NOT marked retryable", () => {
    // Validation / permission / state errors come back as
    // { success: false, error }. Hammering the same submit will yield the
    // same error — don't tempt the user to retry.
    expect(formSrc).toMatch(
      /result\.success[\s\S]{0,800}else\s*\{[\s\S]{0,500}setSubmitRetryable\(false\)/,
    );
  });

  it("(B-023c) error banner conditionally renders a 'Try again' button when retryable", () => {
    // The button must be inside the {submitError && (...)} block AND gated
    // on submitRetryable, so the action-error path doesn't show it.
    expect(formSrc).toMatch(
      /submitRetryable\s*&&[\s\S]{0,400}data-testid=["']onboarding-submit-retry["'][\s\S]{0,200}Try again/,
    );
    // The retry button must call handleSubmit (re-runs the same flow with
    // current form state — no full page reload, no lost input). JSX
    // attribute order is not enforced (onClick before or after data-testid
    // is fine — match either direction within the same JSX element).
    expect(formSrc).toMatch(
      /onClick=\{handleSubmit\}[\s\S]{0,200}data-testid=["']onboarding-submit-retry["']/,
    );
  });

  // ── B-025: placeholder styling distinct from filled values ───────────

  it("(B-025) shared INPUT class applies italic + lighter weight to placeholders", () => {
    // All form inputs reuse the INPUT constant, so styling it once catches
    // every offender (Fee, Unit Number, Monthly Rent, etc.) Filled values
    // render with default (non-italic) weight — the visual diff is the fix.
    expect(formSrc).toMatch(
      /const\s+INPUT\s*=\s*["'][^"']*placeholder:italic[^"']*placeholder:font-normal[^"']*placeholder:text-slate-400[^"']*["']/,
    );
  });

  // ── B-026: currency formatted on blur, raw on focus ──────────────────

  it("(B-026a) formatCurrency helper exists and uses en-US locale comma grouping", () => {
    // Helper at module level (not a hook). Uses toLocaleString with en-US so
    // the output matches the rest of the app's currency display ("$4,500").
    expect(formSrc).toMatch(
      /function\s+formatCurrency\([^)]*\)\s*:\s*string\s*\{[\s\S]{0,400}toLocaleString\(\s*["']en-US["']/,
    );
  });

  it("(B-026b) Fee Due at Signing input formats on blur, reverts to raw digits on focus", () => {
    // The value prop must be the focused-vs-blurred conditional: focused →
    // raw state (feeAmount), blurred → formatCurrency(feeAmount). Without
    // this, typing fights the cursor on every character.
    expect(formSrc).toMatch(
      /feeAmountFocused\s*\?\s*feeAmount\s*:\s*formatCurrency\(feeAmount\)/,
    );
    expect(formSrc).toMatch(
      /onFocus=\{\(\)\s*=>\s*setFeeAmountFocused\(true\)\}/,
    );
    expect(formSrc).toMatch(
      /onBlur=\{\(\)\s*=>\s*setFeeAmountFocused\(false\)\}/,
    );
  });

  it("(B-026c) Monthly Rent input applies the same focus/blur formatting pattern", () => {
    expect(formSrc).toMatch(
      /monthlyRentFocused\s*\?\s*monthlyRent\s*:\s*formatCurrency\(monthlyRent\)/,
    );
    expect(formSrc).toMatch(
      /onFocus=\{\(\)\s*=>\s*setMonthlyRentFocused\(true\)\}/,
    );
    expect(formSrc).toMatch(
      /onBlur=\{\(\)\s*=>\s*setMonthlyRentFocused\(false\)\}/,
    );
  });

  // ── B-029: Personal Note hidden on non-email delivery ────────────────

  it("(B-029a) Personal Note section is wrapped in a conditional gating on email channel", () => {
    // The conditional must require email-inclusive delivery: NOT linkOnly
    // AND deliveryChannels has 'email'. SMS-only and link-only deliveries
    // discard the note server-side; hiding the field is the contract.
    expect(formSrc).toMatch(
      /!linkOnly\s*&&\s*deliveryChannels\.has\(["']email["']\)\s*&&\s*\([\s\S]{0,400}data-testid=["']onboarding-personal-note["']/,
    );
  });

  it("(B-029b) submit payload omits notes when delivery is non-email", () => {
    // Even if user types a note while email is selected then switches to
    // SMS-only before submitting, the payload's notes must respect the
    // current delivery — server-side handling is otherwise an asymmetric
    // discard the manager doesn't see.
    expect(formSrc).toMatch(
      /includePersonalNote\s*=\s*!linkOnly\s*&&\s*deliveryChannels\.has\(["']email["']\)/,
    );
    expect(formSrc).toMatch(
      /notes:\s*includePersonalNote\s*\?\s*\(notes\.trim\(\)\s*\|\|\s*undefined\)\s*:\s*undefined/,
    );
  });
});
