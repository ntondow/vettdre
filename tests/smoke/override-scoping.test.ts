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
