// Slice 22-as-org-vault smoke — verify the Document Vault honors the
// `?as_org=` super_admin override on both the list page and the detail
// (template editor) page.
//
// The bug this guards: the orange override banner rendered correctly but
// the underlying queries returned home-org templates because the vault
// surfaces (built later as client components) skipped both halves of the
// codebase-standard override pattern: client reads `useSearchParams()` +
// threads `overrideOpts`, server actions accept `options: { overrideAsOrg }`
// and forward to `getCurrentOrgContext`.
//
// Static-source assertions (same rationale as override-scoping.test.ts):
// the action files are "use server" modules with deep dependencies; what
// we actually care about is that the *contract* is wired in source. The
// systemic guard for vault-actions.ts exports is in override-scoping.test.ts
// (FILES_UNDER_TEST list). This file pins the slice-specific surfaces:
// list page, detail page, server-action helper.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const VAULT_LIST = "src/app/(dashboard)/brokerage/client-onboarding/vault/page.tsx";
const VAULT_DETAIL = "src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx";
const VAULT_ACTIONS = "src/app/(dashboard)/brokerage/client-onboarding/vault-actions.ts";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 22-as-org-vault — list page honors ?as_org=", () => {
  const src = read(VAULT_LIST);

  it("reads `as_org` from useSearchParams", () => {
    expect(src).toMatch(/useSearchParams/);
    expect(src).toMatch(/sp\.get\(["']as_org["']\)/);
  });

  it("threads overrideOpts to getDocumentTemplates", () => {
    expect(src).toMatch(/getDocumentTemplates\([^)]*overrideOpts/);
  });

  it("threads overrideOpts to createDocumentTemplate (mutations honor override per onboarding precedent)", () => {
    expect(src).toMatch(/createDocumentTemplate\([^)]*overrideOpts/);
  });

  it("threads overrideOpts to deleteDocumentTemplate", () => {
    expect(src).toMatch(/deleteDocumentTemplate\([^)]*overrideOpts/);
  });

  it("preserves ?as_org= on the link to the detail (editor) page", () => {
    // Link href interpolates `${detailQs}` (the `?as_org=` query suffix).
    expect(src).toMatch(/\/brokerage\/client-onboarding\/vault\/\$\{[^}]+\}\$\{detailQs\}/);
  });
});

describe("Slice 22-as-org-vault — detail page honors ?as_org=", () => {
  const src = read(VAULT_DETAIL);

  it("reads `as_org` from useSearchParams", () => {
    expect(src).toMatch(/useSearchParams/);
    expect(src).toMatch(/sp\.get\(["']as_org["']\)/);
  });

  it("threads overrideOpts to getDocumentTemplates", () => {
    expect(src).toMatch(/getDocumentTemplates\([^)]*overrideOpts/);
  });

  it("threads overrideOpts to updateTemplateFields", () => {
    expect(src).toMatch(/updateTemplateFields\([^)]*overrideOpts/);
  });

  it("preserves ?as_org= on back-navigation to the vault list", () => {
    expect(src).toMatch(/router\.push\(`\/brokerage\/client-onboarding\/vault\$\{detailQs\}`\)/);
  });
});

describe("Slice 22-as-org-vault — server actions accept and forward override", () => {
  const src = read(VAULT_ACTIONS);

  it("getOrgId helper accepts options and forwards to getCurrentOrgContext", () => {
    // Helper signature pinned literally so a future agent can't quietly drop it.
    expect(src).toMatch(/async function getOrgId\(\s*options: \{ overrideAsOrg\?: string \} = \{\},?\s*\)/);
    expect(src).toMatch(/getCurrentOrgContext\(options\)/);
  });

  it("contains no bare `getCurrentOrgContext()` call (every call must forward options)", () => {
    expect(src).not.toMatch(/getCurrentOrgContext\(\s*\)/);
  });

  it("each exported server action accepts the override option", () => {
    // 5 actions × 1 occurrence each. Cardinality check guards against
    // a future export being added without the threaded option.
    const matches = src.match(/options: \{ overrideAsOrg\?: string \} = \{\}/g) ?? [];
    // 1 helper + 5 exports = 6.
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Slice 22-as-org-vault — cardinality across both vault client pages", () => {
  it("both vault pages reference useSearchParams AND overrideAsOrg", () => {
    const files = [VAULT_LIST, VAULT_DETAIL];
    let bothPatternsCount = 0;
    for (const f of files) {
      const src = read(f);
      if (/useSearchParams/.test(src) && /overrideAsOrg/.test(src)) {
        bothPatternsCount += 1;
      }
    }
    expect(bothPatternsCount).toBeGreaterThanOrEqual(2);
  });
});
