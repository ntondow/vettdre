import { test, expect } from "@playwright/test";
import { login } from "./_setup/auth";

// Methodology §"Required infrastructure" flow #2 (simplified).
// Maps to Z.0b plan-of-record table: 02-create-contact.spec.ts.
//
// Methodology canonical flow #2 is "create contact → add to pipeline
// → advance stage." This spec ships only the create step; the
// pipeline + advance steps are deferred (filed under
// z0b-followup-flows-6-10's stage-advance coverage).

test("authenticated user can create a contact and see it in the list", async ({ page }) => {
  await login(page);

  await page.goto("/contacts");
  await expect(page).toHaveURL(/\/contacts/);

  // Click into the new-contact flow. The button labeling varies a
  // little across breakpoints (text label vs icon-only); match either.
  const newContactButton = page
    .getByRole("button", { name: /new contact|add contact|create contact/i })
    .first();
  await expect(newContactButton).toBeVisible({ timeout: 10_000 });
  await newContactButton.click();

  // Generate a unique tag so we can find this contact later. A
  // timestamp is enough — fresh per run, no DB cleanup needed.
  const stamp = Date.now();
  const firstName = `Playwright`;
  const lastName = `Test ${stamp}`;
  const email = `pw-${stamp}@example.test`;

  await page.getByLabel(/first name/i).fill(firstName);
  await page.getByLabel(/last name/i).fill(lastName);
  await page.getByLabel(/email/i).fill(email);

  await page.getByRole("button", { name: /save|create|submit/i }).click();

  // Confirm the contact appears in the list (or that we landed on the
  // contact's dossier page — either is valid post-save).
  await expect(page.getByText(`Playwright Test ${stamp}`)).toBeVisible({
    timeout: 10_000,
  });
});
