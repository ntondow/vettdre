// Slice 10 smoke — filter-aware empty-state pattern across BMS list surfaces.
//
// Slice 18 (PR #21) established the contract on `/brokerage/client-onboarding`:
// every list page with filters must differentiate two empty-state cases:
//
//   1. Filter-narrowed: records exist on other tabs/filters but NOT this one.
//      → No CTA. Point the user back to a less-restrictive view.
//
//   2. Slate-zero: no records exist anywhere — first-use state.
//      → Primary CTA so the user can create the first record.
//
// Slice 10 extends the same contract to 5 more list surfaces. Per-surface copy
// varies (multi-axis "Clear filters" vs tab-canonical "Try the All tab" vs
// pill-canonical "Try the All filter") because forcing one phrasing would lie
// about the actual filter shape — but the structural invariants are universal:
//
//   • data-testid="X-empty-filtered" present on filter-narrowed branch.
//   • data-testid="X-empty-zero"    present on slate-zero branch.
//   • Filter-narrowed branch contains NO <button>/<Link>/<a> CTA element.
//   • Slate-zero branch (where applicable) DOES contain a CTA element.
//   • The two branches' user-visible copy differs (catches the
//     copy-paste regression where someone duplicates one branch into
//     both slots).
//
// Why static-source assertions, not React-tree assertions:
//   These pages have deep dependencies (Prisma actions, server props, useEffect
//   chains). Loading them under happy-dom would test the mock more than the
//   code. The contract is structurally visible in the JSX source — that's what
//   we lock in.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// Extract the JSX block tagged with the given data-testid. Brace/tag matched
// so nested elements are captured but the surrounding sibling JSX isn't.
// Returns the substring from `<div data-testid="<id>"` (or any element) through
// the matching closing `</div>` at depth 0.
function extractEmptyStateBlock(src: string, testid: string): string {
  const openIdx = src.indexOf(`data-testid="${testid}"`);
  if (openIdx === -1) return "";
  // Walk back to the opening `<` of this element.
  let elStart = openIdx;
  while (elStart > 0 && src[elStart] !== "<") elStart--;
  // Determine tag name (e.g. `<div`).
  const tagMatch = src.slice(elStart).match(/^<(\w+)/);
  if (!tagMatch) return "";
  const tagName = tagMatch[1];
  // Walk forward, tracking depth across same-tag opens/closes.
  let i = elStart;
  let depth = 0;
  const openRe = new RegExp(`<${tagName}\\b`, "g");
  const closeRe = new RegExp(`</${tagName}>`, "g");
  while (i < src.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(src);
    const nextClose = closeRe.exec(src);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      i = nextClose.index + nextClose[0].length;
      if (depth === 0) return src.slice(elStart, i);
    }
  }
  return "";
}

// Helpers: assert the structural invariants once, parameterized per surface.
// Keeps each describe block's body to "what's the surface" + tiny coverage
// assertions, so the failure mode reads "agents-empty-filtered missing testid"
// rather than walking through 30 lines of repeated regexes.
function assertFilterNarrowedHasNoCta(block: string, surface: string) {
  expect(block.length, `${surface}: filter-narrowed block not found`).toBeGreaterThan(0);
  expect(block, `${surface}: filter-narrowed must not contain a button CTA`).not.toMatch(/<button\b/i);
  expect(block, `${surface}: filter-narrowed must not contain a Link CTA`).not.toMatch(/<Link\b/);
  expect(block, `${surface}: filter-narrowed must not contain an <a> CTA`).not.toMatch(/<a\s+href=/i);
}

function assertSlateZeroHasCta(block: string, surface: string) {
  expect(block.length, `${surface}: slate-zero block not found`).toBeGreaterThan(0);
  // Either a button or a link. contacts/page.tsx is the documented exception
  // (CTA is implicit via the toolbar's <ContactForm /> button) — its describe
  // block uses assertSlateZeroHasNoInlineCta() instead.
  const hasCta = /<button\b/i.test(block) || /<Link\b/.test(block) || /<a\s+href=/i.test(block);
  expect(hasCta, `${surface}: slate-zero must contain a CTA element`).toBe(true);
}

function assertCopyDiffers(filtered: string, zero: string, surface: string) {
  // Strip the testid attribute (it's the differentiator we just checked) and
  // strip whitespace, then assert the remaining content isn't identical. Catches
  // the copy-paste regression where someone duplicates one branch's body into
  // the other's slot.
  const norm = (s: string) =>
    s.replace(/data-testid="[^"]*"/g, "")
      .replace(/\s+/g, " ")
      .trim();
  expect(norm(filtered), `${surface}: filter-narrowed and slate-zero copies must differ`).not.toBe(norm(zero));
}

// ── transactions ──────────────────────────────────────────────
// Multi-axis filter (search + typeFilter + stageFilter). Filter-narrowed copy
// directs the user to clear filters since there's no canonical "All" tab.
describe("Slice 10 — /brokerage/transactions empty state", () => {
  const src = readSource("src/app/(dashboard)/brokerage/transactions/page.tsx");
  const filtered = extractEmptyStateBlock(src, "transactions-empty-filtered");
  const zero = extractEmptyStateBlock(src, "transactions-empty-zero");

  it("has both filter-narrowed and slate-zero branches", () => {
    expect(filtered.length).toBeGreaterThan(0);
    expect(zero.length).toBeGreaterThan(0);
  });

  it("filter-narrowed branch has no CTA", () => {
    assertFilterNarrowedHasNoCta(filtered, "transactions");
  });

  it("slate-zero branch has a CTA", () => {
    assertSlateZeroHasCta(zero, "transactions");
  });

  it("copy differs between branches", () => {
    assertCopyDiffers(filtered, zero, "transactions");
  });

  it("filter condition combines all 3 axes (search + typeFilter + stageFilter)", () => {
    // The branch selector in source must consult all three filters, otherwise
    // narrowing on (e.g.) stageFilter alone would silently land in slate-zero.
    expect(src).toMatch(/search\s*\|\|\s*typeFilter\s*!==\s*"all"\s*\|\|\s*stageFilter\s*!==\s*"all"/);
  });
});

// ── invoices ──────────────────────────────────────────────────
// Tab-canonical filter (statusFilter is the dominant axis; search supplements).
// Filter-narrowed copy points to "the All tab" since statusFilter is the
// surface's primary visual control.
describe("Slice 10 — /brokerage/invoices empty state", () => {
  const src = readSource("src/app/(dashboard)/brokerage/invoices/page.tsx");
  const filtered = extractEmptyStateBlock(src, "invoices-empty-filtered");
  const zero = extractEmptyStateBlock(src, "invoices-empty-zero");

  it("has both filter-narrowed and slate-zero branches", () => {
    expect(filtered.length).toBeGreaterThan(0);
    expect(zero.length).toBeGreaterThan(0);
  });

  it("filter-narrowed branch has no CTA", () => {
    assertFilterNarrowedHasNoCta(filtered, "invoices");
  });

  it("slate-zero branch has a CTA", () => {
    assertSlateZeroHasCta(zero, "invoices");
  });

  it("copy differs between branches", () => {
    assertCopyDiffers(filtered, zero, "invoices");
  });

  it("filter condition includes statusFilter (was missing pre-slice-10)", () => {
    // Pre-slice-10 the empty state branched only on `search`, so a user on the
    // Paid tab with zero paid invoices saw the slate-zero copy. This regex
    // contract guards against re-introducing that bug.
    expect(src).toMatch(/statusFilter\s*!==\s*"all"\s*\|\|\s*search/);
  });
});

// ── payments ──────────────────────────────────────────────────
// Multi-axis filter (search + startDate + endDate + method). Pre-slice-10 the
// page already differentiated CTA-presence correctly via two parallel
// conditionals — slice 10 consolidates into the testid'd two-branch shape so a
// future regression can be caught by source contract instead of manual review.
describe("Slice 10 — /brokerage/payments empty state", () => {
  const src = readSource("src/app/(dashboard)/brokerage/payments/page.tsx");
  const filtered = extractEmptyStateBlock(src, "payments-empty-filtered");
  const zero = extractEmptyStateBlock(src, "payments-empty-zero");

  it("has both filter-narrowed and slate-zero branches", () => {
    expect(filtered.length).toBeGreaterThan(0);
    expect(zero.length).toBeGreaterThan(0);
  });

  it("filter-narrowed branch has no CTA", () => {
    assertFilterNarrowedHasNoCta(filtered, "payments");
  });

  it("slate-zero branch has a CTA", () => {
    assertSlateZeroHasCta(zero, "payments");
  });

  it("copy differs between branches", () => {
    assertCopyDiffers(filtered, zero, "payments");
  });

  it("filter condition combines all 4 axes (search + startDate + endDate + method)", () => {
    expect(src).toMatch(/search\s*\|\|\s*startDate\s*\|\|\s*endDate\s*\|\|\s*method\s*!==\s*"all"/);
  });
});

// ── agents ────────────────────────────────────────────────────
// Tab-canonical filter (statusFilter dominant; search supplements). Same shape
// as invoices.
describe("Slice 10 — /brokerage/agents empty state", () => {
  const src = readSource("src/app/(dashboard)/brokerage/agents/page.tsx");
  const filtered = extractEmptyStateBlock(src, "agents-empty-filtered");
  const zero = extractEmptyStateBlock(src, "agents-empty-zero");

  it("has both filter-narrowed and slate-zero branches", () => {
    expect(filtered.length).toBeGreaterThan(0);
    expect(zero.length).toBeGreaterThan(0);
  });

  it("filter-narrowed branch has no CTA", () => {
    assertFilterNarrowedHasNoCta(filtered, "agents");
  });

  it("slate-zero branch has a CTA", () => {
    assertSlateZeroHasCta(zero, "agents");
  });

  it("copy differs between branches", () => {
    assertCopyDiffers(filtered, zero, "agents");
  });

  it("filter condition includes statusFilter (was missing pre-slice-10)", () => {
    expect(src).toMatch(/statusFilter\s*!==\s*"all"\s*\|\|\s*search/);
  });
});

// ── contacts (split-page surface) ─────────────────────────────
// Pill-canonical filter (typeFilter is single-axis). Slate-zero lives in
// page.tsx (renders only when there are no contacts at all); filter-narrowed
// lives in contact-list.tsx (only renders when contacts exist but the typeFilter
// narrows them to zero). The slate-zero branch has NO inline CTA — the
// page-toolbar <ContactForm /> button is the implicit primary action. This is
// the documented exception to the "slate-zero must contain a CTA" rule.
describe("Slice 10 — /contacts empty state (split across page.tsx + contact-list.tsx)", () => {
  const pageSrc = readSource("src/app/(dashboard)/contacts/page.tsx");
  const listSrc = readSource("src/app/(dashboard)/contacts/contact-list.tsx");
  const filtered = extractEmptyStateBlock(listSrc, "contacts-empty-filtered");
  const zero = extractEmptyStateBlock(pageSrc, "contacts-empty-zero");

  it("page.tsx has the slate-zero branch", () => {
    expect(zero.length).toBeGreaterThan(0);
  });

  it("contact-list.tsx has the filter-narrowed branch", () => {
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("filter-narrowed branch has no CTA", () => {
    assertFilterNarrowedHasNoCta(filtered, "contacts");
  });

  it("slate-zero has no inline CTA — toolbar ContactForm is the implicit action", () => {
    // Documented exception: page.tsx's slate-zero block intentionally omits an
    // inline CTA because the page header already renders <ContactForm /> as
    // the primary affordance. If a future edit adds a CTA inside the slate-
    // zero block, that's a UX duplicate and this contract fails.
    expect(zero, "contacts: slate-zero must NOT contain an inline button CTA").not.toMatch(/<button\b/i);
    expect(zero, "contacts: slate-zero must NOT contain an inline Link CTA").not.toMatch(/<Link\b/);
    // The page top renders <ContactForm /> — verify it's still there as the
    // implicit CTA. If this fails, either the form moved or we need to add
    // an inline CTA after all.
    expect(pageSrc).toMatch(/<ContactForm\s*\/>/);
  });

  it("filter-narrowed branch only fires when typeFilter !== 'all'", () => {
    // The "all" + 0-filtered case is a defensive fallback (parent page covers
    // no-contacts-at-all); the testid'd block must guard on typeFilter !== "all"
    // so the slate-zero/filter-narrowed split stays semantically clean.
    expect(listSrc).toMatch(/typeFilter\s*!==\s*"all"\s*\?\s*\(\s*<div\s+data-testid="contacts-empty-filtered"/);
  });

  it("copy differs between branches", () => {
    assertCopyDiffers(filtered, zero, "contacts");
  });
});
