import { type Page, expect } from "@playwright/test";
import { TEST_USER } from "./test-data";

// Log in via the /login page using Supabase email+password.
// Mirrors the production sign-in pattern at src/app/(auth)/login/page.tsx
// (supabase.auth.signInWithPassword → redirect to `/` → role-routed by
// landingForRole in src/app/page.tsx).
//
// Specs reuse this rather than logging in per-test. For multi-spec
// runs, consider migrating to playwright's `storageState` pattern as a
// follow-up — it lives in `playwright/.auth/user.json` (gitignored).

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
  await page.getByPlaceholder(/password/i).fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // /login redirects to `/`, which routes by role. Don't pin to
  // /dashboard specifically — landingForRole sends agents to
  // /brokerage/my-deals and brokerage roles to /brokerage/dashboard.
  // Wait for any post-login URL that ISN'T /login.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}
