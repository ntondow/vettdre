// Slice 1b smoke — role-aware default landing.
//
// Two surfaces matter:
//   1. The pure `landingForRole` mapping in src/app/page.tsx — exported
//      for direct testing so we don't have to mount a server component
//      to verify the role table.
//   2. Source-level guards on app/page.tsx and the middleware: the
//      former must thread role from the DB lookup into landingForRole;
//      the latter must NOT import Prisma or the landingForRole helper
//      (deliberate isolation — middleware stays edge-safe).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { landingForRole } from "../../src/app/page";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 1b — Role-aware default landing", () => {
  describe("landingForRole(role) — role-to-path table", () => {
    it("super_admin → /dashboard (interim, see SLICES.md 3.Z)", () => {
      expect(landingForRole("super_admin")).toBe("/dashboard");
    });

    it("owner / admin / manager → /brokerage/dashboard", () => {
      expect(landingForRole("owner")).toBe("/brokerage/dashboard");
      expect(landingForRole("admin")).toBe("/brokerage/dashboard");
      expect(landingForRole("manager")).toBe("/brokerage/dashboard");
    });

    it("agent → /brokerage/my-deals", () => {
      expect(landingForRole("agent")).toBe("/brokerage/my-deals");
    });

    it("null / undefined / unknown role → /market-intel (safe fallback)", () => {
      expect(landingForRole(null)).toBe("/market-intel");
      expect(landingForRole(undefined)).toBe("/market-intel");
      expect(landingForRole("ghost-role")).toBe("/market-intel");
      expect(landingForRole("")).toBe("/market-intel");
    });
  });

  describe("source-level wiring guards", () => {
    it("app/page.tsx threads role through landingForRole + redirects unauth → /login", () => {
      const src = readSource("src/app/page.tsx");
      // Imports the right pieces.
      expect(src).toMatch(/import\s+prisma\s+from\s+["']@\/lib\/prisma["']/);
      expect(src).toMatch(/redirect\s*\(\s*["']\/login["']\s*\)/);
      // Looks up by email (auth_provider_id may be NULL for admin-
      // created users — same self-heal pattern as the middleware).
      expect(src).toMatch(/where:\s*\{\s*email:\s*user\.email!/);
      // Uses the helper rather than inlining a redirect string —
      // single source of truth for the role table.
      expect(src).toMatch(/redirect\s*\(\s*landingForRole\s*\(/);
    });

    it("middleware does NOT import prisma or landingForRole (edge-safe)", () => {
      const middlewareSrc = readSource("src/lib/supabase/middleware.ts");
      // Edge-runtime middleware must stay Prisma-free; the role-to-
      // landing logic lives in app/page.tsx by design. Guard against
      // accidental coupling — adding either import here would break
      // edge bundling and silently regress the role-aware landing.
      expect(middlewareSrc).not.toMatch(/from\s+["']@\/lib\/prisma["']/);
      expect(middlewareSrc).not.toMatch(/landingForRole/);
      // The fallback path that previously hardcoded "/market-intel"
      // now bounces through "/" so app/page.tsx picks the landing.
      expect(middlewareSrc).toMatch(/url\.pathname\s*=\s*["']\/["']/);
      expect(middlewareSrc).not.toMatch(/url\.pathname\s*=\s*["']\/market-intel["']/);
    });
  });

  // Slice 1b2: class-level scan. The original 1b shipped only the root
  // `/` redirect + the middleware auth-page bounce — three other auth
  // entry points still hardcoded `/market-intel` as the post-auth
  // landing and bypassed the role-aware redirect:
  //   - login form's success router.push
  //   - pending-approval's "check again" button
  //   - magic-link / OAuth callback fallback when ?next= is missing
  // Each fix is a single-line flip from "/market-intel" → "/". This
  // contract guards the *class*: any auth-flow file that re-introduces
  // a hardcoded "/market-intel" landing fails.
  //
  // /market-intel is a legitimate destination elsewhere in the app —
  // this scan is scoped to auth-flow files only.
  describe("Slice 1b2 — auth-flow files have no hardcoded /market-intel", () => {
    const AUTH_FLOW_FILES = [
      "src/app/(auth)/login/page.tsx",
      "src/app/(auth)/pending-approval/page.tsx",
      "src/app/auth/callback/route.ts",
    ];

    for (const file of AUTH_FLOW_FILES) {
      it(`${file} does not hardcode "/market-intel" as a post-auth landing`, () => {
        const src = readSource(file);
        // Match the exact string literal — both single and double quoted.
        expect(src).not.toMatch(/["']\/market-intel["']/);
      });
    }
  });
});
