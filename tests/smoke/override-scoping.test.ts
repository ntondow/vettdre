// Slice 0c smoke — verify that BMS server-action surfaces thread the
// super_admin `?as_org=` override option through their helpers and exports.
//
// Why static-source assertions, not runtime calls:
//   The action files are "use server" modules with deep dependencies (Prisma,
//   Supabase auth via headers/cookies, the request referer chain). Loading
//   them under happy-dom would require mocking the entire server runtime, and
//   that mock surface ends up testing the mock more than the code.
//
//   What we *actually* care about for this slice is the contract: every
//   server-action export in these files must accept an `options: { overrideAsOrg?: string }`
//   trailing argument and forward it to a `getCurrentOrgContext`-aware helper.
//   That contract is statically visible in the source. Asserting it here
//   guards against future regressions where someone adds a new export and
//   forgets to thread.
//
// If a new export legitimately should NOT take the override (e.g. it's
// agent-self-service and runs only for the logged-in agent), add it to
// EXEMPT_EXPORTS below with a one-line reason.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const FILES_UNDER_TEST = [
  "src/app/(dashboard)/brokerage/reports/actions.ts",
  "src/app/(dashboard)/brokerage/settings/actions.ts",
  "src/app/(dashboard)/brokerage/commission-plans/actions.ts",
  "src/app/(dashboard)/brokerage/compliance/actions.ts",
  "src/app/(dashboard)/brokerage/dashboard/actions.ts",
  "src/app/(dashboard)/brokerage/agents/actions.ts",
  "src/app/(dashboard)/brokerage/agents/[id]/actions.ts",
  "src/app/(dashboard)/brokerage/invoices/actions.ts",
  "src/app/(dashboard)/brokerage/transactions/actions.ts",
  "src/app/(dashboard)/brokerage/deal-submissions/actions.ts",
  "src/app/(dashboard)/brokerage/payments/actions.ts",
  "src/app/(dashboard)/brokerage/leaderboard/actions.ts",
  "src/app/(dashboard)/brokerage/reports/revenue/actions.ts",
  // Slice 0c3: detail-route surfaces.
  "src/app/(dashboard)/brokerage/client-onboarding/actions.ts",
  "src/app/(dashboard)/brokerage/listings/actions.ts",
  // Slice 22-as-org-vault: vault server actions.
  "src/app/(dashboard)/brokerage/client-onboarding/vault-actions.ts",
];

// Exports that intentionally do NOT take the override (agent-self-service
// surfaces, internal helpers, public token-flows, etc.). Add with a comment
// explaining why. Anything tagged TODO-0c-followup is a real surface that
// should be threaded — left out to keep the slice scope manageable; track in
// SLICES.md and tighten in a follow-up commit.
const EXEMPT_EXPORTS: Record<string, string[]> = {
  // Pure validator — no DB, no auth.
  "src/app/(dashboard)/brokerage/invoices/actions.ts": ["validateExcelData"],

  // Internal helpers consumed by other exports in the same file with explicit
  // agentId; they don't read orgId from auth themselves.
  "src/app/(dashboard)/brokerage/leaderboard/actions.ts": [
    "calculateAgentActuals",
    "calculateStreak",
    "checkAndAwardBadges",
    "awardMonthlyBadges",
  ],

  // Public submission flows — token-authenticated, no logged-in user, no
  // ?as_org= concept. Auth is the submission token, not the cookie session.
  "src/app/(dashboard)/brokerage/deal-submissions/actions.ts": [
    "submitDeal",                  // public form via /submit-deal/[token]
    "createPublicDealSubmission",  // token issuance
    "getPublicSubmissionLink",     // generates URL
    "regenerateSubmissionToken",   // token refresh
    // TODO-0c-followup: genuinely auth'd surfaces — thread override in next pass:
    "quickAddProperty",
    "getAgentSplitForDeal",
  ],

  // Public token-flow (signing page). No logged-in user, no ?as_org concept.
  "src/app/(dashboard)/brokerage/client-onboarding/actions.ts": [
    "getOnboardingPublic", // public via /sign/[token]
    // TODO-0c3-followup: createOnboarding ties the onboarding document to the
    // calling agent's identity — overriding org while keeping the agent record
    // has legal/audit implications. Defer until product clarifies whether
    // super_admin can create on behalf of another org's agent.
    "createOnboarding",
  ],

  // Slice 0c3 deferred:
  //  - bulkCreateListings is an admin import path that uses ctx.orgId only;
  //    threading is a follow-up cleanup, not blocking the detail-route fix.
  //  - getPropertySummaries / fuzzyMatchProperties / fuzzyMatchAgents are
  //    typeahead helpers consumed by the create flows; thread when those flows
  //    are revisited.
  "src/app/(dashboard)/brokerage/listings/actions.ts": [
    "bulkCreateListings",
    "getPropertySummaries",
    "fuzzyMatchProperties",
    "fuzzyMatchAgents",
  ],

  // TODO-0c-followup: transactions/actions.ts has 25 un-threaded exports.
  // The file was partially threaded in PATCH B (commit b264a45) and slice 0c3
  // threaded the read paths (getTransaction, getDealTimeline) used by the
  // transaction detail page. Most write exports still rely on the local helper
  // without forwarding options. Defer to a follow-up commit; tracked in
  // SLICES.md.
  "src/app/(dashboard)/brokerage/transactions/actions.ts": [
    "ensureDefaultTemplates",
    "createTransactionFromSubmission",
    "updateTransaction",
    "advanceStage",
    "revertStage",
    "cancelTransaction",
    "toggleTask",
    "addTask",
    "updateTask",
    "deleteTask",
    "reorderTasks",
    "getTemplates",
    "getRecentActiveTransactions",
    "linkInvoiceToTransaction",
    "createInvoiceFromTransaction",
    "recordAgentPayout",
    "addAgentToSplit",
    "removeAgentFromSplit",
    "updateTransactionAgentSplit",
    "updateAgentSplit",
    "recordAgentSplitPayout",
    "getTransactionAgents",
    "markCommissionReceived",
    "syncTransactionFromInvoice",
    "getAgentPayoutSummary",
  ],
};

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function listExports(src: string): string[] {
  const re = /^export\s+async\s+function\s+([A-Za-z0-9_]+)/gm;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

function helperThreadsOverride(src: string): boolean {
  // Look for a local helper that takes `options: { overrideAsOrg?: string }`
  // and forwards it via getCurrentOrgContext(options) — OR for the file to
  // import and use getCurrentOrgContext directly with that arg.
  const localHelper = /async\s+function\s+\w+\s*\(\s*options\s*:\s*\{\s*overrideAsOrg\?\s*:\s*string\s*\}/;
  const directCall = /getCurrentOrgContext\s*\(\s*options/;
  return localHelper.test(src) || directCall.test(src);
}

function exportThreadsOverride(src: string, exportName: string): boolean {
  // Walk from `export async function NAME(` to the matching closing paren and
  // check that the signature includes `overrideAsOrg`. Regex-based; not a full
  // parser, but the project's style is consistent enough for this to work.
  const startRe = new RegExp(`export\\s+async\\s+function\\s+${exportName}\\s*\\(`);
  const m = startRe.exec(src);
  if (!m) return false;
  let depth = 1;
  let i = m.index + m[0].length;
  const end = src.length;
  while (i < end && depth > 0) {
    const c = src[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    i += 1;
  }
  const sig = src.slice(m.index, i);
  return /overrideAsOrg/.test(sig);
}

describe("Slice 0c — override threading on BMS action surfaces", () => {
  for (const file of FILES_UNDER_TEST) {
    describe(file, () => {
      const src = readSource(file);

      it("has a getCurrentOrgContext-aware auth helper or direct usage", () => {
        expect(helperThreadsOverride(src)).toBe(true);
      });

      const exempt = EXEMPT_EXPORTS[file] ?? [];
      const exports = listExports(src).filter((e) => !exempt.includes(e));
      it(`every export accepts overrideAsOrg (${exports.length} exports)`, () => {
        const missing = exports.filter((e) => !exportThreadsOverride(src, e));
        expect(
          missing,
          `Exports without overrideAsOrg in ${file}: ${missing.join(", ")}. ` +
            `Add the param or list the export in EXEMPT_EXPORTS with a reason.`,
        ).toEqual([]);
      });
    });
  }
});

// ── Slice 0c3: detail-route page-level threading ─────────────
//
// Each BMS detail page reachable via row-click from a list page that supports
// `?as_org=X` must thread the override into its action calls so that the page
// loads the correct org's record. We assert this statically:
//
//   1. The page imports `useSearchParams` from next/navigation.
//   2. The page reads `as_org` and computes an `overrideOpts` value.
//   3. The page passes `overrideOpts` to at least one action call.
//
// If a detail page legitimately doesn't take override (e.g. the list page that
// owns it doesn't support override either), don't add it here.
const DETAIL_PAGES_UNDER_TEST = [
  "src/app/(dashboard)/brokerage/agents/[id]/page.tsx",
  "src/app/(dashboard)/brokerage/transactions/[id]/page.tsx",
  "src/app/(dashboard)/brokerage/client-onboarding/[id]/page.tsx",
  "src/app/(dashboard)/brokerage/listings/[id]/page.tsx",
  "src/app/(dashboard)/brokerage/listings/properties/[id]/page.tsx",
];

describe("Slice 0c3 — detail-page override threading", () => {
  for (const file of DETAIL_PAGES_UNDER_TEST) {
    describe(file, () => {
      const src = readSource(file);

      it("imports useSearchParams from next/navigation", () => {
        expect(src).toMatch(
          /import\s*\{[^}]*useSearchParams[^}]*\}\s*from\s*["']next\/navigation["']/,
        );
      });

      it("reads as_org from search params and computes overrideOpts", () => {
        expect(src).toMatch(/as_org/);
        expect(src).toMatch(/overrideOpts/);
      });

      it("passes overrideOpts to at least one action call", () => {
        // Match `someAction(arg1, ..., overrideOpts)` — the override must
        // appear inside an actual call, not just as a declaration.
        expect(src).toMatch(/[a-zA-Z]\w*\([^)]*\boverrideOpts\b[^)]*\)/);
      });
    });
  }
});

// ── Slice 1: Pending Approval queue contracts ────────────────
//
// approveAndCreateInvoice is the manager's atomic primary CTA. Three contracts
// matter for the audit + invoice flow and are easy to regress:
//
//  1. The action exists, is exported, and accepts overrideAsOrg.
//  2. It writes ONE consolidated submission audit row, action="approved_and_invoiced",
//     not the older "approved" + "invoiced" pair from chained calls.
//  3. The invoice + transaction inserts run inside a single prisma.$transaction
//     with explicit timeout config (so partial failures roll back cleanly).
//
// rejectSubmission must require a non-empty trimmed reason at the server (the
// agent timeline shows the reason verbatim — empty produces a useless trail).

describe("Slice 1 — Pending Approval queue", () => {
  const src = readSource("src/app/(dashboard)/brokerage/deal-submissions/actions.ts");

  it("exports approveAndCreateInvoice with overrideAsOrg threading", () => {
    expect(src).toMatch(/^export\s+async\s+function\s+approveAndCreateInvoice\b/m);
    expect(exportThreadsOverride(src, "approveAndCreateInvoice")).toBe(true);
  });

  it("writes a single submission audit row tagged 'approved_and_invoiced'", () => {
    // The string must appear as the action argument to logSubmissionAction —
    // a bare match would also catch comments. We require it inside a
    // logSubmissionAction(... "approved_and_invoiced" ...) call.
    expect(src).toMatch(/logSubmissionAction\([^)]*"approved_and_invoiced"/);
    // And no chained "approved" + "invoiced" pair from the new action — guard
    // by asserting the new action body contains the consolidated kind.
    const body = src.slice(src.indexOf("approveAndCreateInvoice"));
    expect(body).toMatch(/"approved_and_invoiced"/);
  });

  it("wraps invoice + transaction inserts in prisma.$transaction with timeout", () => {
    const body = src.slice(src.indexOf("approveAndCreateInvoice"));
    // $transaction(async (tx) => {...}, { timeout, maxWait })
    expect(body).toMatch(/prisma\.\$transaction\s*\(\s*async\s*\(\s*tx/);
    expect(body).toMatch(/timeout:\s*\d+/);
  });

  it("rejectSubmission requires a non-empty trimmed reason", () => {
    // The validation must happen before the auth/DB calls so unauthenticated
    // requests don't reveal whether the submission exists.
    const body = src.slice(src.indexOf("export async function rejectSubmission"));
    expect(body).toMatch(/reason\?\.trim\(\)/);
    expect(body).toMatch(/A rejection reason is required/);
  });
});

// ── Slice 1c: card-grid + inline-expand UI restructure ───────
//
// 1c is purely visual restructure but the visual contract has structural
// implications that are easy to regress later: cards, inline-expand body,
// the three-button footer attached to the expand (not the slide-over),
// the placeholder Invoice/Payment tabs (so 2/3 know where to plug in),
// and the absence of the deleted KPI strip.
//
// Source-level assertions only. Rendering the dashboard requires Prisma +
// Supabase + cookies — same justification as the 0c block above.

describe("Slice 1c — card-grid layout", () => {
  const dashSrc = readSource(
    "src/app/(dashboard)/brokerage/deal-submissions/submissions-dashboard.tsx",
  );

  it("uses SubmissionCard from the components dir (not a <table>)", () => {
    expect(dashSrc).toMatch(
      /import\s*\{[^}]*SubmissionCard[^}]*\}\s*from\s*["']\.\/components\/submission-card["']/,
    );
    // The slice 1 implementation rendered a real <table>. Make sure the
    // rewrite removed it so future drift back to a table fails this guard.
    expect(dashSrc).not.toMatch(/<table\b/);
    expect(dashSrc).not.toMatch(/<tbody\b/);
  });

  it("renders DetailTabs with all three keys present", () => {
    const tabsSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/components/detail-tabs.tsx",
    );
    // The structural contract for 1c was "tabs exist". Slice 2 flipped
    // Invoice live; slice 3 flipped Payment live — the placeholder copy
    // checks moved into the slice 2/3 blocks. Here we just guard the
    // shape: all three keys remain so the tab strip never silently
    // collapses to a single tab.
    expect(tabsSrc).toMatch(/key:\s*"details"/);
    expect(tabsSrc).toMatch(/key:\s*"invoice"/);
    expect(tabsSrc).toMatch(/key:\s*"payment"/);
  });

  it("relocates the three-button footer onto the inline-expanded card", () => {
    // The buttons live in the parent dashboard (state lives there) but they
    // must render inside the inline-expand block, not inside a slide-over
    // panel. The slide-over wrapper from slice 1 is gone in 1c.
    expect(dashSrc).toMatch(/Approve\s*&amp;\s*Push to Invoice/);
    expect(dashSrc).toMatch(/Approve only/);
    // Slide-over panel chrome that 1c removed.
    expect(dashSrc).not.toMatch(/translate-x-full/);
    expect(dashSrc).not.toMatch(/Detail Slide-Over Panel/);
  });

  it("drops the redundant KPI strip (audit U-021)", () => {
    // The four StatCard cards in the previous header strip would each
    // reference these labels. None should remain.
    expect(dashSrc).not.toMatch(/Total Submissions/);
    expect(dashSrc).not.toMatch(/Pending Review/);
    expect(dashSrc).not.toMatch(/Commission Pending/);
    // "Paid Out" was the rightmost StatCard label.
    expect(dashSrc).not.toMatch(/label="Paid Out"/);
  });

  it("provides EmptyState ('All caught up') and RecentlyApprovedRail components", () => {
    const emptySrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/components/empty-state.tsx",
    );
    expect(emptySrc).toMatch(/All caught up/);
    expect(dashSrc).toMatch(
      /import\s*\{[^}]*EmptyState[^}]*\}\s*from\s*["']\.\/components\/empty-state["']/,
    );
    expect(dashSrc).toMatch(
      /import\s*\{[^}]*RecentlyApprovedRail[^}]*\}\s*from\s*["']\.\/components\/recently-approved-rail["']/,
    );
  });
});

// ── Slice 2: Invoice tab inside inline-expanded card ─────────
//
// Slice 2 contracts:
//   1. getInvoiceForSubmission is exported and threads overrideAsOrg.
//      Without override threading, super_admin viewing org A would silently
//      see org B's invoice on click — same regression class as 0c3.
//   2. sendInvoiceToAgent is exported and threads overrideAsOrg, AND has the
//      idempotent "resent" path: re-call when status === "sent" must skip the
//      status flip but still write a "resent" audit row + re-fire email.
//   3. InvoiceTab is wired into submissions-dashboard for activeTab==="invoice"
//      (replaces the "Invoice tab coming soon" placeholder from 1c).
//   4. The Resend lib's SendParams accepts an optional cc field — the per-org
//      "CC the brokerage on invoice send" toggle depends on it.
//   5. Org bms settings include ccBrokerageOnInvoiceSend and the settings UI
//      surfaces a toggle for it under the Defaults tab.
describe("Slice 2 — Invoice tab", () => {
  const src = readSource(
    "src/app/(dashboard)/brokerage/deal-submissions/actions.ts",
  );

  it("exports getInvoiceForSubmission with overrideAsOrg threading", () => {
    expect(src).toMatch(/^export\s+async\s+function\s+getInvoiceForSubmission\b/m);
    expect(exportThreadsOverride(src, "getInvoiceForSubmission")).toBe(true);
    // It joins through Transaction so the "sent" timestamp (Transaction.invoiceSentAt)
    // surfaces — the schema doesn't have Invoice.sentAt directly.
    const body = src.slice(src.indexOf("export async function getInvoiceForSubmission"));
    expect(body).toMatch(/transaction:\s*\{\s*select:\s*\{\s*invoiceSentAt:\s*true/);
  });

  it("exports sendInvoiceToAgent with idempotent resend contract", () => {
    expect(src).toMatch(/^export\s+async\s+function\s+sendInvoiceToAgent\b/m);
    expect(exportThreadsOverride(src, "sendInvoiceToAgent")).toBe(true);
    const body = src.slice(src.indexOf("export async function sendInvoiceToAgent"));
    // Resend writes the "resent" audit kind (so it shows up in invoice history).
    expect(body).toMatch(/logInvoiceAction\([^)]*"resent"/);
    // Detection of the resend path — must read invoice.status === "sent" before
    // deciding whether to flip status.
    expect(body).toMatch(/invoice\.status\s*===\s*"sent"/);
    // The first-send case must call updateInvoiceStatus to keep
    // Transaction.invoiceSentAt + transaction-stage sync in lockstep.
    expect(body).toMatch(/updateInvoiceStatus/);
  });

  it("wires InvoiceTab into the dashboard for activeTab='invoice'", () => {
    const dashSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/submissions-dashboard.tsx",
    );
    expect(dashSrc).toMatch(
      /import\s*\{[^}]*InvoiceTab[^}]*\}\s*from\s*["']\.\/components\/invoice-tab["']/,
    );
    // The placeholder that 1c shipped under activeTab !== "details" is gone —
    // the invoice branch must render <InvoiceTab>, not the "coming soon" copy.
    expect(dashSrc).not.toMatch(/Invoice tab coming soon/);
    expect(dashSrc).toMatch(/activeTab\s*===\s*"invoice"[\s\S]*?<InvoiceTab\b/);
  });

  it("InvoiceTab renders the documented empty + populated states", () => {
    const tabSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/components/invoice-tab.tsx",
    );
    // Three states from the prep doc: rejected → red empty, pre-invoiced → no-yet,
    // populated → header + dates + amounts.
    expect(tabSrc).toMatch(/data-testid="invoice-tab-empty-rejected"/);
    expect(tabSrc).toMatch(/data-testid="invoice-tab-empty"/);
    expect(tabSrc).toMatch(/data-testid="invoice-tab-populated"/);
    // Send button is the resend-aware CTA — flips label based on status.
    expect(tabSrc).toMatch(/data-testid="invoice-tab-send-button"/);
    expect(tabSrc).toMatch(/getInvoiceForSubmission\b/);
    expect(tabSrc).toMatch(/sendInvoiceToAgent\b/);
  });

  it("Resend lib's SendParams accepts cc + bms settings expose ccBrokerageOnInvoiceSend", () => {
    const resendSrc = readSource("src/lib/resend.ts");
    expect(resendSrc).toMatch(/cc\?:\s*string\s*\|\s*string\[\]/);
    const bmsTypesSrc = readSource("src/lib/bms-types.ts");
    expect(bmsTypesSrc).toMatch(/ccBrokerageOnInvoiceSend\?:\s*boolean/);
    const settingsSrc = readSource(
      "src/app/(dashboard)/brokerage/settings/actions.ts",
    );
    expect(settingsSrc).toMatch(/ccBrokerageOnInvoiceSend/);
    const settingsPageSrc = readSource(
      "src/app/(dashboard)/brokerage/settings/page.tsx",
    );
    // UI control exists under the Defaults tab.
    expect(settingsPageSrc).toMatch(/id="ccBrokerageOnInvoiceSend"/);
  });
});

// ── Slice 3: Payment tab inside inline-expanded card ─────────
//
// Slice 3 contracts:
//   1. recordPaymentForInvoice is exported and threads overrideAsOrg.
//      It wraps the existing /brokerage/payments recordPayment action
//      (validation + balance math + auto-flip-to-paid live there) and
//      adds an invoice audit row. Wrapper-not-rewrite is the contract.
//   2. The wrapper writes "payment_recorded" or
//      "payment_recorded_paid_in_full" via logInvoiceAction so the
//      audit trail distinguishes balance-closing payments.
//   3. PaymentTab is wired into submissions-dashboard for activeTab="payment".
//      Replaces the "Payment tab coming soon" 1c placeholder.
//   4. PaymentTab renders all four documented states (pre-invoiced empty,
//      record-payment form, populated history, voided).
//   5. detail-tabs.tsx flips Payment from enabled:false → enabled:true.
//      No tabs left disabled in 3.
describe("Slice 3 — Payment tab", () => {
  const src = readSource(
    "src/app/(dashboard)/brokerage/deal-submissions/actions.ts",
  );

  it("exports recordPaymentForInvoice with overrideAsOrg threading", () => {
    expect(src).toMatch(
      /^export\s+async\s+function\s+recordPaymentForInvoice\b/m,
    );
    expect(exportThreadsOverride(src, "recordPaymentForInvoice")).toBe(true);
    const body = src.slice(
      src.indexOf("export async function recordPaymentForInvoice"),
    );
    // Wrapper, not rewrite — must call the existing recordPayment from
    // /brokerage/payments/actions, not roll its own balance math.
    expect(body).toMatch(/await\s+import\(["']\.\.\/payments\/actions["']\)/);
    expect(body).toMatch(/recordPayment\s*\(/);
  });

  it("writes a balance-aware audit row via logInvoiceAction", () => {
    const body = src.slice(
      src.indexOf("export async function recordPaymentForInvoice"),
    );
    // Both the partial-payment kind and the balance-closing kind must
    // exist in the wrapper so the audit log distinguishes them.
    expect(body).toMatch(/"payment_recorded_paid_in_full"/);
    expect(body).toMatch(/"payment_recorded"/);
    expect(body).toMatch(/logInvoiceAction\(/);
  });

  it("wires PaymentTab into the dashboard for activeTab='payment'", () => {
    const dashSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/submissions-dashboard.tsx",
    );
    expect(dashSrc).toMatch(
      /import\s*\{[^}]*PaymentTab[^}]*\}\s*from\s*["']\.\/components\/payment-tab["']/,
    );
    // The "Payment tab coming soon" placeholder must be gone.
    expect(dashSrc).not.toMatch(/Payment tab coming soon/);
    expect(dashSrc).toMatch(/activeTab\s*===\s*"payment"[\s\S]*?<PaymentTab\b/);
  });

  it("PaymentTab renders the four documented states", () => {
    const tabSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/components/payment-tab.tsx",
    );
    // Pre-invoiced empty (with push-to-invoice CTA — same pattern as Invoice tab).
    expect(tabSrc).toMatch(/data-testid="payment-tab-empty-no-invoice"/);
    expect(tabSrc).toMatch(/Push this submission to an invoice/);
    // Voided invoice — no payment activity expected.
    expect(tabSrc).toMatch(/data-testid="payment-tab-void"/);
    // Populated state with balance summary, history list, and form.
    expect(tabSrc).toMatch(/data-testid="payment-tab-populated"/);
    expect(tabSrc).toMatch(/data-testid="payment-tab-balance"/);
    expect(tabSrc).toMatch(/data-testid="payment-tab-form"/);
    expect(tabSrc).toMatch(/recordPaymentForInvoice\b/);
  });

  it("detail-tabs.tsx enables Payment tab (no tabs left disabled)", () => {
    const tabsSrc = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/components/detail-tabs.tsx",
    );
    // The 1c placeholder hint copy must be gone — both Invoice and Payment
    // are live tabs in slice 3.
    expect(tabsSrc).not.toMatch(/Available after Slice 2/);
    expect(tabsSrc).not.toMatch(/Available after Slice 3/);
    // No `enabled: false` flags left anywhere.
    expect(tabsSrc).not.toMatch(/enabled:\s*false/);
  });
});

// ── Slice 1.5: Sidebar count badge for Submissions ──────────
//
// Slice 1.5 contracts:
//   1. getSubmittedCount is exported from deal-submissions/actions and
//      threads overrideAsOrg. Without override threading the badge would
//      show the super_admin's home-org count when viewing a target
//      tenant — same regression class as 0c3.
//   2. The brokerage layout renders a numeric badge next to the
//      Submissions item, hidden when count is zero, and rendered in
//      both the desktop sidebar and the mobile pill bar.
//   3. Layout reads `?as_org` so the badge stays correct under
//      super_admin override.
describe("Slice 1.5 — Sidebar count badge", () => {
  it("getSubmittedCount is exported with override threading + permission gate", () => {
    const src = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/actions.ts",
    );
    expect(src).toMatch(/^export\s+async\s+function\s+getSubmittedCount\b/m);
    expect(exportThreadsOverride(src, "getSubmittedCount")).toBe(true);
    const body = src.slice(src.indexOf("export async function getSubmittedCount"));
    // Permission-gated so agents don't see an org-wide count.
    expect(body).toMatch(/hasPermission\([^)]*"view_all_submissions"/);
    // Counts only "submitted" status.
    expect(body).toMatch(/status:\s*"submitted"/);
  });

  it("brokerage layout renders the badge + reads ?as_org", () => {
    const src = readSource("src/app/(dashboard)/brokerage/layout.tsx");
    expect(src).toMatch(
      /import\s*\{[^}]*getSubmittedCount[^}]*\}\s*from\s*["']\.\/deal-submissions\/actions["']/,
    );
    expect(src).toMatch(/useSearchParams/);
    expect(src).toMatch(/as_org/);
    // Badge surface is keyed by href so other items (Compliance,
    // Invoices) can pick up the same channel without touching render.
    expect(src).toMatch(/badges\[item\.href\]/);
    // Hidden when zero.
    expect(src).toMatch(/badge\s*&&\s*badge\s*>\s*0/);
    // Both desktop + mobile render the same testid hook.
    expect(src).toMatch(
      /data-testid=\{`brokerage-nav-badge-\$\{item\.href\}`\}/,
    );
  });
});

describe("Slice 0c — auth-context priority", () => {
  it("getCurrentOrgContext consumes options.overrideAsOrg before referer fallback", () => {
    // Source-level guard: the priority comment + code line must coexist. If
    // someone reorders this in auth-context.ts, the test fails as a heads-up.
    const src = readSource("src/lib/auth-context.ts");
    expect(src).toMatch(/Explicit param wins over referer/);
    expect(src).toMatch(
      /options\.overrideAsOrg\s*\?\?\s*\(?\s*await\s+readAsOrgFromReferer/,
    );
  });
});

// ── Phase 4 slice — /deal-submissions redirect hardening ──────
//
// Three contracts lock in the fix for the slice-0c-class regression where
// /brokerage/deal-submissions's redirect-on-permission-fail dropped the
// ?as_org= override on the way to /my-deals, plus the canAccessPage agent
// special case that contradicted the page's own redirect.
describe("Phase 4 — /deal-submissions redirect hardening", () => {
  it("page.tsx preserves ?as_org= when redirecting to /my-deals", () => {
    // Latent slice-0c-class bug: super_admin shouldn't hit this branch on
    // current main (line-25 short-circuit in bms-auth.ts), but if any role
    // does, the override must survive the redirect. Static-source guard is
    // sufficient — the redirect is a one-line call we just want to ensure
    // threads as_org into the URL.
    const src = readSource(
      "src/app/(dashboard)/brokerage/deal-submissions/page.tsx",
    );
    // Must call redirect with a conditional that includes as_org in the URL
    // when present. Match either ternary or template-literal styles.
    expect(src).toMatch(
      /redirect\(\s*as_org\s*\?\s*`\/brokerage\/my-deals\?as_org=\$\{[^}]*as_org[^}]*\}`\s*:\s*"\/brokerage\/my-deals"/,
    );
  });

  it("canAccessPage requires view_all_submissions for /brokerage/deal-submissions (no agent shortcut)", async () => {
    // The page itself redirects agents to /my-deals, so canAccessPage must
    // agree: agents cannot access this page. Locks in the removal of the
    // pre-Phase-4 special case at bms-permissions.ts:65-68.
    const { canAccessPage } = await import("../../src/lib/bms-permissions");
    expect(canAccessPage("agent", "/brokerage/deal-submissions")).toBe(false);
    expect(canAccessPage("brokerage_admin", "/brokerage/deal-submissions")).toBe(true);
    expect(canAccessPage("manager", "/brokerage/deal-submissions")).toBe(true);
    expect(canAccessPage("broker", "/brokerage/deal-submissions")).toBe(true);

    // Source-level guard against re-introducing the special case.
    const src = readSource("src/lib/bms-permissions.ts");
    expect(src).not.toMatch(
      /Special case:\s*agents can access deal-submissions/,
    );
    expect(src).not.toMatch(
      /page\s*===\s*"\/brokerage\/deal-submissions"\s*&&\s*role\s*===\s*"agent"/,
    );
  });

  it("super_admin → brokerage_admin path: brokerage_admin has view_all_submissions", async () => {
    // bms-auth.ts:25 short-circuits super_admin (and owner/admin) to the
    // brokerage_admin role. This contract locks in the permission table side:
    // brokerage_admin must have view_all_submissions, otherwise the
    // short-circuit silently breaks the deal-submissions page for super_admin.
    const { hasPermission } = await import("../../src/lib/bms-permissions");
    expect(hasPermission("brokerage_admin", "view_all_submissions")).toBe(true);

    // Source-level guard that the line-25 short-circuit still exists in
    // bms-auth.ts. If someone deletes it without thinking through what
    // happens to super_admin's BMS access, this test fails.
    const src = readSource("src/lib/bms-auth.ts");
    expect(src).toMatch(
      /user\.role\s*===\s*"owner"\s*\|\|\s*user\.role\s*===\s*"admin"\s*\|\|\s*user\.role\s*===\s*"super_admin"[\s\S]*?return\s+"brokerage_admin"/,
    );
  });
});
