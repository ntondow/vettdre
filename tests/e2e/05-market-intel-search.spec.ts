import { test, expect } from "@playwright/test";
import { login } from "./_setup/auth";

// Methodology §"Required infrastructure" flow #6 (kickoff substituted
// for canonical flow #5 — see z0b-followup-flow-5-showing-booking).
// Maps to Z.0b plan-of-record table: 05-market-intel-search.spec.ts.
//
// Verifies: authenticated user can navigate to /market-intel, run a
// property search against a known NYC address, and see the result set
// render. The address is real (Empire State Building's lot) and lives
// in NYC Open Data, so the lookup hits real APIs and results should
// be deterministic.

const TEST_ADDRESS = "350 5th Ave, Manhattan, NY 10118";

test("authenticated user can run a market intel address search", async ({ page }) => {
  await login(page);

  await page.goto("/market-intel");
  await expect(page).toHaveURL(/\/market-intel/);

  // Search input lives at the top of the page; placeholder/label
  // varies between layouts. Match by role first, fall back to
  // placeholder.
  const searchInput = page
    .getByRole("textbox", { name: /address|search/i })
    .or(page.getByPlaceholder(/address|search/i))
    .first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });
  await searchInput.fill(TEST_ADDRESS);
  await searchInput.press("Enter");

  // Result render is async (NYC API + data fusion). Don't assert on
  // specific data values (those drift with NYC Open Data updates) —
  // just confirm the page transitioned out of "empty search" state
  // by checking that *some* part of the address appears as text.
  await expect(page.getByText(/350|Empire State|10118/i).first()).toBeVisible({
    timeout: 30_000,
  });
});
