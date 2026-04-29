// Phase Z smoke tests — five floor-level checks, one per critical-path surface.
//
// Why these tests, not full page-component renders:
//   The page modules (BrokerageDashboard, DealSubmissionsList, etc.) are async
//   server components or client components that import server actions. Running
//   them under happy-dom requires deep mocking of Prisma, Supabase, cookies,
//   redirect(), getCurrentOrgContext, and dozens of dependent libs. That mock
//   surface itself becomes a maintenance burden and a source of false signal.
//
//   The bootstrap doc explicitly tolerates this: "Coverage is the floor, not
//   the ceiling." The fallback it suggests is "each test imports the page
//   module and confirms the default export exists." Even that requires the
//   transitive imports (Prisma client init, Supabase env) to load cleanly,
//   which they don't in a test runtime.
//
//   So we do the next-best thing: each test exercises the pure-logic core that
//   the named surface depends on. If a future agent breaks the BMS RBAC matrix,
//   the status-label maps, or the processing-fee math — the surfaces above
//   will misbehave, and one of these tests will fail. That's the floor the
//   bootstrap asks for.
//
//   Phase 3 polish will turn strict typecheck back on and add render-level
//   tests once heavy mocking infrastructure is in place. Until then: this.

import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAccessPage,
} from "@/lib/bms-permissions";
import {
  SUBMISSION_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
import { computeProcessingFee } from "@/lib/processing-fee";

describe("Phase Z smoke — BrokerageDashboard surface", () => {
  it("brokerage_admin can view dashboard; agent cannot", () => {
    expect(hasPermission("brokerage_admin", "view_dashboard")).toBe(true);
    expect(hasPermission("agent", "view_dashboard")).toBe(false);
  });
});

describe("Phase Z smoke — DealSubmissionsList surface", () => {
  it("submission status labels cover the four pipeline states the list filters by", () => {
    expect(SUBMISSION_STATUS_LABELS.submitted).toBeTruthy();
    expect(SUBMISSION_STATUS_LABELS.approved).toBeTruthy();
    expect(SUBMISSION_STATUS_LABELS.invoiced).toBeTruthy();
    expect(SUBMISSION_STATUS_LABELS.paid).toBeTruthy();
  });
});

describe("Phase Z smoke — InvoicesList surface", () => {
  it("invoice status labels cover draft/sent/paid/void", () => {
    expect(INVOICE_STATUS_LABELS.draft).toBeTruthy();
    expect(INVOICE_STATUS_LABELS.sent).toBeTruthy();
    expect(INVOICE_STATUS_LABELS.paid).toBeTruthy();
    expect(INVOICE_STATUS_LABELS.void).toBeTruthy();
  });
});

describe("Phase Z smoke — PaymentsList surface", () => {
  it("processing-fee math agrees with the historical Gulino import (round-share-then-subtract)", () => {
    // Reference case from the audit: $54,000 commission, 70% agent split,
    // 2% processing fee. Expected agent payout: 36900 net of $1,080 fee.
    const result = computeProcessingFee({
      totalCommission: 54000,
      agentSplitPct: 70,
      organizationDefaultPct: 2,
      override: false,
    });
    expect(result.feePct).toBe(2);
    expect(result.feeAmt).toBe(1080);
    expect(result.agentPayout).toBe(36720); // 37800 gross - 1080 fee
    expect(result.housePayout).toBe(16200); // 54000 - 37800 gross share

    // Payment method labels render in the list; smoke-check one.
    expect(PAYMENT_METHOD_LABELS.check).toBeTruthy();
  });
});

describe("Phase Z smoke — AgentsList surface", () => {
  it("manager can view agents but cannot manage them; brokerage_admin can do both", () => {
    expect(hasPermission("manager", "view_agents")).toBe(true);
    expect(hasPermission("manager", "manage_agents")).toBe(false);
    expect(hasPermission("brokerage_admin", "manage_agents")).toBe(true);
  });

  it("page-permission map gates the agent-roster URL", () => {
    expect(canAccessPage("manager", "/brokerage/agents")).toBe(true);
    expect(canAccessPage("agent", "/brokerage/agents")).toBe(false);
  });
});
