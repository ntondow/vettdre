# Audit Sprint Plan — 2026-05-02

**Sprint goal:** Close out BMS audit + ship Phase Z infrastructure for site-wide speed audit + complete Phase 0 discovery swarm.
**Sprint length:** ~2 weeks (10-12 working days).
**Methodology:** v2.2 (`docs/methodology/slice-based-audit.md`).
**Owner:** Nathan, with Claude Code as agent.

**2026-05-02 update:** pre-flight check surfaced major blockers:
- 43,237 Finder dupes in repo blocking any safe `git add .`. Cleanup script in chat for Nathan's local terminal — must run before docs PR.
- No GitHub Actions, no playwright harness. Methodology bumped to v2.1.1; Z.0a and Z.0b slices added to speed audit Phase Z to fill gaps.
- Stale `.git/index.lock` blocking git ops. Nathan clears locally as part of cleanup script.
- Wrong path `tests/smoke-contracts/` corrected to `tests/smoke/` (existing convention, 21 files already there).

---

## Sprint success criteria

By end of sprint:

- [ ] BMS Overhaul audit fully archived: 3 closeout slices merged + deployed + verified, manual Gulino e2e test passed, retro written.
- [ ] Speed audit Phase Z complete: 6 instrumentation slices shipped, baselines anchored in CLAUDE.md, playwright harness exists (built if not).
- [ ] Speed audit Phase 0 complete: per-area audit docs from swarm + synthesis doc reviewed.
- [ ] Speed audit Phase 1 scope defined and ready to start.
- [ ] All sprint work follows methodology v2.1 (plan-of-record in SLICES, smoke contracts in `tests/smoke/`, verification artifacts in PR comments).

---

## Right now — the next 3 actions

### Action 1: Pre-flight check (15 min)

Run these in order. If any fails, stop and surface.

```bash
cd /Users/nathantondow/Documents/vettdre

# 1. Confirm CI exists and what jobs run
ls -la .github/workflows/ 2>&1 || echo "NO GITHUB ACTIONS — Phase Z needs to add"

# 2. Confirm playwright harness exists
ls -la playwright.config.* tests/e2e/ 2>&1 || echo "NO PLAYWRIGHT — Phase Z slice 0 needed"

# 3. Confirm Sentry server config exists
ls -la sentry.server.config.* sentry.client.config.* instrumentation.ts 2>&1 || echo "NO SENTRY CONFIG — Z.4 will install"

# 4. Confirm migrations registry exists
ls -la migrations/registry.json 2>&1 || echo "NO REGISTRY — create empty array file: echo '[]' > migrations/registry.json"

# 5. Capture lint baseline
NODE_OPTIONS=--max-old-space-size=8192 npm run lint 2>&1 | grep -cE "^\s+\d+:\d+\s+error" || echo "lint script broken"

# 6. Capture typecheck baseline
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "error TS" | grep -vE "^[^(]* [0-9]+(\.test)?\.tsx?\(" | wc -l || echo "typecheck broken"
```

Expected vs. actual numbers (per CLAUDE.md): lint 4484, typecheck 285. If either is materially different (>10 off), surface in chat — methodology says re-anchor before proceeding.

### Action 2: Resolve the 10 speed audit decisions (10 min)

Open `docs/handoff/site-wide-speed-audit-2026-05-02.md`, scroll to "Open decisions for Nathan" near the bottom. Reply yes/no per row in chat. Defaults proposed for all 10. Most important to commit on:

- **#7** — Split SLICES.md into per-audit files. **Strong yes** so the closeout slice can rename current SLICES.md → SLICES-bms.md cleanly.
- **#3** — Sentry sample rate. **Default 0.1** is fine to start.
- **#5** — Slow query threshold. **200/500ms** is industry default.

The other 7 can default-accept without thinking.

### Action 3: Commit the 5 docs in one PR (20 min)

```bash
cd /Users/nathantondow/Documents/vettdre
git checkout -b docs/audit-methodology-v2-1
git add docs/methodology/slice-based-audit.md \
        docs/methodology/templates/ \
        docs/methodology/archive/ \
        docs/handoff/bms-closeout-2026-05-02.md \
        docs/handoff/site-wide-speed-audit-2026-05-02.md \
        docs/handoff/audit-sprint-plan-2026-05-02.md
git status  # confirm only the docs are staged
git commit -m "docs(methodology): add v2.1 audit playbook + BMS closeout + speed audit kickoff"
git push -u origin docs/audit-methodology-v2-1
gh pr create --title "docs(methodology): v2.1 audit playbook + BMS closeout + speed audit kickoff" --body "$(cat <<'EOF'
## Summary

- New durable methodology at `docs/methodology/slice-based-audit.md` (v2.1)
- Three copy-paste templates moved to `docs/methodology/templates/`
- BMS Overhaul closeout plan at `docs/handoff/bms-closeout-2026-05-02.md`
- Site-wide speed audit kickoff at `docs/handoff/site-wide-speed-audit-2026-05-02.md`
- Sprint sequencing at `docs/handoff/audit-sprint-plan-2026-05-02.md`

## v2.1 changes from uploaded slice-methodology.md

See "v2.1 → v2 diff" table at the end of the methodology doc.

Key locks:
- Parallel slices BANNED outright (with documented escape hatch).
- CI = GitHub Actions. Project board = Asana. No more "or equivalent."
- Plan-of-record lives in SLICES.md, not chat.
- Smoke contracts at `tests/smoke/<slice-id>.test.ts`.
- End-of-phase + end-of-audit gates as literal checklists with sign-off.

## Why merge now

Sprint depends on this being authoritative before any closeout slice opens.
EOF
)"
```

Merge this PR before opening any other slice. The methodology must be in `main` so future slice PRs can reference it.

---

## Sprint sequencing

### Day 1 (today/tomorrow): pre-flight + docs PR + slice 22 kickoff

After Actions 1-3 above land:

- Open `docs/handoff/bms-closeout-2026-05-02.md`, copy Item 1 kickoff prompt, paste into a fresh Claude Code session.
- Wait for plan-of-record. Approve in chat.
- Wait for PR.
- Review, merge, deploy, verify.

Estimated time: ~3 hours including agent work + your review + deploy + verification.

### Day 2: BMS slices 2 + 3

- Item 2: `.gcloudignore` (small, ~1 hour total).
- Item 3: Phase 5 stub naming cleanup (small, ~1 hour total).

### Day 3: BMS manual verifications

- Item 4: Manual Gulino end-to-end onboarding test (~45 min).
- Item 5: Sale transaction Value visibility check (~5 min).
- Item 6: iPad real-finger smoke test (~20 min, requires hardware).

If iPad isn't available, defer to Day 5 or later. Other items not blocking.

### Day 4: BMS audit closeout

- Mark all closeout items `done` in SLICES.md.
- Move `docs/handoff/bms-audit-2026-04-28.md` → `docs/handoff/archive/`.
- Move `docs/handoff/bms-closeout-2026-05-02.md` → `docs/handoff/archive/`.
- Archive Asana BMS Overhaul project.
- Write retro at `docs/handoff/bms-overhaul-retrospective-2026-05-02.md`.
- Sign off the BMS audit end-of-audit gate per methodology v2.1 checklist.

### Day 5-9: Speed audit Phase Z

In strict order (each slice depends on the previous):

**Day 5 (morning):** Z.6 — Asana board + SLICES split. Renames `SLICES.md` → `SLICES-bms.md`, creates `SLICES-speed.md`, creates new top-level `SLICES.md` index. Asana project setup is Nathan-side in browser.

**Day 5 (afternoon):** Z.0a — GitHub Actions CI skeleton. Adds 4 PR-blocking jobs (typecheck, lint, test, build). Kickoff prompt is in `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.0a". Nathan also configures branch protection in GitHub UI after merge.

**Day 6 (morning):** Z.0b — Playwright harness scaffold + first 5 flows. Kickoff prompt at §"Z.0b" of speed audit doc. Remaining 5 flows go to a Phase 1 follow-up slice.

Methodology bumped to v2.2 in slice `bms-audit-closeout-followup-methodology-tracking` (this PR); Z.0a/Z.0b will further close the v2.1.1 CI/playwright caveats once shipped.

**Day 6:** Z.1 — bundle analyzer + baseline report.

**Day 7:** Z.2 — Lighthouse CI on top 10 routes (depends on playwright harness being able to authenticate).

**Day 8 (morning):** Z.3 — Prisma slow query log.

**Day 8 (afternoon):** Z.4 — Sentry Performance enable + custom spans.

**Day 9:** Z.5 — Cloud Run cold start measurement + /api/health endpoint.

**End-of-Phase-Z gate (Day 9 evening):** sign off the gate per methodology checklist. Baselines committed to CLAUDE.md. All Z slices `done` in SLICES-speed.md.

### Day 10-11: Speed audit Phase 0 swarm

- Spawn area agents in batches of 3 using `docs/methodology/templates/phase-0-swarm-prompt.md`.
- Areas in priority order (highest expected ROI first):
  - Batch 1: Market Intel, Terminal, Underwriting (heaviest data + AI)
  - Batch 2: Messages, Calendar, BMS (heaviest UX + complex queries)
  - Batch 3: Properties, Leasing, Onboarding (medium complexity)
  - Batch 4: Dashboard, Contacts, Pipeline, Settings, Public chat, Public booking (lower complexity, run together)
- After each batch finishes, review the per-area audit docs before launching the next batch.

### Day 12: Synthesis + Phase 1 scope

- Spawn synthesis agent with prompt from `templates/phase-0-swarm-prompt.md` §"Synthesis step".
- Review synthesis doc.
- Define Phase 1 scope: top 10-15 quick-win slices + 1 cross-cutting infrastructure slice.
- Update Asana board with Phase 1 cards.
- Sprint complete.

---

## Critical dependencies

- **Methodology PR must merge before any other PR.** Otherwise slices reference v2.1 patterns that aren't on main.
- **Z.6 must merge before any other Z slice.** It creates SLICES-speed.md which the others append to.
- **Playwright harness must exist before Z.2** (Lighthouse CI needs auth flows).
- **All Phase Z slices must merge before Phase 0 swarm.** Swarm agents need the instrumentation to capture data.
- **Phase 0 synthesis must complete before Phase 1 scope is defined.** No skipping the synthesis step (anti-pattern in methodology).

---

## Risk factors and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Playwright harness build is bigger than estimated | High | Slows Z.2 by 1-2 days | Split into multiple slices; defer flows 6-10 to Phase 1 |
| Sentry not installed at all | Medium | Z.4 expands to "install Sentry" slice | Pre-flight check (Action 1 #3) catches this; surface to Nathan, decide scope |
| iPad unavailable for Day 3 verification | Medium | Item 6 deferred | Doesn't block sprint; file as Phase 5 stub |
| Phase 0 swarm finds more bugs than expected | High | Phase 1 scope balloons | Synthesis prioritization; cap Phase 1 at 15 slices, defer rest to Phase 2+ |
| Cold start measurement reveals huge number (>15s) | Low | Z.5 surfaces a P0 | Methodology has stop condition for this; pause and propose plan |
| Slice exceeds 280 lines | Medium per slice | Adds 30-60 min for split | Standard methodology stop condition; agent splits in plan-of-record |
| Smoke-contracts CI job doesn't exist yet | High | Methodology requires it | Phase Z slice Z.1 prerequisite — add the CI job as part of Z.6 setup OR file a Z.0 slice |
| Multiple stakeholder-blocked decisions surface | Medium | Slows pace | Mitigate by parking blocked work in Asana, continue with non-blocked slices |

---

## Decision points during sprint

These need a Nathan decision in chat to proceed:

- **Day 1:** the 10 open speed audit decisions (resolve before commit).
- **Day 5:** if playwright harness doesn't exist, decide scope of build (full 10 flows in one slice = too big; split = how many?).
- **Day 5:** if SLICES.md split surfaces complications (e.g. Phase 5 stubs reference both BMS + speed work), decide split policy.
- **Day 9 (Phase Z gate):** sign off gate. If any baseline regressed, pause and triage.
- **Day 12:** approve synthesis. If synthesis surfaces P0 bugs, decide whether to ship them as Phase 1 slice 1 or hot-fix outside the audit cadence.

---

## What NOT to do during this sprint

- **Don't skip the docs PR** (Action 3). Methodology must be on main first.
- **Don't open two slices in parallel.** Methodology v2.1 banned this; verify each slice merged + deployed + verified before opening the next.
- **Don't deploy Friday afternoon.** If Day 5/12 lands on Friday, push deploy to Monday.
- **Don't let the Phase 0 swarm propose fixes.** Phase 0 is read-only; synthesis is the consolidation step.
- **Don't redefine `totalVolume` mid-sprint.** That's a stakeholder-blocked stub from BMS; not in this sprint's scope.
- **Don't add new audits to the sprint** (e.g. "while we're at it, let's also do accessibility"). Speed audit is the lane.
- **Don't push directly to main to fix verification failures.** Hot-fix slice or revert; never silent patch.

---

## Communication cadence

- **Daily check-in (chat):** 1-2 sentences on what merged yesterday + what's next today + any blockers.
- **End-of-phase summary (chat or doc):** PR list + baseline diff + sign-off.
- **Stakeholder-blocked items:** as they arise, file Asana card + ping in chat. Don't let them backlog.
- **Surprises (security issue, P0 bug found, baseline regression):** stop and surface immediately. No "I'll mention it tomorrow."

---

## Done definition for this sprint

- [ ] Methodology v2.1 PR merged.
- [ ] All 3 BMS closeout Claude Code slices merged + deployed + verified.
- [ ] BMS manual verifications complete (Gulino e2e, sale Value, iPad if available).
- [ ] BMS Overhaul audit archived per end-of-audit gate.
- [ ] Speed audit Phase Z complete (6 slices + harness).
- [ ] Speed audit Phase 0 complete (per-area docs + synthesis).
- [ ] Speed audit Phase 1 scope defined.
- [ ] CLAUDE.md updated with new baselines + speed audit context.
- [ ] Sprint retro written: what worked, what surprised, what to change for the next sprint.

After done, the next sprint starts on Speed Phase 1 execution.
