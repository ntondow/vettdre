// Slice 7a smoke — agent picker on /brokerage/client-onboarding/new.
//
// Source-level assertions only. The createOnboarding action is Prisma-backed
// and the form is a client component — mounting either under happy-dom would
// require mocking the entire server runtime. The four contracts below verify
// the structural guarantees that matter for B-024:
//
//   (a) plain agent passing a different agentId is rejected → falls back to
//       ctx.agentId via the permission gate
//   (b) cross-org agentId is rejected via re-fetch with where: { id, orgId }
//   (c) manager passing a same-org agentId is honored
//   (d) plain agent role renders read-only "Agent: {Self Name}" label, no
//       <select> in the DOM (conditional render works when permission is
//       absent)

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice 7a — Agent picker on Onboarding form (B-024)", () => {
  const actionsSrc = readSource(
    "src/app/(dashboard)/brokerage/client-onboarding/actions.ts",
  );
  const formSrc = readSource(
    "src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx",
  );
  const typesSrc = readSource("src/lib/onboarding-types.ts");

  it("(setup) ClientOnboardingInput exposes optional agentId", () => {
    expect(typesSrc).toMatch(/agentId\?:\s*string/);
  });

  it("(setup) getAgentRosterForOnboarding is exported", () => {
    expect(actionsSrc).toMatch(
      /^export\s+async\s+function\s+getAgentRosterForOnboarding\b/m,
    );
  });

  it("(a) plain-agent path: createOnboarding falls back to ctx.agentId when caller lacks view_agents", () => {
    // The resolution expression must AND the input.agentId with the
    // view_agents permission. Without that AND, an agent role could pass
    // any agentId and bypass the gate.
    expect(actionsSrc).toMatch(
      /input\.agentId\s*&&\s*hasPermission\(ctx\.role,\s*["']view_agents["']\)[\s\S]{0,80}\?\s*input\.agentId\s*:\s*ctx\.agentId/,
    );
  });

  it("(b) cross-org rejection: createOnboarding re-fetches with where: { id: requestedAgentId, orgId: ctx.orgId }", () => {
    // The findFirst must include both id AND orgId guards. A cross-org
    // agentId fails the findFirst and triggers the "Agent record not found"
    // error path.
    expect(actionsSrc).toMatch(
      /prisma\.brokerAgent\.findFirst\([\s\S]{0,200}where:\s*\{\s*id:\s*requestedAgentId,\s*orgId:\s*ctx\.orgId\s*\}/,
    );
  });

  it("(c) honored manager path: getAgentRosterForOnboarding returns active+pending+invited agents (not just active)", () => {
    // Roster scope rationale per SLICES.md slice 7a: brokerage admins file
    // onboardings on behalf of newly-hired agents BEFORE first login.
    // pending/invited must be in the IN-clause; suspended/terminated must NOT.
    expect(actionsSrc).toMatch(
      /status:\s*\{\s*in:\s*\[\s*["']active["'],\s*["']pending["'],\s*["']invited["']\s*\]\s*\}/,
    );
    expect(actionsSrc).not.toMatch(/status:\s*["']suspended["']/);
    expect(actionsSrc).not.toMatch(/status:\s*["']terminated["']/);
  });

  it("(c-cont) audit log records targetAgentId in metadata so 'who clicked Send' vs 'who the deal is for' stays distinguishable", () => {
    // signingAuditLog.create must include metadata: { targetAgentId: agent.id }.
    // ctx.userId stays in actorId (who clicked Send); agent.id goes in metadata
    // (the resolved target — same as actor in the self-file case, different in
    // the manager-on-behalf case).
    expect(actionsSrc).toMatch(
      /signingAuditLog\.create\([\s\S]{0,400}metadata:\s*\{\s*targetAgentId:\s*agent\.id/,
    );
  });

  it("(d) read-only fallback: form renders a self-label testid when roster is empty, dropdown testid otherwise", () => {
    // The conditional render branches on agentRoster.length. Empty roster →
    // onboarding-agent-self-label (no <select>). Non-empty → onboarding-agent-picker (a <select>).
    expect(formSrc).toMatch(/data-testid=["']onboarding-agent-picker["']/);
    expect(formSrc).toMatch(/data-testid=["']onboarding-agent-self-label["']/);
    // The two test ids must be in opposite branches of the conditional —
    // guard that the picker testid sits in the agentRoster.length > 0 branch.
    expect(formSrc).toMatch(
      /agentRoster\.length\s*>\s*0\s*\?\s*[\s\S]{0,400}data-testid=["']onboarding-agent-picker["']/,
    );
  });

  it("(form-wiring) form passes selectedAgentId into createOnboarding payload", () => {
    expect(formSrc).toMatch(
      /agentId:\s*selectedAgentId\s*\|\|\s*undefined/,
    );
  });
});
