// Slice 19-B1 smoke — Document Vault visibility + iOS pdfjs migration.
//
// The Vault was built but invisible — no nav surface linked to it. This
// slice (1) wires it into the brokerage subnav under a new Documents
// group, (2) adds the manage_templates permission to gate that nav entry,
// (3) replaces the iframe-based PDF preview in the editor with the same
// self-hosted pdfjs path the public viewers use (slice 20-fixes-A/C/D),
// and (4) adds a "Manage templates" affordance on /new so admins discover
// the vault in context.
//
// Each contract pins the architectural shape of the fix; runtime visual
// behavior (iPad rendering, iOS Safari font fallback) is covered by the
// post-deploy manual checklist in the PR body.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 19-B1 — Vault visibility + iOS pdfjs migration", () => {
  // ── Visibility: nav + permissions ─────────────────────────

  it("brokerage subnav exposes a Templates item linking to the vault", () => {
    const src = readSource("src/app/(dashboard)/brokerage/layout.tsx");

    // The new Documents nav group must contain a Templates entry pointing
    // at the existing /vault route. Without this, the vault stays
    // invisible no matter how many other surfaces link to it.
    expect(
      src,
      "ADMIN_NAV must contain a 'Documents' group",
    ).toMatch(/group:\s*["']Documents["']/);
    expect(
      src,
      "Templates item must link to /brokerage/client-onboarding/vault",
    ).toMatch(
      /href:\s*["']\/brokerage\/client-onboarding\/vault["'][\s\S]*?label:\s*["']Templates["']/,
    );
  });

  it("manage_templates permission is defined and admin-tier scoped", () => {
    const src = readSource("src/lib/bms-types.ts");

    // The permission must exist (it's the BmsPermission type's source of
    // truth) and must NOT include "agent" in the role list — managing
    // templates is an admin/broker/manager surface, not agent-tier.
    const permLine = src.match(/manage_templates:\s*\[[^\]]+\]/);
    expect(
      permLine,
      "manage_templates must be defined in BMS_PERMISSIONS",
    ).not.toBeNull();
    expect(
      permLine![0],
      "manage_templates must include brokerage_admin, broker, manager",
    ).toMatch(/brokerage_admin[\s\S]*broker[\s\S]*manager/);
    expect(
      permLine![0],
      "manage_templates must NOT include agent (admin-tier only)",
    ).not.toMatch(/["']agent["']/);
  });

  it("PAGE_PERMISSION_MAP gates /vault on manage_templates (whitelist-based)", () => {
    const src = readSource("src/lib/bms-permissions.ts");

    // canAccessPage returns false for any path missing from the map. So
    // the vault MUST appear here or the new subnav entry silently
    // disappears.
    expect(
      src,
      "PAGE_PERMISSION_MAP must gate vault on manage_templates",
    ).toMatch(
      /["']\/brokerage\/client-onboarding\/vault["']\s*:\s*["']manage_templates["']/,
    );
  });

  // ── iOS migration: iframe → pdfjs ────────────────────────

  it("vault editor no longer uses <iframe> — uses pdfjs render path instead", () => {
    const src = readSource("src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx");

    // The iframe was the iOS Safari black hole. Same regex shape as slice
    // 20-fixes-C — matches `<iframe ` or `<iframe\n` (real JSX element),
    // not `<iframe>` text in JS comments referring to the old pattern.
    expect(
      src,
      "must not contain <iframe in JSX form — pdfjs render replaces it",
    ).not.toMatch(/<iframe[\s/]/);
  });

  it("vault editor imports pdfjs-dist and references the self-hosted worker (no CDN)", () => {
    const src = readSource("src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx");

    // Mirrors the public viewer pattern from slice 20-fixes-A. Self-hosted
    // worker + cmaps under public/pdfjs/ — corp networks, CSP, and offline
    // clients all work because there's no jsdelivr dependency.
    expect(
      src,
      "must dynamically import pdfjs-dist for client-side rendering",
    ).toMatch(/import\(\s*["']pdfjs-dist["']\s*\)/);
    expect(
      src,
      "must reference self-hosted pdfjs worker (NOT cdn.jsdelivr.net)",
    ).toMatch(/workerSrc\s*=\s*["']\/pdfjs\/pdf\.worker\.min\.mjs["']/);
    expect(src, "must NOT reference jsdelivr CDN").not.toMatch(/jsdelivr/);

    // pdfjs's getDocument call mirrors the public viewers — { url, cMapUrl,
    // cMapPacked } shape. Anchored on `url: template` so this regex only
    // matches the editor's call site, not future callers.
    expect(
      src,
      "must call pdfjsLib.getDocument({ url: template.templatePdfUrl, ... })",
    ).toMatch(/getDocument\(\s*\{\s*url:\s*template\.templatePdfUrl/);
  });

  it("vault editor renders a Retry button in the error state (parity with public viewers)", () => {
    const src = readSource("src/app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx");

    // A transient network blip during pdfjs load no longer strands the
    // user — they can retry without reloading the whole page. Same UX
    // affordance we added in slice 20-fixes-D.
    expect(
      src,
      "error state must render a Retry button wired to renderPdf()",
    ).toMatch(/onClick=\{[^}]*renderPdf\(\)[^}]*\}[\s\S]*?Retry/);
  });

  // ── Discovery affordance on /new ─────────────────────────

  it("/new picker contains a 'Manage templates' link to the vault", () => {
    const src = readSource("src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx");

    // Inline next to the selected-count span — admins discover the vault
    // exactly when they're picking templates. The link is visible to all
    // roles; agents who click through hit the manage_templates RBAC gate
    // at /vault and bounce off there (not pre-filtered here).
    const link = src.match(
      /<Link\s+href=["']\/brokerage\/client-onboarding\/vault["'][\s\S]*?>[\s\S]*?Manage templates[\s\S]*?<\/Link>/,
    );
    expect(
      link,
      "must render <Link href='/brokerage/client-onboarding/vault'>...Manage templates...</Link>",
    ).not.toBeNull();
  });
});
