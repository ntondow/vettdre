# BMS Overhaul — Autonomous Loop Bootstrap

**Created:** 2026-04-28 (companion to `bms-audit-2026-04-28.md`)
**Purpose:** Single document Nathan pastes into Claude Code. Claude Code does setup + works through 22 slices over ~4 weeks with phase-level approval checkpoints.

---

## How to use this doc

1. Open Claude Code in `/Users/nathantondow/Documents/vettdre`.
2. Paste the **"Bootstrap prompt"** section below as your first message.
3. Claude Code runs Phase Z (setup) — pushes branch, adds Vitest, writes `CLAUDE.md` and `SLICES.md` into the repo.
4. Claude Code stops at the end of Phase Z and asks: "Phase Z complete. Approve to start Phase 0?"
5. You say yes (after eyeballing the setup PR), Claude Code starts Phase 0 (5 slices).
6. Repeat per phase. ~4 phases over 4 weeks. You're in the loop maybe 30 minutes per phase.

**Total time investment from you:** ~2 hours over 4 weeks (review PRs end-of-phase + answer Claude Code's clarifying questions when blocked).

---

## Bootstrap prompt — paste this into Claude Code

```
You are the BMS Overhaul Loop Agent for the vettdre repo. Your job is to work
through a 4-week, 4-phase, 22-slice overhaul of the brokerage management system.

Read these documents in this exact order before doing anything:

1. /Users/nathantondow/Documents/vettdre/CLAUDE.md (existing repo conventions)
2. /Users/nathantondow/Documents/vettdre/bms-audit-2026-04-28.md (the audit + redesign + handoff)
3. /Users/nathantondow/Documents/vettdre/bms-overhaul-bootstrap.md (this file —
   contains the SLICES content, agent constitution, and Phase Z setup steps below)

After reading, follow the "Phase Z — Setup" steps in section 4 of the bootstrap doc.
Do NOT start any other phase until Phase Z is complete and Nathan has approved.

When Phase Z is complete:
- Stop.
- Summarize what you did.
- List the PRs you opened (or commits if PAT still blocked).
- Ask Nathan: "Phase Z complete. Approve to start Phase 0 (data + override consistency, 5 slices)?"

For every subsequent phase, follow the same pattern: work through all slices in the
phase, open one PR per slice, run `npm run check` before each commit, then stop and
ask for approval before the next phase.

Your operating principles are in section 3 of the bootstrap doc. Read them carefully.
The most important: never bypass `npm run check`, never merge to main, never deploy to
prod, and always update SLICES.md status as you go.
```

That's it. That's the entire prompt. Paste it, walk away, check in when Claude Code asks.

---

## 1. The four-week ship plan (recap from audit)

| Phase | Goal | Slices | Approval gate |
|-------|------|--------|---------------|
| **Phase Z** | Setup — push branch, add tests, write SLICES.md | Z1–Z5 | Nathan reviews setup PR |
| **Phase 0** | Stop the bleeding — data + override consistency | 0a, 0b, 0c, 0d, 14 | Nathan reviews 5 PRs |
| **Phase 1** | Manager workflow consolidation | 1a, 1, 2, 3, 1b, 4 | Nathan reviews 6 PRs |
| **Phase 2** | Agent + Client Onboarding fundamentals | 7a, 17, 18, 13, 6 | Nathan reviews 5 PRs |
| **Phase 3** | Sidebar IA overhaul + polish | 7, 8, 9, 10, 19, 20 | Nathan reviews 6 PRs |

Total: 27 slices across 5 phases. ~22 surface slices + 5 setup slices.

---

## 2. Phase Z — Setup (Claude Code runs these in order)

### Slice Z1 — Resolve GitHub PAT and push parent branch

**Goal:** Get `feat/super-admin-cross-tenant-view` (8 unpushed commits) onto origin so the new overhaul branch has a stable, recoverable baseline.

**Steps:**
1. Run `git status` and `git log origin/feat/super-admin-cross-tenant-view..HEAD --oneline` to confirm the 8 commits are still local.
2. Test the existing PAT: `git push origin feat/super-admin-cross-tenant-view --dry-run`. If it fails with auth error, ask Nathan: "GitHub PAT push failing. Options: (a) generate a new PAT (instructions below), (b) switch to SSH, (c) use `gh auth login`. Which do you prefer?" Wait for response.
3. Once auth works, push: `git push origin feat/super-admin-cross-tenant-view`.
4. Confirm `backup/super-admin-pre-rebase-2026-04-27` tag is pushed too: `git push origin backup/super-admin-pre-rebase-2026-04-27`.
5. Mark Z1 done in SLICES.md.

**Stop and ask if blocked.** Don't try to brute-force the PAT issue.

### Slice Z2 — Create overhaul branch

**Goal:** Branch `feat/bms-overhaul-2026-q2` from the now-pushed `feat/super-admin-cross-tenant-view`. All overhaul work lands here.

**Steps:**
1. `git checkout feat/super-admin-cross-tenant-view`
2. `git pull origin feat/super-admin-cross-tenant-view`
3. `git checkout -b feat/bms-overhaul-2026-q2`
4. `git push -u origin feat/bms-overhaul-2026-q2`
5. Mark Z2 done.

### Slice Z3 — Add Vitest scaffolding

**Goal:** Minimum test infrastructure so the autonomous loop has a safety net. Five smoke tests covering critical-path render.

**Steps:**

1. Install: `npm install --save-dev vitest @vitejs/plugin-react happy-dom @testing-library/react @testing-library/jest-dom`.
2. Create `vitest.config.ts` at repo root:
   ```ts
   import { defineConfig } from 'vitest/config';
   import react from '@vitejs/plugin-react';
   import path from 'path';

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'happy-dom',
       setupFiles: ['./tests/setup.ts'],
       globals: true,
     },
     resolve: {
       alias: { '@': path.resolve(__dirname, './src') },
     },
   });
   ```
3. Create `tests/setup.ts`:
   ```ts
   import '@testing-library/jest-dom';
   ```
4. Create `tests/smoke/critical-paths.test.ts`. Five tests, each hitting a critical-path server action or page route. Use Prisma mocks. Goal: each test confirms the page-level component imports + renders without throwing. (Don't aim for full coverage — just "if Claude Code breaks one of these, CI catches it.")
   - Test 1: `BrokerageDashboard` renders given empty data.
   - Test 2: `DealSubmissionsList` renders given a sample submission.
   - Test 3: `InvoicesList` renders empty state.
   - Test 4: `PaymentsList` renders empty state.
   - Test 5: `AgentsList` renders given a sample agent.

   *If component-level testing requires too much mocking, fall back to: each test imports the page module and confirms the default export exists.* Coverage is the floor, not the ceiling.

5. Add to `package.json` scripts:
   ```json
   "test": "vitest run",
   "test:watch": "vitest",
   "check": "npm run lint && tsc --noEmit && npm run test && npm run build"
   ```
   Note: `tsc --noEmit` will error because TypeScript strict mode is off and `ignoreBuildErrors: true` is set in `next.config.ts`. Don't fight that yet — typecheck still catches some real errors. Phase 3 polish slice will turn strict back on.
6. Run `npm run check`. Confirm it passes (or surface errors). Fix what you can; ask Nathan if anything is structurally weird.
7. Commit: `feat(test): add Vitest with 5 smoke tests`.
8. Mark Z3 done.

### Slice Z4 — Write CLAUDE.md agent constitution at repo root

**Goal:** Operating principles + repo facts that every Claude Code session loads automatically. The existing `CLAUDE.md` already has codebase docs; you're appending an "Agent operating principles" section.

**Steps:**

1. Read existing `CLAUDE.md`.
2. Append the section in [Section 3 below — copy verbatim].
3. Commit: `docs(agent): add operating principles for BMS overhaul loop`.
4. Mark Z4 done.

### Slice Z5 — Create SLICES.md in repo root

**Goal:** The single source of truth for the work. Claude Code reads this every session, marks slices done, and moves on.

**Steps:**

1. Create `/Users/nathantondow/Documents/vettdre/SLICES.md` with the contents in [Section 5 below — copy verbatim].
2. Commit: `docs(plan): add SLICES.md task list for BMS overhaul`.
3. Mark Z5 done.
4. Open a PR for the entire Phase Z work: `gh pr create --base main --head feat/bms-overhaul-2026-q2 --title "Phase Z: Bootstrap BMS overhaul (tests + agent docs + slice list)" --body "Setup phase. See bms-overhaul-bootstrap.md for context. Reviews welcome on the test scaffolding + slice list. After this lands, Phase 0 begins."`. If `gh` isn't available, use the `git push` URL from the terminal output to manually open the PR.
5. **Stop. Ask Nathan: "Phase Z complete. PR opened: [link]. Approve to start Phase 0?"**

---

## 3. Agent operating principles (copy into CLAUDE.md as a new section)

```markdown
## Agent operating principles for the BMS overhaul loop (added 2026-04-28)

This section governs Claude Code agents working on the BMS overhaul. The slice-list
is in SLICES.md. The audit + redesign rationale is in bms-audit-2026-04-28.md.

### Core rules

1. **Never skip `npm run check`.** Before every commit. If it fails, fix or revert —
   never `git commit --no-verify`.
2. **Never merge to main.** PRs only. Nathan reviews and merges.
3. **Never deploy to production.** No `gcloud builds submit`. No `gcloud run deploy`.
   Nathan owns deploys.
4. **Never modify infrastructure files** (cloudbuild.yaml, Dockerfile, secrets, GCP
   config) without explicit approval in chat.
5. **Never modify another slice's work.** If your slice exposes a bug in a previous
   slice, file a follow-up slice in SLICES.md and finish your current one.
6. **Update SLICES.md as you go.** Mark slice status (`pending` → `in_progress` →
   `awaiting_review` → `done`). Add notes if you encountered surprises.

### Workflow per slice

1. Read the slice in SLICES.md.
2. Read the audit doc section it references.
3. Read the files listed in "files likely involved."
4. **Propose a plan in chat to Nathan before writing code** if the slice is
   tagged `requires-approval` or you're touching the data layer (`prisma/`,
   migrations, server actions in lib/team-context.ts or similar).
5. Implement. Run `npm run check` periodically as you go.
6. Add 1-3 tests for the change (where reasonable — not all changes need tests).
7. Run `npm run check` once more.
8. Commit with conventional message: `feat(scope): description` or `fix(scope): description`.
9. Push. Open PR with body referencing the slice ID and the audit bug IDs it closes.
10. Mark slice `awaiting_review` in SLICES.md.
11. Pick up the next pending slice and repeat.

### Stop conditions

Stop and ask Nathan when:
- A slice is tagged `requires-approval` and you've finished discovery.
- You hit a 503 or unexplained server error in production while testing.
- A test is failing and you can't determine if it's flaky or a real regression.
- A slice's scope has grown beyond ~300 lines of changes; offer to split.
- The data layer change is risky enough to warrant a backup / migration dry-run.
- End of phase reached. Always stop between phases.

### Phase boundaries

After completing all slices in a phase:
1. Run `npm run check` once more to confirm clean state.
2. Update SLICES.md phase status to `awaiting_review`.
3. Summarize the phase in chat: PR links, what changed, what to verify.
4. Ask Nathan: "Phase N complete. Approve to start Phase N+1?"
5. Wait. Don't start the next phase until told.

### What you have permission to do without asking

- Read any file in the repo.
- Write/edit any file outside `prisma/`, `cloudbuild.yaml`, `Dockerfile`, `next.config.ts`,
  `.env*`, `package.json` (you can add scripts; don't remove or rename).
- Run any `npm run` script.
- Run any `git` command except `git push --force`, `git push origin main`, `merge to main`.
- Run any `gh` command except `gh pr merge` (PR creation OK; merge is Nathan's).
- Open and read URLs on app.vettdre.com for testing (read-only).

### What requires explicit approval

- Modify `prisma/schema.prisma` or any migration.
- Touch authentication / authorization logic in `middleware.ts` or
  `lib/supabase/middleware.ts`.
- Modify `lib/team-context.ts` (the org-context choke point).
- Touch any `cloudbuild*`, `Dockerfile*`, `.env*`, or GCP secret config.
- Force-push, merge to main, deploy.
- Reorder or remove slices from SLICES.md.
```

---

## 4. SLICES.md content (copy verbatim into repo root)

```markdown
# BMS Overhaul — Slice List (SLICES.md)

**Created:** 2026-04-28 from bms-audit-2026-04-28.md and bms-overhaul-bootstrap.md.
**Branch:** feat/bms-overhaul-2026-q2
**Audit reference:** /Users/nathantondow/Documents/vettdre/bms-audit-2026-04-28.md

This file is the single source of truth for the work. Claude Code agents update
status fields as they go. Nathan approves at phase boundaries.

---

## Status legend
- `pending` — not started
- `in_progress` — currently being worked on
- `awaiting_review` — PR open, waiting for Nathan
- `done` — PR merged
- `blocked` — needs Nathan's input (note why)

## Phase legend
- `Z` — Setup (one-time)
- `0` — Data + override consistency
- `1` — Manager workflow consolidation
- `2` — Agent + Client Onboarding
- `3` — IA + polish

---

## Phase Z — Setup

### Z1 — Push parent branch
- **Status:** pending
- **Goal:** Push feat/super-admin-cross-tenant-view (8 unpushed commits) to origin.
- **Closes bug:** N/A (infra)
- **Files:** None (git only)
- **Discovery:** `git status`, `git log origin/...HEAD --oneline`
- **Success criteria:** `git push --dry-run` succeeds without auth error; backup tag pushed.
- **Requires approval:** YES — ask Nathan how to fix the PAT before pushing.

### Z2 — Create overhaul branch
- **Status:** pending
- **Goal:** Branch feat/bms-overhaul-2026-q2 from feat/super-admin-cross-tenant-view.
- **Files:** None (git only)
- **Success criteria:** Branch exists on origin, tracking set up.
- **Depends on:** Z1
- **Requires approval:** No.

### Z3 — Vitest scaffolding
- **Status:** pending
- **Goal:** Add Vitest + 5 smoke tests + `npm run check` script.
- **Files:** vitest.config.ts (new), tests/setup.ts (new), tests/smoke/critical-paths.test.ts (new), package.json (script additions only).
- **Success criteria:** `npm run check` passes locally.
- **Depends on:** Z2
- **Requires approval:** No, but show Nathan the test fixtures before committing.

### Z4 — Agent constitution in CLAUDE.md
- **Status:** pending
- **Goal:** Append "Agent operating principles" section to CLAUDE.md.
- **Files:** CLAUDE.md (append only — do not modify existing content).
- **Success criteria:** Section renders cleanly; commits without conflicts.
- **Depends on:** Z2
- **Requires approval:** No.

### Z5 — SLICES.md committed
- **Status:** pending
- **Goal:** This file. Commit it. Open the Phase Z PR.
- **Files:** SLICES.md (this file).
- **Success criteria:** PR open, all Z slices marked `awaiting_review`.
- **Depends on:** Z1–Z4
- **Requires approval:** No (this slice opens the approval gate).

**[PHASE Z APPROVAL GATE — STOP HERE]**

---

## Phase 0 — Data + override consistency (Week 1)

### 0a — Single deal data model
- **Status:** pending
- **Goal:** Decide canonical store for "deals." Recommend: `DealSubmission` for inbound, `Transaction` for closed. Deprecate CRM `Deal` for BMS use cases.
- **Closes bug:** B-002, B-004 (root cause)
- **Files:** prisma/schema.prisma (read-only at first), lib/bms-types.ts, src/app/(dashboard)/brokerage/dashboard/page.tsx, plus any server actions querying deals
- **Discovery:** Map every BMS surface to its DB query. Document in docs/bms-data-sources.md.
- **Success criteria:** Document committed; Nathan approves the canonical-store choice.
- **Depends on:** Z5
- **Requires approval:** YES — Nathan picks the canonical store before code.

### 0b — Backfill Gulino's missing Invoice + Payment records
- **Status:** pending
- **Goal:** 18 paid DealSubmissions in Gulino's tenant have no corresponding Invoice/Payment rows. Backfill them so financial surfaces reconcile.
- **Closes bug:** B-007, B-008
- **Files:** scripts/backfill-gulino-invoices.ts (new), prisma/schema.prisma (read-only)
- **Discovery:** Compare Gulino's DealSubmissions (status=Paid) to Invoice + Payment rows. Cross-reference with gulino-payout-reconciliation.xlsx.
- **Success criteria:** Script idempotent (re-runnable). Dry-run mode shows what will be inserted. Nathan approves before live run.
- **Depends on:** 0a
- **Requires approval:** YES — Nathan approves dry-run output before live run.

### 0c — Override consistency on User/BrokerAgent/Onboarding/Settings
- **Status:** pending
- **Goal:** Sweep all DB queries that take orgId, route through getCurrentOrgContext(). Add unit test per surface.
- **Closes bug:** B-009, B-010, B-012, B-013, B-022, B-031
- **Files:** lib/team-context.ts (read), src/app/(dashboard)/brokerage/agents/*, settings/*, client-onboarding/*, reports/*, any actions.ts in those folders.
- **Discovery:** Grep for `prisma.user.find` and `prisma.brokerAgent.find` and `prisma.clientOnboarding.find` — find the ones that don't go through getCurrentOrgContext.
- **Success criteria:** All callsites route through helper. New test in tests/smoke/override-scoping.test.ts confirms super_admin with `?as_org=X` queries for X, not home org.
- **Depends on:** Z5
- **Requires approval:** No, but stop if you find a >5-line change to middleware.ts.

### 0d — Override banner z-index fix
- **Status:** pending
- **Goal:** Banner currently cut off ("g as Gulino Group" — "Viewing as" hidden behind sidebar logo).
- **Closes bug:** B-001
- **Files:** Wherever the override banner component lives. Grep "Viewing as".
- **Success criteria:** Banner renders with full text, doesn't overlap sidebar.
- **Depends on:** None
- **Requires approval:** No.

### 14 — Reliability fix on /brokerage/client-onboarding 503s
- **Status:** pending
- **Goal:** Track down the 503s observed in production network log. Add structured error handling.
- **Closes bug:** B-027, B-028
- **Files:** src/app/(dashboard)/brokerage/client-onboarding/actions.ts, page.tsx; possibly src/lib/onboarding-* libs
- **Discovery:** Reproduce the 503. Check Cloud Run logs. Identify if it's cold-start, DB pool exhaustion, server-action timeout, or something else. Add Sentry breadcrumbs.
- **Success criteria:** No more 503s during smoke testing. Failed POSTs return structured `{success: false, error}`. Send Invite button shows loading state.
- **Depends on:** Z5
- **Requires approval:** YES if root cause requires infra change (Cloud Run scaling, DB pool size).

**[PHASE 0 APPROVAL GATE — STOP HERE]**

---

## Phase 1 — Manager workflow consolidation (Week 2)

### 1a — Make table rows clickable across BMS
- **Status:** pending
- **Goal:** Rows in deal-submissions, transactions, invoices, agents, onboarding open detail panel on click.
- **Closes bug:** B-006
- **Files:** Each list page + table component.
- **Success criteria:** Click opens detail. Keyboard navigation works (Enter on row).
- **Depends on:** Phase 0 done
- **Requires approval:** No.

### 1 — Unified Pending Approval queue
- **Status:** pending
- **Goal:** /brokerage/deal-submissions becomes the manager's primary inbox. Card layout. Inline expand-to-detail. "Approve & Push to Invoice" primary CTA.
- **Closes bug:** B-006 (alongside 1a). Major UX uplift.
- **Files:** src/app/(dashboard)/brokerage/deal-submissions/* and components.
- **Success criteria:** Manager can approve a submission and create an Invoice in one click.
- **Depends on:** 1a, Phase 0
- **Requires approval:** YES — show wireframe / progress to Nathan before final styling.

### 2 — Invoice creation in-context
- **Status:** pending
- **Goal:** Approving a submission auto-creates an Invoice draft. Manager doesn't navigate to /invoices separately.
- **Files:** server actions for approval flow; Invoice model.
- **Success criteria:** Approve triggers Invoice insert with the right values; visible on Invoices list.
- **Depends on:** 1
- **Requires approval:** No.

### 3 — Payment recording in-context
- **Status:** pending
- **Goal:** Manager can record payment on the deal-detail panel. Invoice status updates to Paid.
- **Files:** deal-detail panel + Payment server action.
- **Success criteria:** Payment recorded; Invoice marked paid; audit log entry.
- **Depends on:** 2
- **Requires approval:** No.

### 1b — Default landing per role
- **Status:** pending
- **Goal:** Manager logs in → /brokerage/dashboard. Agent → /brokerage/my-deals. Super_admin → admin home.
- **Closes bug:** B-018
- **Files:** middleware.ts, src/app/page.tsx, possibly src/lib/supabase/middleware.ts
- **Success criteria:** Each role lands correctly. Test as Anthony, as Nathan, as a manager-role user.
- **Depends on:** None blocking
- **Requires approval:** YES — middleware change.

### 4 — Manager dashboard rebuild
- **Status:** pending
- **Goal:** Replace 11-KPI grid with role-specific dashboard. 4 KPIs, "Pending review (n) →", today's tasks, top-3 leaderboard, this-month financials.
- **Closes bug:** B-002, B-003 (now that data reconciles), addresses U-006, U-007, U-011
- **Files:** src/app/(dashboard)/brokerage/dashboard/page.tsx, components/bms/*
- **Success criteria:** Dashboard shows correct numbers (matches Submissions/Transactions). One primary CTA visible.
- **Depends on:** 0a, 0b
- **Requires approval:** YES — show progress before final layout.

**[PHASE 1 APPROVAL GATE — STOP HERE]**

---

## Phase 2 — Agent + Client Onboarding (Week 3)

### 7a — Agent picker on Onboarding form
- **Status:** pending
- **Goal:** Form has agent dropdown. Defaults to current user; admin/owner can pick.
- **Closes bug:** B-024
- **Files:** src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx + actions.
- **Success criteria:** Picker only shows agents in current tenant. Onboarding assigned to picked agent.
- **Depends on:** Phase 1
- **Requires approval:** No.

### 17 — Onboarding form UX cleanup
- **Status:** pending
- **Goal:** Fix placeholder-as-prefill (B-025/B-026), currency formatting on blur, Send Invite loading state, conditional Personal Note based on delivery method.
- **Closes bug:** B-023, B-025, B-026, B-029
- **Files:** new/page.tsx + components.
- **Success criteria:** Manual smoke test — form behaves correctly through full submit cycle.
- **Depends on:** 14, 7a
- **Requires approval:** No.

### 18 — Onboarding empty state + list reliability
- **Status:** pending
- **Goal:** Payments-style empty state on /client-onboarding. Investigate B-019 (same URL → different data).
- **Closes bug:** B-019, U-071
- **Files:** /client-onboarding/page.tsx; data fetch.
- **Success criteria:** Empty state with illustration + CTA when 0 records. Same URL produces same data on multiple loads.
- **Depends on:** 0c (override fix should resolve B-019 root cause)
- **Requires approval:** No.

### 13 — Profile-completion banner for agents
- **Status:** pending
- **Goal:** When agent's profile (License #, Phone, Email) is incomplete, show banner on /my-deals + Settings.
- **Closes bug:** B-017
- **Files:** my-deals + settings/profile pages.
- **Success criteria:** Banner shows for incomplete profile; banner dismisses after fields filled.
- **Depends on:** None blocking
- **Requires approval:** No.

### 6 — Default landing for agent (continued from 1b if needed)
- **Status:** pending
- **Goal:** Confirm 1b covers agent flow. If not, add agent-specific landing logic.
- **Depends on:** 1b
- **Requires approval:** No.

**[PHASE 2 APPROVAL GATE — STOP HERE]**

---

## Phase 3 — IA + polish (Week 4)

### 7 — Single sidebar per role
- **Status:** pending
- **Goal:** Brokerage admins → brokerage-shaped sidebar (no investor-shaped global sidebar). Agents → agent-shaped sidebar (existing MY WORK / COMMUNICATION / RESEARCH).
- **Closes bug:** addresses U-001 through U-005, U-012
- **Files:** src/components/layout/sidebar.tsx, mobile-nav.tsx, dashboard layout.tsx
- **Success criteria:** Manual test as each role. No "Acquisitions / Closing" jargon for brokerage admins. No Brokerage section visible to pure agents.
- **Depends on:** Phase 2
- **Requires approval:** YES — show wireframe.

### 8 — Brokerage nav flatten
- **Status:** pending
- **Goal:** From 7 sections × 14 items to 3 sections × 8-10 items.
- **Closes bug:** U-013, U-014, U-016
- **Files:** brokerage layout sub-sidebar.
- **Success criteria:** Manager nav matches consulting proposal in audit doc.
- **Depends on:** 7
- **Requires approval:** No.

### 9 — Replace mixed icons + ALL CAPS labels
- **Status:** pending
- **Goal:** All-lucide. Mixed-case section labels.
- **Closes bug:** U-002, U-004
- **Files:** sidebar components.
- **Success criteria:** No emoji icons. No ALL CAPS section headers.
- **Depends on:** 7
- **Requires approval:** No.

### 10 — Empty states pattern across all surfaces
- **Status:** pending
- **Goal:** Every surface has Payments-style empty state (illustration + helpful subtitle + primary CTA).
- **Closes bug:** U-029, U-071
- **Files:** Every list page.
- **Success criteria:** Manual sweep confirms.
- **Depends on:** Phase 2
- **Requires approval:** No.

### 19 — Document template management UI
- **Status:** pending
- **Goal:** Settings → Brokerage → Templates tab. Upload custom PDFs + map fields.
- **Closes bug:** U-076, U-084
- **Files:** new — settings templates page + template upload action.
- **Success criteria:** Brokerage admin can upload + map a custom doc. Visible in onboarding form.
- **Depends on:** Phase 2
- **Requires approval:** YES — biggest new feature, scope check.

### 20 — Signing flow end-to-end audit + fixes
- **Status:** pending
- **Goal:** Walk /sign/[token] flow. Test mobile, multi-device, resume mid-signing. Fix what breaks.
- **Closes bug:** Various deferred from initial audit
- **Files:** src/app/sign/[token]/* + signing components.
- **Success criteria:** Manual + smoke test pass on mobile + desktop.
- **Depends on:** Phase 2
- **Requires approval:** No.

**[PHASE 3 APPROVAL GATE — STOP HERE]**

---

## After Phase 3

The post-launch hygiene queue from bms-audit-2026-04-28.md (Prisma schema drift,
last_login_at, magic-link guard, transactions.stage, co-broker invoice path,
TypeScript strict mode, etc.) becomes the next sprint of slices. Add as `Phase 4 —
Hygiene` when Phase 3 ships.

The future-features list (Cmd-K, in-app messaging, scheduled reports, mobile-optimized
agent flow, bulk approve) becomes `Phase 5 — Q3 features`. Don't start until product
direction is clear.
```

---

## 5. Operational notes

### What if Claude Code gets stuck mid-phase?

Worst case scenario: Claude Code crashes, or you close the laptop, or it hits a blocker it can't solve. Recovery:

1. Open a new Claude Code session in the same repo.
2. Paste this prompt:
   ```
   Resume the BMS overhaul loop. Read CLAUDE.md and SLICES.md to find your place.
   The slice marked `in_progress` is where the previous session left off. Continue from there.
   If you find any commits or branches from the previous session that look incomplete,
   ask me before reverting or modifying.
   ```
3. Claude Code reads SLICES.md, picks up where it left off.

The on-disk SLICES.md status field is the resumability mechanism. As long as Claude Code keeps it updated (per the operating principles), recovery is automatic.

### Parallelism (advanced — for after Phase 0 lands)

Once Phase 0 is done, you can run parallel work via git worktrees. Two Claude Code sessions on independent slices in Phase 1 / Phase 2:

```bash
cd /Users/nathantondow/Documents/vettdre
git worktree add ../vettdre-phase1 feat/bms-overhaul-2026-q2
git worktree add ../vettdre-phase2 feat/bms-overhaul-2026-q2
```

Open Claude Code in each worktree. Tell Session 1 to claim slices in Phase 1. Tell Session 2 to claim slices in Phase 2. They share SLICES.md, so they coordinate via the status field — no double-claiming.

Don't try this until Phase 0 is done and the workflow is stable. Adds merge-conflict risk.

### Checking progress without interrupting

```bash
cd /Users/nathantondow/Documents/vettdre
cat SLICES.md | grep -E "^### |^- \*\*Status:\*\*"
```

This prints every slice + its current status. Run it to see where the agent is.

### When to abort

Abort the loop and revert if:
- A test starts flaking and Claude Code is silently retrying.
- Claude Code spends >2 hours on a single slice.
- A slice's commit list shows >5 commits with `wip` or `try X` messages — usually means agent is thrashing.
- Production breaks (you'll see it because Cloud Run alerts will fire).

Recovery: `git reset --hard HEAD~N` on the agent's branch, mark the slice `pending` again, leave a note in SLICES.md, restart with a fresher prompt.

---

## 6. Summary — what I'm shipping you

1. **This bootstrap doc.** Paste the prompt in section "Bootstrap prompt" into Claude Code. Walk away.
2. **The audit doc** (`bms-audit-2026-04-28.md`) — the agent's reference for "why are we doing this."
3. **An operating principles section** (in this doc, section 3) — Claude Code copies this into the repo's `CLAUDE.md` during Phase Z.
4. **A slice list** (in this doc, section 4) — Claude Code copies this verbatim into `SLICES.md` during Phase Z.

After paste, your job is:
- Approve the GitHub PAT fix (one-time).
- Review one PR per phase boundary (4 review sessions over 4 weeks, ~30 min each).
- Answer Claude Code's questions when it stops at a `requires-approval` slice.

Total time investment from you: ~2-3 hours over 4 weeks. The rest happens autonomously.
