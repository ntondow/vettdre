// Test credentials for the playwright harness. Read from `.env.local`
// (gitignored) so creds never enter the repo. Fail loudly on first
// access if not set so the failure is obvious to the human running
// the suite.
//
// Provisioning: see `docs/playwright-setup.md` — create a dedicated
// test user via Supabase signup or admin dashboard, NOT Nathan's
// super_admin login.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local. ` +
        `See docs/playwright-setup.md for provisioning steps.`,
    );
  }
  return value;
}

export const TEST_USER = {
  email: required("PLAYWRIGHT_TEST_EMAIL"),
  password: required("PLAYWRIGHT_TEST_PASSWORD"),
};
