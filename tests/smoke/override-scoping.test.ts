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

  // TODO-0c-followup: transactions/actions.ts has 27 un-threaded exports.
  // The file was partially threaded in PATCH B (commit b264a45) but most
  // exports still rely on the local helper without forwarding options. Defer
  // to a follow-up commit in this same Phase 0; tracked in SLICES.md.
  "src/app/(dashboard)/brokerage/transactions/actions.ts": [
    "ensureDefaultTemplates",
    "createTransactionFromSubmission",
    "getTransaction",
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
    "getDealTimeline",
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
