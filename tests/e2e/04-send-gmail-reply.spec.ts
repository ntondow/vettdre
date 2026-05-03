import { test } from "@playwright/test";

// Methodology §"Required infrastructure" flow #4.
// Maps to Z.0b plan-of-record table: 04-send-gmail-reply.spec.ts.
//
// PLACEHOLDER — skipped until the playwright test user has Gmail OAuth
// connected. Per kickoff: "requires Gmail OAuth connected on the test
// user; flow may need to be marked test.skip() with TODO until test
// user is provisioned."
//
// Provisioning steps (when ready to enable this spec):
//   1. Log in as the playwright test user
//   2. Settings → Gmail → Connect → grant OAuth scopes
//   3. Confirm an inbound thread exists (send a test email TO the test
//      user from another account so there's something to reply to)
//   4. Remove the test.skip line below
//   5. Implement the body:
//      - page.goto("/messages")
//      - find the seeded inbound thread (filter or search)
//      - click reply, type body, send
//      - confirm sent state (✓ Sent indicator, or thread shows new
//        outbound message)

test.skip("authenticated user can reply to a Gmail thread", async () => {
  // Body intentionally empty — see header comment for re-enable steps.
  // Filed as part of z0b-followup-flow-3-deal-submission-seed's
  // sibling: when test-user provisioning lands a user with Gmail OAuth,
  // this spec gets a body in the same slice.
});
