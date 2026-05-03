# Slice-Based Audit Methodology (v2.1.1)

**Status:** durable. This doc is the playbook for any VettdRE audit — single area or site-wide. Status snapshots live elsewhere (SLICES.md, Asana, audit docs in `docs/handoff/`). This doc is the methodology only.

**v2.1.1 patch (2026-05-02):** pre-flight discovered GitHub Actions CI and playwright harness do NOT exist in the repo. v2.1 commits to both as required infrastructure but they're TBD. Until they ship as speed audit Z.0a + Z.0b slices, the following interim rules apply:
- Smoke contracts run via `npm run test -- tests/smoke/<slice-id>.test.ts` locally during PR review. PR reviewer (Nathan) verifies green output before merge approval.
- Playwright e2e harness verification at end-of-phase gate is replaced by manual checklist (walk top 5 flows in prod via Chrome MCP after deploy).
- The `smoke-contracts` and `e2e-playwright` CI job references in this doc are aspirational until Z.0a + Z.0b ship.

This is a stopgap. Once Z.0a + Z.0b merge, methodology bumps to v2.2 with these caveats removed.

**Companion templates** (in `docs/methodology/templates/`):
- `kickoff-prompt.md` — paste into Claude Code to start any slice
- `migration-script-skeleton.md` — required pattern for prod data changes
- `phase-0-swarm-prompt.md` — read-only audit agents for site-wide discovery

**v2.1 changes from v2** (full diff at end of doc):
- Plan-of-record artifact format defined; lives in SLICES.md, not chat.
- Smoke contract location and CI integration specified.
- End-of-phase + end-of-audit gates promoted to literal checklists with sign-off.
- Mid-phase weekly health check added.
- **Parallel slices banned outright.** Escape hatch documented.
- Verification "done" criteria specified per mode.
- Phase 5 stub format inlined as copy-paste template.
- Post-merge bug procedure added (hot-fix slice, never silent patch).
- Branch + commit naming conventions promoted to dedicated subsection.
- Migration rollback drill cadence required.
- "When NOT to use this methodology" section added.
- CI tool fixed to GitHub Actions; project board fixed to Asana.
- Line band rationale spelled out (≤280 / 281-300 / 301+).
- Long copy-paste templates moved to `docs/methodology/templates/`.
- Glossary added.

---

## When to use (and when NOT to)

### Use this methodology when

The work meets at least three of:
- 3+ slices likely.
- Touches production data, auth, RBAC, payments, or RLS.
- Touches more than one area of the codebase.
- Has stakeholders outside the engineering loop (clients, owners, ops).
- Spans more than one calendar week.

### Do NOT use this methodology for

- One-off bug fixes (single PR, no audit ledger needed — open a normal PR).
- Greenfield product spikes (no existing surfaces to audit; use ADRs + design docs instead).
- Architecture decisions (use ADRs in `docs/adr/`).
- Cursor-style "rewrite this function" work (too granular).
- Operational incidents (use the incident response runbook, not an audit).
- Anything that needs to ship in <24 hours (the gate cadence is too slow).

If you're unsure, default to opening a normal PR. The methodology earns its overhead at scope, not at slope.

---

## Quick reference (the five rules that matter most)

1. **One slice = one PR** (≤280 lines target, see "Slice sizing"). Branch off `origin/main`, delete after merge. Never long-lived integration branches. Never parallel slices.
2. **Plan-of-record before code.** Agent reads, proposes plan in SLICES.md, waits for approval. Code only after.
3. **Smoke contracts are required.** Live in `tests/smoke/<slice-id>.test.ts`. Must run green in CI.
4. **Migrations: dry-run default, JSON backup, exact-match guard, registry append.** No exceptions.
5. **Verify in prod after deploy.** Evidence captured (screenshot, query output, Sentry trace). "Looks fine" is not verification.

---

## Core principles

### 1. Slice sizing

The line bands and what each means:

- **≤280 lines:** default target. Ship freely.
- **281-300 lines:** acceptable IF no Phase 5 stubs were deferred during implementation. If you deferred work, it means the slice was actually bigger than the diff shows — split or absorb the stub work.
- **301-449 lines:** rejected at PR review. Split into A/B halves, re-open both as separate slices.
- **450+ lines:** never reaches PR — split during plan-of-record review before any code is written.

Why these numbers: BMS audit data shows slices ≤280 lines have a ~95% first-review-pass rate; slices 281-450 drop to ~60% with rework; slices >450 are essentially miniature epics that should've been planned as multiple slices from the start.

### 2. Plan-of-record (the most important pattern)

Never let an agent jump straight to coding. Five-step flow:

1. You write a kickoff prompt (use `templates/kickoff-prompt.md`).
2. Agent reads the listed files (no code writing).
3. Agent reports findings + proposes plan in SLICES.md (NOT chat).
4. You approve, refine, or reject — in chat.
5. Only then does the agent write code.

**Plan-of-record artifact format.** Append to the slice's SLICES.md entry under a `## Plan of record` heading. Required fields:

```markdown
## Plan of record

**Files to be created/modified:**
- src/path/to/file.ts (modify — add X helper)
- src/path/to/other.tsx (modify — wire X helper)
- tests/smoke/<slice-id>.test.ts (create — 3 contracts)

**Smoke contract regex pins (literal regex strings):**
1. Positive: `/onPointerDown=\{.+handleFieldPointerDown.+\}/`
2. Negative: `/onMouseDown=\{/`
3. Cardinality: `expect(matches.length).toBeGreaterThanOrEqual(2)`

**Estimated line count:** 180-220

**Stop conditions internalized:**
- [list copied from kickoff prompt + any added during discovery]

**Open questions for Nathan:**
- [list — empty if none]

**Discovery findings:**
- [file paths + line numbers + bug shape, brief]
```

This format is enforced because: (a) chat-only plans vanish, (b) future agents picking up a related slice can read the plan-of-record to understand what was already considered, (c) the PR review can compare actual diff vs plan to catch scope creep.

### 3. Smoke contracts

Every slice ships smoke tests as regex pins on critical patterns in the code. Both positive ("must contain X") and negative ("must NOT contain Y") assertions. The point isn't behavior testing — it's locking in the spirit of the fix structurally so future reverts trip a contract.

**Location:** `tests/smoke/<slice-id>.test.ts`. One file per slice. File name matches slice ID exactly.

**CI integration:** smoke contracts run in the GitHub Actions PR check (job name: `smoke-contracts`). Failing contracts block merge. The check is required on `main` branch protection. **(v2.1.1 caveat: GH Actions doesn't exist yet — until speed audit Z.0a ships, smoke contracts run via `npm run test -- tests/smoke/<slice-id>.test.ts` locally and PR reviewer verifies green output manually.)**

**Sizing:** target 2-4 contracts per slice. Single-contract slices are usually under-tested. Five+ contract slices are usually over-engineered (or the slice is too big — see line bands).

**Three patterns that work:**

```typescript
// Pattern A: positive structural pin
expect(
  src,
  "must wire onPointerDown to handleFieldPointerDown"
).toMatch(/onPointerDown=\{\(e\)\s*=>\s*handleFieldPointerDown\(e,\s*field\.id\)\}/);

// Pattern B: negative pin against pre-fix shape
expect(
  src,
  "must NOT use legacy Promise<Uint8Array> return type"
).not.toMatch(/generateTenantRepAgreementPdf[\s\S]*?Promise<Uint8Array>/);

// Pattern C: cardinality assertion
const DASH = "(?:—|\\u2014)";
const matches = src.match(new RegExp(`isRentalTransaction\\(tx\\)\\s*\\?\\s*["']${DASH}["']`, "g"));
expect(matches!.length, "expected at least 2 occurrences (mobile + desktop)").toBeGreaterThanOrEqual(2);
```

Anchor regex to literal JSX prop syntax (`={`, `\?`, etc.) that doesn't appear in comment text. An over-broad regex matched JSX comments in slice 20-fixes-C and falsely passed.

### 4. Stop conditions

Every kickoff prompt lists explicit triggers for "pause and ask in chat." When a stop condition fires, the agent stops, surfaces in chat, and waits for direction. No passive proceeding.

**Always-on stop conditions** (apply to every slice without being listed):
- Security boundary touched (auth, RBAC, RLS, CSP, signed cookies).
- Schema migration required (any `prisma migrate dev` invocation).
- `lib/team-context.ts` modification.
- `middleware.ts` or `lib/supabase/middleware.ts` modification.
- Financial KPI redefinition (commission tiers, payouts, revenue calcs).
- Cross-slice contract relaxation (modifying another slice's smoke contracts).
- Line count exceeds 280 — propose split before continuing.

**Operationally:** "stop and ask" means the agent pauses execution, posts the situation to the active chat session, and waits for Nathan's reply. Outside business hours, the agent waits — no escalation, no proceeding on best guess. Audit work is not on-call.

### 5. Migration safety

When a slice modifies production data, the migration script MUST follow `templates/migration-script-skeleton.md`. The required guarantees:

- **Dry-run default ON** — `--apply` must be explicit.
- **JSON backup before writes** — timestamped file capturing pre-state.
- **Exact-match guards** — only modify rows matching known-bad signature.
- **Idempotency** — re-running with same flags produces no changes.
- **Per-row logging with org name** — `[OK] id=X orgId=Y (org="Z")`.
- **Skip-with-reason** for non-matching rows.
- **Final summary line** plus rollback path plus registry-append reminder.

After running with `--apply` succeeds, the slice's PR MUST include an entry appended to `migrations/registry.json`:

```json
{
  "date": "2026-05-02",
  "sliceId": "19-fix-tra-sig-height",
  "model": "DocumentTemplate",
  "rowsTouched": 1,
  "backupPath": "migration-backup-tra-sig-height-2026-05-02T20-15-00-000Z.json",
  "rollbackVerified": false,
  "notes": "Gulino's templateId X, sig height 7 → 3"
}
```

**Rollback drill cadence:** once per audit, run a real rollback against the most recent backup-to-rollback pair on a non-prod tenant. On success, mark `rollbackVerified: true` for that entry. Without rollback drills, the rollback story is theoretical and unreliable when actually needed. Schedule the drill as the second-to-last slice of the audit.

### 6. Production verification

After merge + deploy, verify in real prod via Chrome MCP. Three modes, each with a "done" criterion:

**Mode A — UI smoke.** Drive Chrome MCP to navigate, click, screenshot, confirm visible state matches expected. **Done criterion:** screenshot saved to `docs/handoff/screenshots/<slice-id>-prod.png`, referenced in the PR comment, showing the expected post-fix state.

**Mode B — JS console / DOM inspection.** When CDP can't synthesize the necessary events (Pointer Events, complex drag-drop), use `mcp__Claude_in_Chrome__javascript_tool` to inspect React state, DOM children, computed styles. **Done criterion:** assertion stack pasted into PR comment as a fenced JS block, e.g. `expect(getComputedStyle(el).touchAction).toBe('none')` style assertions with their actual results.

**Mode C — DB verification via Prisma script.** When UI access is blocked (super_admin override fails, route requires specific tenant), use the inline DB pattern (see "Tools" below). **Done criterion:** query output pasted into PR comment as a fenced JSON block, identifying rows by ID, showing post-migration state.

**A slice is not "verified" without one of these three artifacts in the PR comment.** Default-lazy verification ("looks fine") is the failure mode this prevents.

### 7. What to do if verification reveals a bug AFTER merge

Two paths, choose deliberately:

**Path 1 — Hot-fix slice.** If the bug is small (single file, <50 lines), open a follow-up slice immediately. Title: `fix(<scope>): hot-fix for <slice-id> verification failure`. Reference the failed verification in PR body. Skip plan-of-record (the bug is the plan). Smoke contract pins the failure mode so it can't regress.

**Path 2 — Revert.** If the bug is large or unclear in scope, revert the original slice's merge commit on `main` immediately. Reopen a new slice with revised scope. Update SLICES.md to mark the original as `reverted-needs-redo`.

**Never silent patch on `main`.** A direct push that fixes the bug without a PR destroys the audit trail and breaks smoke contract regression detection. Even small fixes go through the slice loop.

### 8. Phase 5 stubs

Anything you choose NOT to do gets a stub in SLICES.md and (if stakeholder input is needed) a corresponding Asana card.

**Stub format** (copy-paste template):

```markdown
### `<parent-slice-id>-followup-<short-name>`

**Status:** Phase 5 backlog
**Background:** [What the bug is. Which slice surfaced it. Reference the slice ID + audit doc.]
**Why deferred:** [What's blocking. Usually one of: stakeholder input needed, blast radius too large, requires architecture decision, nice-to-have not blocking critical path.]
**Required input before slicing:** [Explicit list of what needs to happen. "None" is acceptable.]
**Affected surfaces:** [Best-guess file/route list. So future-you doesn't re-do discovery.]
**Filed:** YYYY-MM-DD by [agent name or "Nathan"]
```

**Promotion to active slice:** Phase 5 stubs are reviewed once per audit at the end-of-audit gate. Stubs whose blockers have cleared (stakeholder decision made, related work shipped) get promoted to the next audit's scope or filed as a one-off PR if quick.

### 9. Push back on agents

Agents are confident even when wrong. When something feels off, ask. The clarification cost is one message; the cost of shipping a half-fix is much larger.

**Common agent failure modes to watch for:**

- **Inverted DOM order claims** (e.g. "the earlier element paints on top" — false; later siblings paint on top under default z-index).
- **Single-render-path proposals** (agent fixes the most visible code path; ask whether the same component renders elsewhere).
- **Confidence on RBAC** (agent often asserts a role check is sufficient when it isn't; verify against `bms-permissions.ts` or auth code directly).
- **Over-trust of comment text** (agent reads JSX comments as code intent; comments lie).
- **Pattern matching to wrong precedent** (agent applies pattern from area A to area B without checking if the constraints differ — e.g. team-context vs org-context).

When the agent and you disagree and you suspect you might be wrong: verify against an independent path (read the actual file yourself, check git blame, run a quick prisma query, ask a second agent). Don't capitulate without verification; don't dig in without verification either.

### 10. Measurement discipline

Before claiming a baseline number ("typecheck holds at N", "lint at M"), the measurement must be both clean and cross-checked.

**Clean:** `git stash` does NOT stash untracked files by default. Use `git stash --include-untracked` when measuring pre-slice baseline. Run from clean working tree when anchoring a new baseline.

**Cross-checked:** if your measurement doesn't match the previously-tracked baseline — even when the direction is improvement — surface the gap in chat **before** moving past it. Don't anchor silently to your own number. Same rule both directions: if a measurement looks suspiciously clean, assume contamination first, real cleanup second.

**Cadence:** baselines re-anchored at end-of-phase gate. Recorded in CLAUDE.md with date, measurement command, and the diff vs the previous anchor.

---

## Phase structure

Every audit follows this lifecycle:

```
Phase Z (setup)         → infra, baselines, tooling
Phase 0 (discovery)     → audit, no code writing
Phase 1..N (execution)  → slices grouped by area / theme
Phase N+1 (closeout)    → final verification, baseline diff, archive
```

Slices run **serial only**. Parallel slices banned (see "Parallelism" section).

### Phase Z — Setup

Before any audit work begins, this infrastructure must exist. Phase Z slices ship serially and never touch product surfaces.

**Phase Z deliverables checklist:**

- [ ] Audit name + date chosen.
- [ ] Goal stated in one sentence.
- [ ] Scope boundaries defined (which areas in / out).
- [ ] `docs/handoff/<audit-name>-audit-<date>.md` created (Phase 0 fills it).
- [ ] `SLICES-<audit>.md` created with status legend + phase legend; top-level `SLICES.md` updated to index it.
- [ ] Asana project created with phase columns + area sections + custom fields (severity, phase, area, PR link).
- [ ] `migrations/registry.json` exists or created.
- [ ] Playwright e2e harness exists (build it as Phase Z slice 1 if not — see "Required infrastructure" below).
- [ ] Lint baseline anchored. Number recorded in CLAUDE.md.
- [ ] Typecheck baseline anchored. Number recorded in CLAUDE.md.
- [ ] First Phase Z slice has a kickoff prompt ready (use `templates/kickoff-prompt.md`).

### Phase 0 — Discovery

Read-only. Output is per-area markdown audit docs, then one synthesis doc. Use `templates/phase-0-swarm-prompt.md` for area agent prompts.

For site-wide audits, parallelize Phase 0 with an agent swarm (see "Parallelism" — swarm exception applies).

### Phase 1..N — Execution

Group bugs into slices of ≤280 lines each. Order by dependency: data fixes before API fixes before UI fixes before integration tests.

Each slice gets a SLICES.md entry with:
- **Status** (`pending` → `in_progress` → `awaiting_review` → `done`)
- **Goal** (one sentence)
- **Files likely involved**
- **Smoke contract idea** (one or two pins, expanded in plan-of-record)
- **Stop conditions**
- **Estimated lines**
- **Asana card link** (optional but recommended)
- **Plan of record** (appended after discovery, before code)
- **Outcome** (appended after merge)

**Execution loop per slice:**

1. Spin up a fresh Claude Code session in the project directory.
2. Paste the kickoff prompt (from `templates/kickoff-prompt.md`).
3. Wait for plan-of-record appended to SLICES.md. Read carefully.
4. Approve, refine, or reject in chat.
5. Wait for PR opened with smoke contracts under `tests/smoke/<slice-id>.test.ts`.
6. Review via Chrome MCP — diff every file changed, scan smoke contracts, confirm SLICES.md updated, confirm CI smoke-contracts job green.
7. Merge via Chrome MCP (Rebase and merge).
8. Delete branch.
9. Deploy from local: `cd /Users/nathantondow/Documents/vettdre && git checkout main && git pull && gcloud builds submit --config cloudbuild.yaml`.
10. After deploy succeeds, verify in prod via Chrome MCP. Capture verification artifact (per "Production verification" criteria) into PR comment.
11. If the slice ships data changes: dry-run migration, review output, then `--apply`. Append to `migrations/registry.json`.
12. Mark slice `done` in SLICES.md with outcome line.
13. Update Asana card.
14. Move to next slice.

### Mid-phase weekly health check

Every 7 days during a multi-week phase, work through this 5-item checklist:

- [ ] Lint and typecheck baselines hold (run end-to-end against `main`).
- [ ] No PR open and stalled >3 days.
- [ ] `migrations/registry.json` reflects every prod data change in the last 7 days.
- [ ] No completed slice has unfiled Phase 5 stubs (check PR descriptions for "TODO" or "follow-up" mentions).
- [ ] Asana board state matches SLICES.md state (manual reconciliation; no auto-sync).

Surface anomalies in chat. Don't let them accumulate to the end-of-phase gate.

### End-of-phase gate

After completing all slices in a phase, work through this checklist. **Both Nathan AND a verification agent sign off** (verification agent runs the automated checks; Nathan signs off in writing in the SLICES.md phase header).

```markdown
## Phase N — Gate (signed off YYYY-MM-DD)

- [x] Typecheck baseline holds or improves vs phase start (was N, now M)
- [x] Lint baseline holds or improves vs phase start (was N, now M)
- [x] Build green on main
- [x] Playwright e2e harness end-to-end green
- [x] All slices in phase marked `done` with outcome line in SLICES.md
- [x] All Phase 5 stubs from this phase filed correctly
- [x] migrations/registry.json reflects every prod data change in this phase
- [x] Asana board updated: cards moved to Done column
- [x] Phase summary written: PR links, what changed, baseline deltas

Signed off: Nathan, YYYY-MM-DD HH:MM
```

A phase is not "done" until this checklist is appended to SLICES.md with sign-off. Don't start the next phase until the gate is signed.

### End-of-audit gate

After all phases done, work through this checklist:

```markdown
## Audit closeout — Gate (signed off YYYY-MM-DD)

- [x] All Phase N gates signed off
- [x] Audit doc archived: docs/handoff/<audit>-audit-<date>.md → docs/handoff/archive/
- [x] SLICES-<audit>.md archived: → docs/methodology/archive/SLICES-<audit>-<date>.md
- [x] Asana project archived
- [x] Rollback drill executed against latest registry entry; rollbackVerified: true
- [x] Retrospective written: docs/handoff/<audit>-retrospective-<date>.md
  - What worked
  - What didn't
  - What to change for next audit's methodology (push to v3 if material)
- [x] Methodology v[X.Y] committed if changes warranted by retrospective

Signed off: Nathan, YYYY-MM-DD HH:MM
```

---

## Parallelism

### The rule: serial only

**Parallel slices are banned.** Every slice runs serially: the previous slice must be merged + deployed + verified before the next slice begins coding.

Why: the late-April BMS P0 (15 unmerged branches rolled back when PR-A merged from main) happened because what looked like disjoint work shared dependencies that weren't visible until merge. At single-area scope this was recoverable; at site-wide scope with multiple agents and multiple stakeholders, the same failure mode would burn weeks. The throughput cost of serial enforcement is ~5 days per 30-slice phase; the cost of a parallel-merge P0 is ~10 days plus loss of audit credibility.

### Escape hatch

This rule may be revisited in a future methodology version (v3+) IF AND ONLY IF:

1. Serial enforcement causes >2 weeks of attributable delay in a single audit, AND
2. Tooling exists for: (a) merge queue, (b) automated cross-slice file conflict detection, (c) per-slice baseline diffing.

Until both conditions are met, serial is mandatory — no per-slice exceptions, no Nathan approval workaround.

### Where parallel agents ARE allowed

The serial rule applies to **slice execution**. Other workflows can run in parallel:

- **Phase 0 discovery swarm** (read-only, see `templates/phase-0-swarm-prompt.md`).
- **Post-deploy verification swarm** (independent observations, no shared state):
  - Agent 1: confirm smoke contract pins match prod reality.
  - Agent 2: run playwright happy-path for affected area.
  - Agent 3: scan Sentry for new errors in last 30 minutes.
- **Cross-area regression scan** when a slice touches infrastructure (typography, auth, notifications). Agents walk adjacent areas independently and report.

The pattern: **parallel for read-only or independent observation work, serial for write-side mutations.**

---

## Tooling tier

Three tracking systems with different audiences. Don't try to keep them auto-synced; reconcile manually at phase boundaries.

### Tier 1: Asana (stakeholder-facing)

**Decision:** the audit board is Asana. Not Linear, not Notion, not GitHub Projects. Locked unless an ADR documents a switch.

**What lives here:**
- One project per audit.
- One section per area (Calendar, Messages, Market Intel, etc.) or per phase.
- One card per slice that's stakeholder-visible. Cards link to PRs and SLICES.md anchors.
- One card per stakeholder-blocked decision. Comments capture the conversation.
- One card per scheduled stakeholder sync.

**Card creation:** manual. Nathan creates cards when filing a slice in SLICES.md. No automation between SLICES.md and Asana — the manual reconciliation at phase boundaries is the integrity check.

**Card fields (custom):**
- Status (planned / in progress / blocked / done)
- Owner (default Nathan)
- Severity (P0/P1/P2)
- Phase (Z, 0, 1, 2, ...)
- Area
- PR link

**What Asana is NOT for:**
- Per-slice technical details (those live in SLICES.md).
- Granular file lists (those live in kickoff prompts and plan-of-record).
- Smoke contract definitions (those live in test files).

### Tier 2: SLICES.md (agent-facing)

**Pattern:** SLICES.md is the source of truth for execution. Agents read it natively (it's in the repo). Agents update it as they finish slices.

**Split convention:** for site-wide audits, create per-audit files: `SLICES-bms.md`, `SLICES-speed.md`, etc. Top-level `SLICES.md` is an index pointing to each. Trigger: any time a single SLICES file would exceed 1000 lines OR an audit's scope is clearly multi-month, pre-emptively split.

### Tier 3: migrations/registry.json (audit trail)

**Append-only log of every prod data migration.** Schema:

```json
{
  "date": "YYYY-MM-DD",
  "sliceId": "<slice-id>",
  "model": "<PrismaModel>",
  "rowsTouched": 0,
  "backupPath": "<absolute path to JSON backup file>",
  "rollbackVerified": false,
  "notes": "<one-line summary>"
}
```

**Validation:** PR check (TBD — Phase Z deliverable for site-wide audits) confirms that any PR touching a `scripts/migrate-*.ts` file also appends to `migrations/registry.json`. Until the check exists, manual review at PR time enforces it.

---

## Required infrastructure

### CI: GitHub Actions

**Decision:** CI runs on GitHub Actions. Locked unless an ADR documents a switch.

**(v2.1.1 status:** GitHub Actions doesn't exist yet. Cloud Build runs deploy-only. Filed as **speed audit slice Z.0a**. Until merged, methodology rules below are aspirational — interim rules in v2.1.1 patch note at top of doc apply.)

**Required jobs (all must pass for PR to merge), once Z.0a ships:**
- `typecheck` — `npm run typecheck`
- `lint` — `npm run lint`
- `build` — `npm run build`
- `smoke-contracts` — `npm run test -- tests/smoke/`
- `e2e-playwright` — `npx playwright test` against staging

**Optional jobs (warn-only initially):**
- `lighthouse-ci` (during speed audit, set as required after Phase 1)
- `bundle-budget` (during speed audit)

**Branch protection on `main`:** all required jobs must pass; PR must be from a feature branch (no direct push); 1 approval required (Nathan).

### Playwright e2e harness

Required infrastructure for any audit. If it doesn't exist, building it is Phase Z slice 1.

**(v2.1.1 status:** Playwright doesn't exist yet. No `playwright.config.*`, no `tests/e2e/`. Filed as **speed audit slice Z.0b**. Until merged, end-of-phase gate playwright check is replaced with manual top-5-flow walk via Chrome MCP.)

**Required flows for VettdRE** (top 10-15, expand over time):

1. Login + redirect to dashboard.
2. Create contact → add to pipeline → advance stage.
3. Create deal submission via public token → manager approves → invoice created.
4. Send Gmail reply with template merge fields.
5. Create showing slot → public booking via `/book/[slug]` → agent sees booking.
6. Run market intel address search → open building profile → save to prospecting.
7. Create AI underwrite → export LOI PDF.
8. Create onboarding → public sign via `/sign/[token]` → completion → invoice generation.
9. Bulk invoice generation across multiple agents.
10. Terminal feed loads + neighborhood filter applies + building profile opens.

Run on every PR via GitHub Actions `e2e-playwright` job. All green = baseline holds. Any flow red = PR blocked.

### Test accounts

For Phase 0 audits and playwright runs, use dedicated test accounts (not Nathan's personal super_admin login). Test accounts are documented in 1Password under "VettdRE — audit test accounts."

---

## Branch + commit naming conventions

Consistent naming makes the audit ledger searchable months later. Required format:

**Branch:**
```
<phase>/<slice-id>-<short-name>
```
- `<phase>` is one of: `feat` (new feature work), `fix` (bug fix), `chore` (infra/tooling/refactor), `docs` (documentation only).
- `<slice-id>` matches SLICES.md exactly. For numbered phases, prefix with the phase number: `p4-22` for Phase 4 slice 22.
- `<short-name>` is 2-4 hyphenated words describing the slice.

Examples: `feat/p4-22-as-org-vault`, `chore/speed-z1-bundle-analyzer`, `fix/bms-tra-sig-height`.

**Commit messages (conventional commits):**
```
<type>(<scope>): <description>

[optional body]

Closes <slice-id>
```

- `<type>` matches branch type.
- `<scope>` is the affected area (vault, terminal, calendar, leasing, etc.).
- `<description>` is imperative, lowercase, no period.

**PR title** matches the commit message format.

**PR body** must include:
- Slice ID
- Brief description (1-3 sentences)
- Smoke contracts list (with regex pins)
- Verification evidence (screenshot path, query output, or assertion stack)
- Phase 5 stubs filed (if any)
- Cross-slice contract relaxations (if any — explicitly call out)

---

## Patterns and templates

Long copy-paste templates live in `docs/methodology/templates/`:
- `kickoff-prompt.md` — start any slice
- `migration-script-skeleton.md` — required for prod data changes
- `phase-0-swarm-prompt.md` — read-only audit agents

Short patterns inlined here:

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

See "Smoke contracts" section above. Three patterns: positive structural pin, negative pin against pre-fix shape, cardinality assertion.

### Phase 5 stub format

See "Phase 5 stubs" section above for the copy-paste template.

---

## Anti-patterns

- **Don't let an agent write code without a plan-of-record in SLICES.md.** Chat-only plans vanish.
- **Don't trust an agent's confidence.** Push back when something feels off. Verify via independent path.
- **Don't skip post-deploy verification.** Smoke contracts pass + deploy succeeds is not the same as "feature works in prod." Capture evidence.
- **Don't redefine financial KPIs as a code-only change.** Anything affecting commission tiers, payouts, revenue calcs needs stakeholder conversation.
- **Don't ship migrations without dry-run + backup + registry append.**
- **Don't merge a slice that touches another slice's smoke contracts without surfacing it explicitly in PR body.**
- **Don't leave half-fixes in place.** If slice A surfaces follow-up bug B, either ship B before declaring the area done, or file a stub.
- **Don't skip the SLICES.md update.** Future-you needs the ledger.
- **Don't keep methodology and status in the same file.** Methodology durable; status decays fast.
- **Don't run parallel slices.** Serial only. No exceptions until the v3+ escape hatch conditions are met.
- **Don't anchor baselines silently.** Surface measurement gaps in chat before moving past them.
- **Don't push directly to main to fix a verification failure.** Hot-fix slice or revert; never silent patch.
- **Don't reuse a Phase 5 stub ID for an active slice.** ID confusion is permanent in the ledger.
- **Don't deploy on Friday afternoon without a rollback rehearsal.** Weekend incidents are costly.
- **Don't let `migrations/registry.json` drift from reality.** Validate at every mid-phase health check.

---

## Glossary

- **Slice** — one shippable unit of work, one PR, ≤280 lines target.
- **Plan of record** — agent's proposed approach for a slice, appended to SLICES.md before code. Approved by Nathan in chat.
- **Smoke contract** — regex pin in `tests/smoke/<slice-id>.test.ts` that locks in the structural shape of a fix.
- **Phase Z** — required setup phase before any audit work starts: infra, baselines, tooling.
- **Phase 0** — read-only discovery phase. Per-area audit docs + one synthesis doc.
- **Phase 5 stub** — placeholder for deferred work. Captured in SLICES.md so it's not lost.
- **End-of-phase gate** — checklist + Nathan sign-off required before next phase starts.
- **End-of-audit gate** — final checklist, archive, retrospective, methodology bump.
- **Migration registry** — append-only log of prod data changes in `migrations/registry.json`.
- **Rollback drill** — scheduled exercise of restoring from a backup file. Required once per audit.
- **as_org override** — super_admin URL parameter for cross-tenant viewing.
- **BBL** — NYC Borough-Block-Lot identifier. Universal join key for property data.
- **RBAC** — Role-Based Access Control. See `lib/bms-permissions.ts`.
- **RLS** — Row-Level Security. Postgres pattern.
- **Stop condition** — explicit trigger for "pause and ask in chat."
- **Verification artifact** — screenshot, assertion stack, or query output that proves a slice works in prod.

---

## Versioning this doc

**Version:** 2.1.1 (2026-05-02).

**When to bump:**
- **Major (v3, v4...):** any new core principle, any structural change to the slice loop, any change to required infrastructure. Triggers: post-incident retrospective surfacing systemic gap; site-wide audit completion surfacing new patterns.
- **Minor (v2.1 → v2.2):** template updates, anti-pattern additions, glossary growth, clarifications. Doesn't change the slice loop.
- **No bump:** typo fixes, formatting cleanup.

**On bump:**
1. Update version in header.
2. Add a "v[X.Y] changes" section near the top describing the diff.
3. Move prior version to `docs/methodology/archive/slice-based-audit-v[N-1]-<date>.md`.
4. Bump references in any audit kickoff doc that names a specific version.

**Owner:** Nathan. Other agents propose changes via PR; Nathan approves before merge.

---

## v2.1 → v2 diff (for reference)

What changed when bumping from v2 to v2.1:

| # | Section | Change |
|---|---------|--------|
| 1 | Plan-of-record | Defined the artifact format. Now lives in SLICES.md, not chat. |
| 2 | Smoke contracts | Specified location (`tests/smoke/<slice-id>.test.ts`) + CI job (`smoke-contracts`). |
| 3 | End-of-phase gate | Promoted from prose to literal checklist + Nathan sign-off line. |
| 4 | End-of-audit gate | Same — checklist + sign-off. |
| 5 | Mid-phase health check | Added 5-item weekly checklist. |
| 6 | Parallelism | **Banned parallel slices outright.** Documented escape hatch. |
| 7 | Production verification | Added "done" criterion per mode (A: screenshot, B: assertion stack, C: query output). |
| 8 | Phase 5 stubs | Inlined the copy-paste template. |
| 9 | Post-merge verification failure | Added "hot-fix slice or revert, never silent patch" subsection. |
| 10 | Branch + commit naming | Promoted to dedicated subsection. |
| 11 | Glossary | Added at bottom. |
| 12 | Migration safety | Added rollback drill cadence requirement. |
| 13 | When NOT to use this methodology | Added section. |
| 14 | CI tool | Fixed to GitHub Actions. Removed "or equivalent." |
| 15 | Project board | Fixed to Asana. Removed "default — swap if you want." |
| 16 | Slice sizing | Spelled out 280 / 300 / 450 line band rationale. |
| 17 | Templates | Moved 3 long templates to `docs/methodology/templates/`. |
| 18 | Per-audit setup checklist | Merged into Phase Z deliverables checklist. |
| 19 | Quick reference | Added 5-rule summary at top. |
| 20 | Anti-patterns | Expanded with 5+ new pitfalls (silent baseline anchoring, direct push to main, stub ID reuse, etc.). |
