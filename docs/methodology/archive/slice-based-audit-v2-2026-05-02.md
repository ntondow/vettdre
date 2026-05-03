# Slice-Based Audit Methodology (v2)

**Status:** durable. This doc is the playbook for any VettdRE audit — single area or site-wide. It does NOT contain status snapshots; status lives in `SLICES.md`, area-level audit docs in `docs/handoff/<area>-audit-<date>.md`, and stakeholder-facing rollup in Asana.

**v2 changes from the v1 narrative (uploaded `slice-methodology.md`, 2026-05-02):**
- Adds **Phase Z** as a required setup phase before any audit starts.
- Splits tracking into **two tiers**: Asana for stakeholders, SLICES.md for agents.
- Adds **agent swarm patterns** with explicit rules about where to swarm and where to stay serial.
- Promotes **playwright e2e harness** from "nice to have" to required infrastructure.
- Adds **migration registry** as a single source of truth for prod data changes.
- Removes the BMS-specific status snapshot (lives in SLICES.md and Asana now).

---

## When to use this methodology

Use it for any audit-and-fix workstream where:

1. The scope is large enough that a single PR is insufficient (3+ slices likely).
2. The work touches production data or user-visible flows.
3. Multiple bugs / improvements need ordering by dependency or risk.
4. Stakeholder visibility matters (you'll need to report progress to non-developers).

For one-off bug fixes or small features, skip this — open a PR directly.

---

## Core principles (carried from v1)

### 1. Slice = one PR = one shippable unit

~280-line target per slice. Hard ceiling at 300; if the math is fiddly and comments earn their lines, ship it but file a Phase 5 stub for any deferred work surfaced during implementation. If a slice would land at 450+ lines, split it into A/B halves before coding.

Branch off `origin/main`, PR back to `main`, **delete the branch after merge**. No long-lived integration branches — the late-April BMS P0 (15 unmerged slices rolled back when PR-A merged from main) proved this pattern is unsafe.

### 2. Plan-of-record before code

Most important pattern. Never let an agent jump straight to coding.

Flow:
1. You write a kickoff prompt with: goal, files likely involved, implementation intent, constraints, discovery instructions, stop conditions.
2. Agent reads files (no code writing), reports findings with file paths + line numbers + bug shape.
3. Agent proposes a plan-of-record with: file changes, smoke contract ideas, line estimate, stop conditions.
4. You approve, refine, or reject.
5. ONLY THEN does the agent write code.

Catches three things every time: agents misreading the bug, agents proposing implementations that don't match the actual file structure, agents missing edge cases that you'd spot with a fresh eye.

### 3. Smoke contracts

Every slice ships smoke tests as regex pins on critical patterns in the code. Both positive ("must contain X") and negative ("must NOT contain Y") assertions. The point isn't to test behavior — it's to lock in the spirit of the fix structurally so future reverts trip a contract.

Patterns that work:
- **Positive structural pin** on handler shape: `/onPointerDown=\{\(e\)\s*=>\s*handleFieldPointerDown\(e,\s*field\.id\)\}/`
- **Negative pin against pre-fix shape**: `/minHeight:\s*field\.prefillKey\s*\?\s*["']16px["']\s*:\s*["']44px["']/`
- **Negative pin against entire approach drift**: `/onMouseDown=\{/` on signing UI components catches anyone introducing parallel mouse handlers.
- **Cardinality pins**: `expect(matches.length).toBeGreaterThanOrEqual(2)` for "must appear in both mobile and desktop render paths."

Tighten regexes to avoid matching JSX comments. Anchor regex to literal JSX prop syntax (`={`, `\?`) that doesn't appear in comment text.

### 4. Stop conditions

Every kickoff prompt lists explicit triggers for "pause and ask in chat." Cheap insurance — falling back to chat for anything unclear is faster than discovering a bad assumption mid-PR.

Stop conditions that should always fire:
- Financial KPI changes (commission tiers, payouts, revenue calcs) — needs stakeholder conversation, not a code-only switch.
- Migration safety triggers (matched count > expected, customizations might be clobbered).
- Contract relaxation in another slice's tests — surface explicitly in PR body.
- Approach pivots (agent discovers a different implementation is required) — propose options, wait.
- Line count exceeds 280 — propose split.
- Security boundary touched (auth, RBAC, RLS, CSP) — never silent.

### 5. Migration safety

When a slice modifies production data, the migration script MUST have:

- **Dry-run default ON** — `--apply` must be explicit.
- **JSON backup before writes** — timestamped file capturing pre-state of every modified row.
- **Exact-match guards** — only modify rows matching the known-bad signature exactly. Preserves manual UI customizations.
- **Idempotency** — re-running with same flags produces no changes.
- **Per-row logging with org name** — `[OK] templateId=X orgId=Y (org="Z")`.
- **Skip-with-reason** — log why each non-matching row was preserved.
- **Final summary line** — `Done. Succeeded: N, Failed: M, Skipped: K` plus rollback path.

See `Migration script skeleton` below.

### 6. Production verification loop

After merge + deploy, verify in real prod via Chrome MCP. Three modes:

- **UI smoke** — Chrome MCP navigates, clicks, screenshots, confirms visible state.
- **Structural verification via JS console** — when CDP can't synthesize the necessary events (e.g. Pointer Events for drag/resize), use `mcp__Claude_in_Chrome__javascript_tool` to inspect React state, DOM children, computed styles.
- **DB-level verification via prisma script** — when UI access is blocked, write a quick prisma script in an async IIFE: `(async () => { ... await prisma.$disconnect(); })()` and pipe via `npx dotenv-cli -e .env.local -- npx tsx -e '...'`.

Don't skip verification. Smoke contracts pass + deploy succeeds is not the same as "feature works in prod."

### 7. Phase 5 stubs

Anything you choose NOT to do gets a stub in SLICES.md (and a corresponding Asana card if stakeholder input is needed). Stub captures:
- **Background** — what the bug is and which slice surfaced it.
- **Why deferred** — what's blocking; usually requires stakeholder input or has higher-than-expected blast radius.
- **Required input before slicing** — explicit list of what needs to happen.
- **Affected surfaces** — preliminary list so future-you can scope without re-doing discovery.

Filing the stub keeps the work captured without blocking the current slice.

### 8. Push back on agents

Agents are confident even when wrong. When something feels off, ask. The clarification cost is one message; the cost of shipping a half-fix is much larger.

Two patterns that have caught real bugs:
- Z-order / DOM order claims (agents often assert the opposite of CSS painting rules — verify against the actual rule).
- "First proposal" rendering path (agents sometimes propose fixing only the most visible code path; ask whether other paths render the same component).

### 9. Measurement discipline

Before claiming a baseline number ("typecheck holds at N", "lint at M"), the measurement must be both clean and cross-checked.

**Clean:** `git stash` does NOT stash untracked files by default. Use `git stash --include-untracked` when measuring pre-slice baseline. Run from clean working tree when anchoring a new baseline.

**Cross-checked:** if your measurement doesn't match the previously-tracked baseline — even when the direction is improvement — surface the gap in chat **before** moving past it. Don't anchor silently to your own number. Same rule both directions: if a measurement looks suspiciously clean, assume contamination first, real cleanup second.

---

## Phase structure

Every audit follows this lifecycle:

```
Phase Z (setup)         → infra, baselines, tooling
Phase 0 (discovery)     → audit, no code writing
Phase 1..N (execution)  → slices grouped by area / theme
Phase N+1 (closeout)    → final verification, baseline diff, archive
```

Inside each phase, slices run **serial by default**, **parallel only where files truly disjoint**.

### Phase Z — Setup (NEW in v2)

Before any audit work begins, ensure these exist:

1. **Asana board** for the audit, with one card per area + one column per phase.
2. **Audit doc** at `docs/handoff/<audit-name>-<date>.md`. Empty header is fine; Phase 0 fills it.
3. **SLICES.md** entries for the audit (or a per-audit `SLICES-<name>.md` if it gets crowded).
4. **Migration registry** at `migrations/registry.json` if the audit will touch prod data. (Append-only log of every migration: date, slice ID, model, rows touched, backup path, verified Y/N.)
5. **Playwright harness** for top critical flows — login, create deal, send invoice, sign onboarding, book showing. If the harness doesn't exist yet for VettdRE, building it is the first slice of Phase Z.
6. **Sentry Performance** enabled (or equivalent) so post-deploy traces are queryable.
7. **Lint + typecheck baselines** anchored. Record the current numbers. Future slices must hold or improve.

Phase Z slices are infra-only and shipped serially. They never touch product surfaces.

### Phase 0 — Discovery

**No code writing.** Read-only. Output is a markdown audit doc.

Workflow:
1. Log into prod as super_admin via real account.
2. Walk every surface in scope as a real user would. Take screenshots of every bug.
3. For each bug, record in `docs/handoff/<audit>-audit-<date>.md`:
   - One-line description
   - Screenshot reference
   - Surface (page URL, component path)
   - Severity: P0 (blocks task), P1 (degraded UX), P2 (cosmetic)
   - Best guess at file location
4. Map workflows — manager day, agent day, client day. Surfaces integration bugs that single-page audits miss.
5. Synthesize — group bugs by root cause, identify cross-cutting issues (typography, RBAC, notifications) that should become single slices.

**For site-wide audits, parallelize Phase 0 with an agent swarm.** See "Swarm patterns" below.

### Phase 1..N — Execution

Group bugs into slices of ~280 lines each. Order by dependency: data fixes before API fixes before UI fixes before integration tests.

Each slice gets a SLICES.md entry:
- **Status** (`pending` → `in_progress` → `awaiting_review` → `done`)
- **Goal** (one sentence)
- **Files likely involved**
- **Smoke contract idea** (one or two pins)
- **Stop conditions**
- **Estimated lines**
- **Asana card link** (optional, but recommended for stakeholder-visible slices)

Execution loop per slice:
1. Spin up a fresh Claude Code session in the project directory.
2. Paste the kickoff prompt (template below).
3. Wait for plan-of-record. Read it carefully.
4. Approve, refine, or reject.
5. Wait for PR opened.
6. Review via Chrome MCP — diff every file changed, scan smoke contracts, confirm SLICES.md updated.
7. Merge via Chrome MCP (Rebase and merge).
8. Delete branch.
9. Deploy from local: `cd /Users/nathantondow/Documents/vettdre && git checkout main && git pull && gcloud builds submit --config cloudbuild.yaml`.
10. After deploy succeeds, verify in prod via Chrome MCP.
11. If the slice ships data changes: dry-run migration, review output, then `--apply`. Append to `migrations/registry.json`.
12. Mark slice `done` in SLICES.md.
13. Update Asana card.
14. Move to next slice.

### End-of-phase gate

After completing all slices in a phase:

1. Run typecheck + lint + build on `main`. Confirm baselines held or improved.
2. Run playwright e2e harness end-to-end. All flows green.
3. Update SLICES.md with phase status.
4. Summarize the phase in Asana: PR links, what changed, baseline deltas, what to verify.
5. If migrations ran, confirm `migrations/registry.json` is up to date.
6. Take a break before the next phase.

### End-of-audit gate

After all phases done:

1. Move audit doc to `docs/handoff/archive/<audit-name>-<date>.md` (or just leave it; it's the historical record).
2. Update Asana board: archive cards, close columns.
3. Write a short retrospective in chat or a new doc: what worked, what didn't, what to change for the next audit's methodology.

---

## Tooling tier

Two tracking systems with different audiences. Don't try to keep them auto-synced; reconcile manually at phase boundaries.

### Tier 1: Asana (stakeholder-facing)

**What lives here:**
- One project per audit.
- One section per area (Calendar, Messages, Market Intel, etc.) or per phase (depends on audit shape).
- One card per slice that's stakeholder-visible. Cards link to PRs and SLICES.md anchors.
- One card per stakeholder-blocked decision. Comments capture the conversation. Card stays open until the decision is made.
- One card per scheduled stakeholder sync.

**Card fields:**
- Status (planned / in progress / blocked / done)
- Owner (Nathan, by default — assign to others as collaborators come online)
- Due date for time-bound work
- Custom field: severity (P0/P1/P2)
- Custom field: phase (Z, 0, 1, 2, ...)
- Custom field: PR link

**What Asana is NOT for:**
- Per-slice technical details (those live in SLICES.md).
- Granular file lists (those live in kickoff prompts).
- Smoke contract definitions (those live in test files).

### Tier 2: SLICES.md (agent-facing)

**What lives here:**
- Status legend, phase legend.
- One entry per slice with status, goal, files, success criteria, dependencies, smoke contract idea, outcome.
- Phase 5 stubs for deferred work.

**Pattern:** SLICES.md is the source of truth for execution. Agents read it natively (it's in the repo). Agents update it as they finish slices. If an audit gets crowded enough to push SLICES.md past ~1000 lines, split into per-audit files: `SLICES-bms.md`, `SLICES-speed.md`, etc., with a top-level `SLICES.md` that indexes them.

### Tier 3: migrations/registry.json (audit trail)

Append-only log of every prod data migration. One entry per migration:
```json
{
  "date": "2026-05-02",
  "sliceId": "19-fix-tra-sig-height",
  "model": "DocumentTemplate",
  "rowsTouched": 1,
  "backupPath": "migration-backup-tra-sig-height-2026-05-02T20-15-00-000Z.json",
  "rollbackVerified": false,
  "notes": "Gulino's templateId cmoiwqbtp0001e8cl9cqrfb3c, sig height 7 → 3"
}
```

Used for: rollback story, audit trail, "what changed when" investigations weeks later.

---

## Swarm patterns

Parallel agents are a force multiplier in some places and a P0 generator in others. Strict rules:

### Where to swarm (read-only or independent work)

**Phase 0 discovery.** Spawn N agents, each parameterized with a single area + a list of surfaces to walk + login credentials. Each fills out a standardized audit template. Outputs are independent files; no merge conflicts possible.

**Post-deploy verification.** After a slice ships, spawn:
- One agent to confirm smoke contract pins match prod reality.
- One agent to run the playwright happy-path for the affected area.
- One agent to scan Sentry for new errors in the last 30 minutes.

**Cross-area regression scan.** When a slice touches infrastructure that affects multiple areas (typography, auth, notifications), spawn agents to walk *adjacent* areas and confirm no regression. Outputs are independent observations.

**Swarm prompt template (Phase 0 audit agent):**
```
You are a Phase 0 audit agent for the [AREA NAME] of VettdRE.

Your job: walk every surface listed below as a real user would, taking
screenshots of any bug you observe, and producing a structured audit doc.

DO NOT write any code. DO NOT modify any files in the repo. You are
read-only on the codebase except for the audit deliverable.

Login credentials are in 1Password under "VettdRE super_admin".
Use `mcp__Claude_in_Chrome__*` tools to drive Chrome.

Surfaces to walk:
- [URL 1] — [what to test]
- [URL 2] — [what to test]
- ...

For each bug, record in `docs/handoff/<audit>-<area>-audit-<date>.md`:
1. One-line description
2. Screenshot path (save to docs/handoff/screenshots/<area>-<n>.png)
3. Surface (URL + best-guess component path from CLAUDE.md)
4. Severity: P0 (blocks task) / P1 (degraded UX) / P2 (cosmetic)
5. Reproduction steps

End with a "Top 5 issues by impact" ranking.

Stop conditions:
- If you discover a security issue (auth bypass, data leak), STOP and surface
  in chat immediately. Do not include in the audit doc until reviewed.
- If a surface 503s or unexpectedly errors, capture the error and continue;
  log "blocked from full audit" for that surface.
```

### Where NOT to swarm (write-side mutations)

**Slice execution.** The slice → PR → merge → deploy → verify chain is inherently serial because each merge validates the next slice's foundation. Parallel slice execution is the wrong place for swarm. Late-April BMS P0 (15 unmerged branches rolled back) is the cautionary tale.

**Migrations.** One migration at a time. Dry-run, review, apply, verify, then move on. Parallel migrations against the same model are an obvious foot-gun.

**Schema changes.** One Prisma migration at a time. Multiple parallel schema PRs against `main` produce migration ordering hell.

### Parallel slices (rare, when truly disjoint)

If two slices touch genuinely disjoint files (e.g. one touches `app/(dashboard)/calendar/` and another touches `app/(dashboard)/messages/`, with no shared lib/ files), they CAN run in parallel. Conditions:

1. Confirm via `git diff --stat` between the two PRs that file lists don't overlap.
2. Both branches start from the same `origin/main` SHA.
3. Both PRs run their own playwright e2e.
4. Merge them in close succession (within minutes) to minimize the rebase window.

If in doubt, stay serial.

---

## Patterns and templates

### Kickoff prompt template

```
Slice [ID] — [one-line goal].

**The bug:**
[explain the user-visible symptom + what makes it wrong; reference a
screenshot or specific surface URL]

**The fix:**
[high-level approach; if multiple options exist list them and indicate
your preference]

**Discovery instructions:**
- Read [file 1] — find [specific thing]
- Read [file 2] — confirm [specific thing]
- Grep for [pattern]
- [Any other read-only investigation]

**Implementation intent (for agent — not directives):**
- [What the code should do, not how]
- [Constraints: must not touch X, must follow pattern Y]

**Smoke contracts (n contracts):**
1. [pin description]
2. [pin description]
...

**Stop conditions:**
- If [X], stop and ask
- If [Y], surface and propose options
- If line count exceeds 280, stop and propose split

**Branch:** feat/p[N]-[id]-[short-name] off origin/main
**PR title:** [conventional format]

Stop and propose plan in chat first. Don't write code yet.
```

### Migration script skeleton

```typescript
/**
 * Migration — [what it does and why]
 *
 * Background: [bug context]
 *
 * Match guard: [exact-match signature that identifies bad rows]
 * Skip rule: [what we preserve]
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts          # dry-run
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts --apply  # write
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts --apply --org-id <id>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import prisma from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const orgIdIdx = process.argv.indexOf("--org-id");
const ONLY_ORG_ID = orgIdIdx >= 0 ? process.argv[orgIdIdx + 1] : undefined;

// Known-bad signature constants (exact match)
const KNOWN_BAD_X = ...;

async function main() {
  console.log(`Mode: ${APPLY ? "LIVE (will write)" : "DRY RUN (no writes — pass --apply to write)"}`);
  if (ONLY_ORG_ID) console.log(`Filter: orgId = ${ONLY_ORG_ID}`);

  // 1. Fetch candidates
  const rows = await prisma.[model].findMany({ where: { ... } });

  // 2. Partition matched vs skipped
  const matched = rows.filter(r => fieldsMatchKnownBad(r));
  const skipped = rows.filter(r => !fieldsMatchKnownBad(r))
    .map(r => ({ ...r, reason: "..." }));

  // 3. Log what will happen
  console.log(`Found ${rows.length} row(s) to evaluate`);
  console.log(`  Matched (will migrate): ${matched.length}`);
  console.log(`  Skipped (preserved):    ${skipped.length}`);
  for (const s of skipped) console.log(`  - templateId=${s.id} orgId=${s.orgId} :: ${s.reason}`);

  if (matched.length === 0) { console.log("Nothing to migrate."); return; }

  // 4. Backup snapshot BEFORE any writes
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(process.cwd(), `migration-backup-[name]-${ts}.json`);
  writeFileSync(backupPath, JSON.stringify(matched.map(toBackupShape), null, 2));
  console.log(`Backup written: ${backupPath}`);

  if (!APPLY) {
    console.log("Dry run — no DB or Storage writes performed. Re-run with --apply to write.");
    return;
  }

  // 5. Apply with per-row logging
  let succeeded = 0, failed = 0;
  for (const t of matched) {
    try {
      await prisma.[model].update({ where: { id: t.id }, data: { ... } });
      console.log(`  [OK]   templateId=${t.id} orgId=${t.orgId} (org="${t.organization?.name}") :: [what changed]`);
      succeeded++;
    } catch (err) {
      console.error(`  [FAIL] templateId=${t.id} orgId=${t.orgId}`, err);
      failed++;
    }
  }

  // 6. Final summary + rollback hint
  console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped.length}`);
  console.log(`Rollback: see ${backupPath}`);
  console.log(`Append to migrations/registry.json before closing the slice.`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
```

### Inline DB verification pattern

```bash
cd /Users/nathantondow/Documents/vettdre && npx dotenv-cli -e .env.local -- npx tsx -e '
import prisma from "./src/lib/prisma";
(async () => {
  const t = await prisma.[model].findUnique({ where: { id: "..." } });
  console.log(JSON.stringify(t, null, 2));
  await prisma.$disconnect();
})();
'
```

The IIFE wrapper is mandatory — `tsx -e` doesn't support top-level await in CJS mode.

### Smoke contract patterns

**Pattern A: positive structural pin**
```typescript
expect(
  src,
  "must wire onPointerDown to handleFieldPointerDown"
).toMatch(/onPointerDown=\{\(e\)\s*=>\s*handleFieldPointerDown\(e,\s*field\.id\)\}/);
```

**Pattern B: negative pin against pre-fix shape**
```typescript
expect(
  src,
  "must NOT use legacy Promise<Uint8Array> return type"
).not.toMatch(/generateTenantRepAgreementPdf[\s\S]*?Promise<Uint8Array>/);
```

**Pattern C: cardinality assertion**
```typescript
const DASH = "(?:—|\\\\u2014)";  // alternation handles repo's mixed em-dash conventions
const matches = src.match(new RegExp(`isRentalTransaction\\(tx\\)\\s*\\?\\s*["']${DASH}["']`, "g"));
expect(matches!.length, "expected at least 2 occurrences (mobile + desktop list rows)").toBeGreaterThanOrEqual(2);
```

Cardinality assertions are useful when the same fix needs to apply across multiple render paths. Catches regressions where someone removes one path.

### Playwright e2e harness (Phase Z deliverable)

Required flows for VettdRE (top 10-15, expand as needed):
1. Login + 2FA + redirect to dashboard.
2. Create contact → add to pipeline → advance stage.
3. Create deal submission via public token → manager approves → invoice created.
4. Send Gmail reply with template merge fields.
5. Create showing slot → public booking via `/book/[slug]` → agent sees booking.
6. Run market intel address search → open building profile → save to prospecting.
7. Create AI underwrite → export LOI PDF.
8. Create onboarding → public sign via `/sign/[token]` → completion → invoice generation.
9. Bulk invoice generation across multiple agents.
10. Terminal feed loads + neighborhood filter applies + building profile opens in right panel.

Run on every PR via GitHub Actions (or equivalent). All green = baseline holds.

---

## Anti-patterns

- **Don't let an agent write code without a plan-of-record.** The 5 minutes saved costs 30 minutes when the implementation goes sideways.
- **Don't trust an agent's confidence.** Push back when something feels off. Ask "are you sure?" Verify via independent path.
- **Don't skip post-deploy verification.** Smoke contracts pass + deploy succeeds is not the same as "feature works in prod."
- **Don't redefine financial KPIs as a code-only change.** Anything affecting commission tiers, payouts, revenue calcs needs stakeholder conversation. File a Phase 5 stub instead.
- **Don't ship migrations without dry-run + backup.** The cost of guards is small. The cost of corrupting prod data is unbounded.
- **Don't merge a slice that touches another slice's tests without surfacing it explicitly in the PR body.** Contract relaxation across slices needs to be obvious to future reviewers.
- **Don't leave half-fixes in place.** If slice A surfaces follow-up bug B, either ship B before declaring the area done, or file a stub explicitly. Don't claim victory and leave the area broken.
- **Don't skip the SLICES.md update.** Future-you needs the ledger.
- **Don't keep methodology and status in the same file.** Methodology is durable. Status decays fast. Separate them.
- **Don't run parallel slices on overlapping files.** "I checked and they don't conflict" usually misses a shared lib/ file. Stay serial unless you've git-diff-confirmed disjoint.
- **Don't deploy on Friday afternoon without a rollback rehearsal.** If a migration goes wrong at 5pm Friday, you're spending the weekend fixing it.

---

## Per-audit setup checklist

When starting a new audit, work through this:

- [ ] Audit name + date chosen.
- [ ] Goal stated in one sentence.
- [ ] Scope boundaries defined (which areas in / out).
- [ ] `docs/handoff/<audit-name>-audit-<date>.md` created (Phase 0 fills it).
- [ ] SLICES.md (or `SLICES-<audit>.md` if site-wide) created with status legend + phase legend.
- [ ] Asana project created with phase columns + area sections.
- [ ] `migrations/registry.json` exists or created.
- [ ] Playwright harness exists (build it as Phase Z slice 1 if not).
- [ ] Lint baseline anchored. Number recorded in CLAUDE.md.
- [ ] Typecheck baseline anchored. Number recorded in CLAUDE.md.
- [ ] Phase Z slices defined.
- [ ] First Phase Z slice has a kickoff prompt ready to paste into Claude Code.

---

## Versioning this doc

This is v2 (2026-05-02). Future revisions should:
- Bump the version in the header.
- Add a "what changed in vN" section near the top.
- Move the prior version to `docs/methodology/archive/slice-based-audit-v[N-1]-<date>.md`.

The methodology evolves as we learn. The doc is a living artifact, not a stone tablet.
