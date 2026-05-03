# BMS Overhaul — Retrospective (2026-05-02)

**Audit window:** 2026-04-28 → 2026-05-02 (5 days)
**Trigger:** Gulino BMS launch demo on 2026-04-28 went poorly. "Confusing icons, hard to know where to go, tons of bugs."
**Audit doc (archived):** `docs/handoff/archive/bms-audit-2026-04-28.md`
**Closeout doc (archived):** `docs/handoff/archive/bms-closeout-2026-05-02.md`
**Methodology shipped to:** v2.1.1 at audit start; v2.2 ships in follow-up slice `bms-audit-closeout-followup-methodology-tracking` (factual correction — original line claimed v2.2 shipped here, but the bump was deferred when discovery surfaced the methodology tree was untracked)

---

## Audit summary

The BMS Overhaul audit started with an 18-bug + 38-UX-issue inventory after Gulino Group's demo exposed structural problems across financial reconciliation, super_admin tenant override, information architecture, and signing-flow polish. The proposed redesign called for ~30 slices over 4 weeks. We compressed to 5 days by shipping serially through Phases Z (setup), 0 (data + override consistency), 1 (manager workflow), 2 (agent + onboarding), 3 (IA + polish), and 4 (Phase 4 cleanup + closeout items).

**Sprint stats:**
- 119 commits across `main`
- +33,500 / -7,885 lines
- ~30+ slices merged, including 4 fix-cluster slices for the signing flow audit
- ~340 smoke contracts in `tests/smoke/` at end of audit
- 11 Phase 5 stubs filed during execution + 1 new from closeout = 12 deferred items

**Key shipped wins:**
- **Signing flow click-block resolved** (slices 20-fixes-A through D). The signature box on the TRA template was eating the printed-name field's tap target on iOS. Four tightly-scoped fix slices, each with its own smoke contracts.
- **`.gcloudignore` 50.6% reduction** (slice gcloudignore, PR #45). 269.08 MiB → 132.88 MiB per Cloud Build deploy. Sibling-project working dirs and `.ts/.tsx` Finder dupes were the bulk.
- **Document Vault feature-complete for desktop** (slices 19-B1, 19-B2a, 19-B2b). iOS Safari black-hole resolved via pdfjs migration; multi-page editor with field drag/resize via Pointer Events API.
- **`?as_org=` super_admin override hardened across BMS** (slices 0c, 0c2, 0c3, 22-as-org-vault). ~50 server-action exports + 12 client pages threaded the override option, plus systemic smoke contract in `override-scoping.test.ts` to prevent regression.
- **Methodology v2.1 → v2.1.1 → v2.2** forged from real audit experience. Each version bump backed by concrete pain (parallel-slice P0 → ban; aspirational CI → patch; verified-claim B-019 → tightening).

---

## What worked

**Plan-of-record gate (methodology §2).** The single most valuable rule. Every slice landed an explicit plan to SLICES.md *before* code. This caught at least three would-be miscarriages of scope (slice 22's `createOnboarding` exemption surfaced during plan; slice gcloudignore's `data/zillow` runtime risk caught before exclusion; slices-stub-naming-cleanup's 11-vs-8-stub variance documented before the rename pass started). Chat-only plans evaporate; written plans force commitment.

**Smoke contract regex pins (methodology §3).** Static-source assertions on critical patterns. Cheap to write, expensive to silently break. The `override-scoping.test.ts` contract specifically — 73 tests asserting every BMS server-action file threads `overrideAsOrg` — caught Vault when slice 22 added it to `FILES_UNDER_TEST` and would have caught the createOnboarding gap if `createOnboarding` hadn't been exempted from the matrix (see "What didn't" #1).

**Migration safety pattern (methodology §5).** Three production migrations (TRA template seed, TRA signature heights, payments backfill) ran clean because every script wrote a backup JSON file before mutating. No prod data loss in the audit window.

**Serial-only after the April P0 (methodology §4 / "Parallelism").** Pre-audit policy was "agents can run in parallel for independent slices." That broke catastrophically on 2026-04-30 when a deploy from `main` rolled back 15 unmerged slice branches because they hadn't merged yet. Methodology v2.1 banned parallel slices outright; the rest of the audit executed serially with zero P0s of the same shape.

**End-of-audit verification surfacing real bugs.** The Item 4 manual e2e test on Gulino was scheduled even though all individual slices had passed their own smoke contracts. The integration test surfaced the createOnboarding bug (B-019 redux). Without this end-of-audit pass, the bug would have stayed silent until the next time a super_admin tried to verify cross-tenant onboarding work — possibly weeks later, with no clear connection back to the audit slices that "should have" caught it. **Cross-cutting verification justifies its cost every time.**

---

## What didn't

**1. The B-019 verified-claim mistake (the most important finding).** B-019 was originally documented as "form's POST URL has `?as_org=` but creates onboardings in the user's home org regardless." During slice 0c2 (page-level wiring sweep), the *list page* was threaded with `useSearchParams` + `overrideOpts` → `getOnboardings`. SLICES.md:444 then claimed: "B-019 verified out of scope: Already closed by slice 0c2." But 0c2 only fixed the *read* surface. The form POST → `createOnboarding` server action was intentionally exempted in `tests/smoke/override-scoping.test.ts:77-84` with the comment "createOnboarding ties the onboarding document to the calling agent's identity — overriding org while keeping the agent record has legal/audit implications. Defer until product clarifies." The exemption was a deferral, not a fix. Calling 0c2 "B-019 verified" was wrong because no one re-checked the write surface. Item 4's Gulino e2e re-found the bug 4 days later. **Drives methodology v2.2 tightening (verified-claim audit pattern under §6 Production verification + read/write anti-pattern bullet under §9).**

**2. Long-lived integration branch experiment.** Pre-v2.1, the audit used `feat/bms-overhaul-2026-q2` as a long-lived integration branch where 16 slice branches stacked. On 2026-04-30 a deploy from `main` rolled back all 15 unmerged slices because they hadn't reached `main` yet. Lost about half a day to recovery (PR-D rebase + integration). v2.1's "branch off `main`, PR back to `main`, delete after merge" rule eliminated this failure mode. The cost of the experiment was bounded by the recovery, but the lesson was paid in real time, not theory.

**3. CI/playwright was aspirational, not real.** Methodology v2.1 promised `smoke-contracts` and `e2e-playwright` CI jobs that didn't exist in the repo. Discovery during pre-flight forced the v2.1.1 patch ("CI is TBD; reviewer verifies green output before merge approval"). Cost: ~30 minutes of pre-flight discovery + the patch authoring. Lesson: methodology rules should reference infrastructure that exists, not infrastructure planned. v2.1.1's interim rules (manual checklist; local `npm run test` before merge) held up fine for the audit's duration but the absence of CI means smoke contract failures depend on reviewer discipline.

**4. 11-stub naming inconsistency accumulated silently.** Phase 5 stubs were filed across 8 different slices with 4 different ID-prefix conventions (`9-ext-`, `20-fix-followup-`, `19-fix-followup-`, `21-fix-followup-`) plus one with no prefix at all (`deal-pipeline-delete`). No single slice's stub-filing was wrong; the inconsistency emerged only when looking at all 11 together. PR #46 fixed it as a doc-only sweep. **Lesson: methodology §8 Phase 5 stub format had a copy-paste template, but no smoke contract pinning that *every* stub matches the format.** PR #46 added the cardinality contract; future stubs that violate the format trip immediately. This pattern (regex-pin-the-format-not-just-the-template) is worth applying elsewhere.

**5. Verification surfaces noise alongside signal.** Item 5 (sale Value visibility check) verified GREEN cleanly. Item 6 (iPad real-finger) DEFERRED because no hardware in the room. Item 4 (Gulino e2e) INCONCLUSIVE because of the createOnboarding finding. Three different outcomes from three verifications. The methodology should distinguish these explicitly: VERIFIED (green), DEFERRED (out of scope or no resources), INCONCLUSIVE (verification ran but found a blocker). v2.2 doesn't change this yet — filed as a future v2.3 candidate if the pattern recurs.

---

## What to change for next audit (methodology v2.2 inline + future candidates)

**Intended for v2.2 (DEFERRED — see below):**
- New paragraph at end of §6 "Production verification" — verified-claim audit pattern. When a fix targets a class of bugs (e.g. "thread `?as_org=` through all server actions"), verification must walk every variant in that class — read AND write paths, all callsites — not just the variants that have explicit smoke contracts. Smoke contracts can't catch a write-path bug if the write-path callsite is exempted from the contract matrix; that's how B-019 escaped slice 0c2's "verified" claim.
- New bullet under §9 "Common agent failure modes" — read surface ≠ write surface. When an agent claims a class-fix is verified, ask: "Did you walk the write surface too, or just the read surface?" Worked example: B-019 in this audit (referenced explicitly).
- Version header bump v2.1.1 → v2.2.

**Why deferred:** discovery during slice `bms-audit-closeout` (this slice) surfaced that the entire `docs/methodology/` tree is untracked in git — 5 canonical files (`slice-based-audit.md`, 3 templates, 1 archive entry), never committed. The methodology has been referenced across PRs #44, #45, #46, and the BMS closeout doc, but no agent or contributor has run `git add` on it. Tracking the methodology in this PR would mean committing several thousand pre-existing lines, far above Nathan's <30-line threshold for the v2.2 bump. Per the threshold rule ("anything larger → file separate v2.2 slice"), the v2.2 bump is filed as Phase 5 stub `bms-audit-closeout-followup-methodology-tracking` with the verified-claim audit pattern + anti-pattern bullet text staged for inclusion. **This is a meta-finding worth surfacing on its own:** the methodology that drives the audit isn't in the audit's git history. That's a process gap the next-audit kickoff should fix as part of Phase Z.

**Filed as future v2.3 candidates (NOT shipped here, would exceed Nathan's <30-line threshold):**
- **Smoke-contracts-target rule revisit.** Methodology §3 currently suggests "2-4 contracts per slice." Slice 22 had 13, slice gcloudignore had 7, slice slices-stub-naming-cleanup had 9 — all justified by multi-surface scope. The "2-4" rule is too strict for closeout/cleanup slices. Consider: "≤4 for single-surface slices; ≥1 cardinality contract per surface for multi-surface slices."
- **Outcome-line-fill enforcement.** PR #46 merged with `slices-stub-naming-cleanup`'s own outcome line still set to `_filled in at gate-run time_`. The next slice (this one) caught the omission. Consider an automated check: PR merging a slice flip-to-`done` should refuse to merge if the slice's outcome line is still the placeholder.
- **"Verification outcome" taxonomy.** VERIFIED / DEFERRED / INCONCLUSIVE distinction (see "What didn't" #5). v2.2 §6 currently treats all verifications as binary pass/fail.

---

## Carryover into next audit

- **HIGH PRIORITY:** `22-followup-as-org-onboarding-create` — super_admin cross-tenant `createOnboarding` write fails silently. Three options on the stub (legal clarification / per-callsite pattern / wait for 3.Y structural fix). Blocks cross-tenant verification of any onboarding-related work until shipped.
- **DEFERRED:** Item 6 iPad real-finger smoke test — requires hardware session.
- **Phase 5 stubs unchanged from PR #46 cleanup pass:** all 11 renamed stubs + new `gcloudignore-followup-further-reduction` + this slice's new `22-followup-as-org-onboarding-create` = 13 stubs in queue.
- **Methodology candidates filed above** for v2.3 review.
- **`SLICES.md` rename to `SLICES-bms.md`** deferred to next-audit Phase Z setup per closeout doc line 4. Next audit (site-wide speed audit) opens with this rename as a Z setup task.

---

## Sprint stats (rough)

| Metric | Value |
|---|---|
| Audit window | 2026-04-28 → 2026-05-02 (5 days) |
| Commits to `main` | 119 |
| Lines added/deleted | +33,500 / -7,885 |
| Slices shipped | ~30+ across Phases Z, 0, 1, 2, 3, 4 + closeout |
| Smoke contracts at audit end | ~344 |
| Production migrations (with backup) | 3 |
| P0 incidents | 1 (April integration-branch P0) |
| Methodology versions shipped | v2 → v2.1 → v2.1.1 (v2.2 staged but deferred — see "What to change") |
| Phase 5 stubs filed | 12 (1 new from closeout) |

---

**Closed:** 2026-05-02. Next audit: site-wide speed audit (`docs/handoff/site-wide-speed-audit-2026-05-02.md`).
