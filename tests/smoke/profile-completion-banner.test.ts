// Slice 13 smoke — profile completion banner (B-017).
//
// Mix of source-level assertions (consistent with slices 7a/17/18 — the
// banner's callsites are server/client React components, mocking those
// runtimes is more work than it's worth) and direct unit tests on the
// computeMissingProfileFields helper, which is pure and can be exercised
// without any framework scaffolding.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeMissingProfileFields,
} from "../../src/components/profile-completion-banner";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 13 — Profile completion banner (B-017)", () => {
  // ── computeMissingProfileFields (pure helper) ────────────────────────

  describe("computeMissingProfileFields", () => {
    it("returns empty array when all three fields are present", () => {
      expect(
        computeMissingProfileFields({
          fullName: "Anthony Gulino",
          phone: "555-1234",
          licenseNumber: "10401234567",
        }),
      ).toEqual([]);
    });

    it("flags every empty field by user-visible name", () => {
      // The names returned here are what the banner displays — must match
      // what an agent reads on the form. "Full Name" not "fullName".
      expect(
        computeMissingProfileFields({ fullName: "", phone: "", licenseNumber: "" }),
      ).toEqual(["Full Name", "Phone", "License Number"]);
    });

    it("treats null and undefined as missing (SQL-seeded users have null)", () => {
      // Gulino agents were SQL-seeded per the audit; their licenseNumber
      // and phone are NULL in Postgres, not empty strings. Both shapes must
      // resolve to "missing" or the banner won't fire on the actual users
      // it was built for.
      expect(
        computeMissingProfileFields({ fullName: null, phone: undefined, licenseNumber: null }),
      ).toEqual(["Full Name", "Phone", "License Number"]);
    });

    it("treats whitespace-only strings as missing", () => {
      // SQL backfills sometimes leave " " (single-space) where a real value
      // was meant to land. Banner should still fire.
      expect(
        computeMissingProfileFields({ fullName: "  ", phone: "\t", licenseNumber: "  \n " }),
      ).toEqual(["Full Name", "Phone", "License Number"]);
    });

    it("returns empty array when the profile object itself is null", () => {
      // Defensive — if getProfile() ever returns null (auth edge case),
      // don't crash the banner with [].push() on undefined.
      expect(computeMissingProfileFields(null)).toEqual([]);
      expect(computeMissingProfileFields(undefined)).toEqual([]);
    });

    it("only checks the three audit-defined fields (no email, title, or brokerage)", () => {
      // Locked-in by the proposal: email is set at signup and effectively
      // always present; title/brokerage are nice-to-haves that would
      // pollute the banner with low-signal noise. If a future slice wants
      // to add fields, this test surfaces the change.
      const profile = {
        fullName: "Anthony",
        phone: "555-1234",
        licenseNumber: "10401234567",
        // Adding extra empty fields — must NOT trigger the banner.
        email: "",
        title: "",
        brokerage: "",
      } as unknown as Parameters<typeof computeMissingProfileFields>[0];
      expect(computeMissingProfileFields(profile)).toEqual([]);
    });
  });

  // ── Banner component contracts ───────────────────────────────────────

  describe("ProfileCompletionBanner component", () => {
    const componentSrc = readSource("src/components/profile-completion-banner.tsx");

    it("early-returns null when missingFields is empty", () => {
      // Renders nothing → callsites can render unconditionally without
      // wrapping in their own conditional. Without this, every callsite
      // would need its own guard and we'd risk drift.
      expect(componentSrc).toMatch(
        /if\s*\(\s*missingFields\.length\s*===\s*0\s*\)\s*return\s+null/,
      );
    });

    it("CTA link is conditional on actionHref prop", () => {
      // The banner is used in two places with different action shapes:
      //   /my-deals → links to /settings/profile (actionHref present)
      //   /settings/profile → no link, the form below IS the action
      // Without conditional rendering, /settings/profile would link to
      // itself — bad UX.
      expect(componentSrc).toMatch(
        /actionHref\s*&&\s*\([\s\S]{0,400}<Link/,
      );
    });

    it("renders fields with the testid expected by callsites", () => {
      expect(componentSrc).toMatch(/data-testid=["']profile-completion-banner["']/);
      expect(componentSrc).toMatch(/data-testid=["']profile-completion-banner-cta["']/);
    });
  });

  // ── Callsite wiring ──────────────────────────────────────────────────

  describe("/brokerage/my-deals — server-side computation + render", () => {
    const pageSrc = readSource(
      "src/app/(dashboard)/brokerage/my-deals/page.tsx",
    );
    const viewSrc = readSource(
      "src/app/(dashboard)/brokerage/my-deals/my-deals-view.tsx",
    );

    it("page imports getProfile from settings and computeMissingProfileFields from the banner module", () => {
      expect(pageSrc).toMatch(
        /import\s*\{\s*getProfile\s*\}\s*from\s*["']@\/app\/\(dashboard\)\/settings\/actions["']/,
      );
      expect(pageSrc).toMatch(
        /import\s*\{\s*computeMissingProfileFields\s*\}\s*from\s*["']@\/components\/profile-completion-banner["']/,
      );
    });

    it("page calls getProfile alongside the existing submissions fetch", () => {
      // Promise.all so the profile fetch doesn't add a sequential roundtrip
      // to TTI on a surface that's already a primary agent landing.
      expect(pageSrc).toMatch(/Promise\.all\([\s\S]{0,300}getProfile\(\)/);
    });

    it("page passes profileMissingFields prop to MyDealsView", () => {
      // JSX form: profileMissingFields={profileMissingFields}
      expect(pageSrc).toMatch(/profileMissingFields=\{\s*profileMissingFields\s*\}/);
    });

    it("MyDealsView renders the banner with /settings/profile as the CTA target", () => {
      expect(viewSrc).toMatch(/import\s+ProfileCompletionBanner\s+from\s+["']@\/components\/profile-completion-banner["']/);
      expect(viewSrc).toMatch(
        /<ProfileCompletionBanner[\s\S]{0,300}missingFields=\{profileMissingFields\}[\s\S]{0,300}actionHref=["']\/settings\/profile["']/,
      );
    });
  });

  describe("/settings/profile — client-side computation + render", () => {
    const pageSrc = readSource(
      "src/app/(dashboard)/settings/profile/page.tsx",
    );

    it("imports the banner component AND the helper", () => {
      expect(pageSrc).toMatch(
        /import\s+ProfileCompletionBanner,\s*\{\s*computeMissingProfileFields\s*\}\s*from\s*["']@\/components\/profile-completion-banner["']/,
      );
    });

    it("renders the banner only after the loading state resolves", () => {
      // Without the !loading guard, the banner would briefly render with
      // all three fields as missing while getProfile() is in flight —
      // every page load would flash an alarming "Complete your profile"
      // banner that disappears half a second later. Surface as a stop
      // condition in the proposal; mitigated here.
      expect(pageSrc).toMatch(
        /!loading\s*&&\s*\([\s\S]{0,300}<ProfileCompletionBanner/,
      );
    });

    it("renders the banner WITHOUT actionHref (form below is the action)", () => {
      // The /settings/profile page IS the place to update the profile.
      // Linking from the banner to the same page would be circular UX.
      const bannerInstance = pageSrc.match(
        /<ProfileCompletionBanner[\s\S]*?\/>/,
      );
      expect(bannerInstance).not.toBeNull();
      expect(bannerInstance?.[0]).not.toMatch(/actionHref/);
    });
  });

  // ── Slice 13-cross-cut: manager-side warning at filing time ─────────
  //
  // Locks in the regression class that slice 13 left open. Slice 13 only
  // surfaced incomplete-profile state to the *agent themselves*, on
  // /my-deals and /settings/profile. When a manager (slice 7a admin /
  // broker / manager role) files an onboarding for an agent via the
  // picker on /brokerage/client-onboarding/new, the agent never sees
  // their own banner before the manager hits Create — so an incomplete
  // profile silently produces a signed PDF with `(Agent's name)`-style
  // placeholders.
  //
  // This contract guards three failure modes:
  //   1. The roster fetch stops returning user.fullName/phone/licenseNumber
  //      (for any reason — schema rename, select trim, tenant-scoping
  //      refactor) → warning silently can't compute, regression to
  //      placeholder-on-PDF.
  //   2. The form drops the import of computeMissingProfileFields and
  //      reimplements its own check inline → drift from slice 13's
  //      canonical "what counts as complete" rule.
  //   3. The early-return guards on the warning component are removed →
  //      warning fires on initial paint before roster loads, or fires
  //      with an empty field list, both noisy false positives.
  describe("Slice 13-cross-cut — manager-side filing-time warning", () => {
    const actionsSrc = readSource(
      "src/app/(dashboard)/brokerage/client-onboarding/actions.ts",
    );
    const newPageSrc = readSource(
      "src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx",
    );

    it("getAgentRosterForOnboarding selects user.fullName / user.phone / user.licenseNumber", () => {
      // The select must include the linked User's profile-completeness
      // fields. computeMissingProfileFields needs all three; missing any
      // would silently weaken the warning.
      expect(actionsSrc).toMatch(
        /user:\s*\{\s*select:\s*\{[\s\S]{0,400}fullName:\s*true[\s\S]{0,400}phone:\s*true[\s\S]{0,400}licenseNumber:\s*true/,
      );
    });

    it("AgentRosterEntry type carries an optional user object on action + page", () => {
      // Both action-side and page-side type definitions need the user
      // shape for end-to-end TypeScript coverage. Drift between the two
      // would mean either the page can't see fields the action returns,
      // or the page reads fields the action doesn't fetch.
      expect(actionsSrc).toMatch(
        /user:\s*\{\s*fullName:\s*string\s*\|\s*null;\s*phone:\s*string\s*\|\s*null;\s*licenseNumber:\s*string\s*\|\s*null\s*\}\s*\|\s*null/,
      );
      expect(newPageSrc).toMatch(
        /user:\s*\{\s*fullName:\s*string\s*\|\s*null;\s*phone:\s*string\s*\|\s*null;\s*licenseNumber:\s*string\s*\|\s*null\s*\}\s*\|\s*null/,
      );
    });

    it("new/page.tsx imports computeMissingProfileFields from the banner module", () => {
      // Reuse slice 13's helper rather than reimplementing — single source
      // of truth for the completeness rule.
      expect(newPageSrc).toMatch(
        /import\s*\{\s*computeMissingProfileFields\s*\}\s*from\s*["']@\/components\/profile-completion-banner["']/,
      );
    });

    it("warning component early-returns on null agent and null user", () => {
      // Without these guards, the warning fires before the roster has
      // loaded (no selected agent yet) or for pending/invited hires
      // (BrokerAgent.userId === null) — both produce noisy false
      // positives on every page load.
      expect(newPageSrc).toMatch(
        /if\s*\(\s*!selectedAgent\s*\)\s*return\s+null;[\s\S]{0,300}if\s*\(\s*!selectedAgent\.user\s*\)\s*return\s+null/,
      );
    });

    it("warning component early-returns on empty missingFields", () => {
      // computeMissingProfileFields([]) → no warning. Without this guard
      // the amber callout would render every time, defeating its purpose.
      expect(newPageSrc).toMatch(
        /computeMissingProfileFields\(\s*selectedAgent\.user\s*\)[\s\S]{0,400}missingFields\.length\s*===\s*0\s*\)\s*return\s+null/,
      );
    });

    it("warning copy branches on isSelf (second-person vs third-person)", () => {
      // Manager picking themselves should read "your profile is missing
      // … Complete your profile" (second-person). Picking another agent
      // should read "{firstName}'s profile is missing … Ask {firstName}"
      // (third-person). Both must point to /settings/profile — the same
      // target as slice 13's agent banner.
      expect(newPageSrc).toMatch(/isSelf\s*\?\s*[\s\S]{0,300}your profile is missing/);
      expect(newPageSrc).toMatch(/Complete your profile at \/settings\/profile/);
      expect(newPageSrc).toMatch(/\$\{selectedAgent\.firstName\}'s profile is missing/);
      expect(newPageSrc).toMatch(/Ask \$\{selectedAgent\.firstName\} to complete their profile/);
    });

    it("warning is keyed by data-testid for downstream checks", () => {
      // Anchors any future Playwright/integration check to a stable
      // selector so the warning can be asserted on without snapshotting
      // the full form.
      expect(newPageSrc).toMatch(
        /data-testid=["']onboarding-agent-profile-warning["']/,
      );
    });

    it("warning is rendered inside the agent picker section, below the helper text", () => {
      // Placement matters: the warning must be inside the picker section
      // so the manager sees it the moment they select an agent — not in
      // a global toast or at the form submit boundary. Locks the inline
      // placement decision (Option A in the proposal) against drift.
      expect(newPageSrc).toMatch(
        /Defaults to you\. Pick another agent[\s\S]{0,500}<ProfileCompletenessWarning/,
      );
    });
  });
});
