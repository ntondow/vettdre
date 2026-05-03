import { test, expect } from "@playwright/test";
import { login } from "./_setup/auth";

// Methodology §"Required infrastructure" flow #1.
// Maps to Z.0b plan-of-record table: 01-login.spec.ts.
//
// Verifies: /login page renders, email+password sign-in succeeds,
// post-auth redirect lands on a role-routed page (NOT /login).
// Sidebar/topnav presence is the smoke for "I'm in the app now."

test("login redirects to a role-routed landing page", async ({ page }) => {
  await login(page);

  // landingForRole (src/app/page.tsx): super_admin → /dashboard,
  // owner/admin/manager → /brokerage/dashboard, agent → /brokerage/my-deals.
  // Any of these is acceptable; the contract is "left /login."
  expect(page.url()).not.toMatch(/\/login/);
});

test("authenticated user sees app chrome (sidebar or mobile nav)", async ({ page }) => {
  await login(page);

  // Desktop layout uses <aside> sidebar; mobile uses bottom tab bar.
  // Either is fine — pin "some chrome rendered" not "specific viewport."
  const navOrSidebar = page.locator("aside, nav").first();
  await expect(navOrSidebar).toBeVisible({ timeout: 10_000 });
});
