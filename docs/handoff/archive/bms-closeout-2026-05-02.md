# BMS Overhaul — Closeout (2026-05-02)

**Audit doc:** `docs/handoff/bms-audit-2026-04-28.md`
**Slice ledger:** `SLICES.md` (will be renamed to `SLICES-bms.md` in speed audit Phase Z setup)
**Methodology:** `docs/methodology/slice-based-audit.md` (v2.1)
**Templates:** `docs/methodology/templates/`

**v2.1 compliance applies to all kickoff prompts below.** Each prompt has been updated to require:
- Plan-of-record appended to SLICES.md slice entry BEFORE writing code (not just chat).
- Smoke contracts at `tests/smoke/<slice-id>.test.ts`, run in CI `smoke-contracts` job.
- Verification artifact captured post-deploy (screenshot to `docs/handoff/screenshots/<slice-id>-prod.png`, pasted into PR comment).
- Reference `docs/methodology/templates/kickoff-prompt.md` for canonical structure if extending.

This doc closes out the BMS Overhaul audit started 2026-04-28. The functional work is done — Gulino's launch issues are fixed, Document Vault is feature-complete for desktop, signing flow click-block is resolved, three production migrations ran clean. What remains is one small technical slice, two manual verifications, two QoL items, and four deferred items going to Phase 5 backlog.

After this doc's items are done, the BMS audit moves to "archived" and we pivot to the site-wide speed audit (`docs/handoff/site-wide-speed-audit-2026-05-02.md`).

---

## Items in this closeout (in execution order)

| # | Item | Type | Effort | Owner |
|---|------|------|--------|-------|
| 1 | Slice 22-as-org-vault | Code (Claude Code) | ~45 min | Agent |
| 2 | `.gcloudignore` | Code (Claude Code) | ~10 min | Agent |
| 3 | Phase 5 stub naming cleanup in SLICES.md | Code (Claude Code) | ~15 min | Agent |
| 4 | Manual end-to-end Gulino onboarding test | Verification | ~30-60 min | Nathan |
| 5 | Sale transaction Value visibility check | Verification | ~5 min | Nathan |
| 6 | iPad real-finger smoke test | Verification | ~20 min | Nathan (needs hardware) |
| 7 | Audit closeout — archive doc, close Asana, retro | Wrap | ~15 min | Nathan |

Items 1-3 can be done by Claude Code today. Items 4-6 are Nathan-side. Item 7 happens after everything else is done.

---

## Item 1 — Slice 22-as-org-vault (kickoff prompt for Claude Code)

**Paste below into a fresh Claude Code session in `/Users/nathantondow/Documents/vettdre`.**

```
Slice 22-as-org-vault — make super_admin ?as_org= override work in Document Vault list and detail pages.

**The bug:**
super_admin users have an `?as_org=<orgId>` URL parameter that lets them
view another tenant's data. The orange override banner displays correctly
on /brokerage/client-onboarding/vault and /brokerage/client-onboarding/vault/[id],
but the underlying queries still return the home org's templates instead
of the target tenant's templates.

This blocks cross-tenant verification of vault work — currently the
workaround is to navigate by templateId directly.

Repro: log in as super_admin (nathan@ntrec.co), visit
/brokerage/client-onboarding/vault?as_org=<some other org's id> in prod.
Banner shows "Viewing as <Other Org>" but template list is from home org.

**The fix:**
Find where as_org override is consumed in other surfaces that DO honor it
correctly (e.g. transactions, agents, listings). Apply the same pattern
to the vault list query and vault detail query.

Likely the helper is `lib/team-context.ts` or a similar org-context
choke point. The vault queries probably use a different code path that
bypasses the override.

**Discovery instructions:**
- Read `lib/team-context.ts` — find the as_org override consumer
- Read `app/(dashboard)/brokerage/client-onboarding/vault/page.tsx` — find the template list query
- Read `app/(dashboard)/brokerage/client-onboarding/vault/[id]/page.tsx` — find the detail query
- Grep `as_org` across the codebase to see all consumers
- Grep for `searchParams.as_org` and `as_org=` to find the URL param reading
- Compare a working surface (e.g. `app/(dashboard)/brokerage/transactions/page.tsx` if as_org works there) against the vault page to see what's missing
- Check `app/(dashboard)/brokerage/client-onboarding/vault/actions.ts` if it exists

**Implementation intent:**
- Vault list query honors as_org param when current user is super_admin
- Vault detail query honors as_org param when current user is super_admin
- Override banner already displays — don't touch that
- Non-super_admin users see no behavior change (they can't pass as_org)
- Audit trail (if any logs cross-tenant access) records the override correctly

**Constraints:**
- Touches data layer / org-context code — flag as `requires-approval` style.
  Stop after discovery and propose plan in chat before writing code.
- Do NOT modify `lib/team-context.ts` core logic without explicit approval.
  If the fix needs changes there (vs. just calling a different helper),
  surface the proposal first.
- Must respect super_admin permission check — if the user isn't super_admin,
  as_org is ignored.

**Smoke contracts (3):**
1. Positive: vault list query reads from a context object that includes
   the override-resolved orgId, not directly from session.user.orgId.
2. Negative: vault list query does NOT call any prisma find with a hardcoded
   `orgId: session.user.orgId` that would bypass the override.
3. Cardinality: same pattern present in BOTH vault list page AND vault detail
   page (the override should work on both surfaces).

**Stop conditions:**
- If the fix requires modifying `lib/team-context.ts`, stop and propose.
- If discovery reveals the as_org pattern is inconsistent across surfaces
  (i.e. some surfaces honor it via different mechanisms), stop and propose
  whether to standardize or just patch vault.
- If line count exceeds 200, stop — this should be a small fix.
- If you find that as_org doesn't actually work anywhere (i.e. you can't find
  a working reference implementation), stop and surface — this would be a
  much bigger fix than expected.

**Verification (post-merge):**
- Log into prod as super_admin.
- Visit /brokerage/client-onboarding/vault?as_org=<Gulino's orgId> — should
  show Gulino's templates.
- Visit a Gulino template detail page with as_org param — should load.
- Log out, log in as a regular agent. Try as_org param. Should be ignored,
  see only own org's templates.

**Branch:** fix/p4-22-as-org-vault off origin/main
**PR title:** fix(vault): honor as_org override in vault list and detail pages
**Closes:** Slice 22 in SLICES.md (Phase 4 cleanup)

**v2.1 required (do not skip):**
- Append plan-of-record to SLICES.md slice entry BEFORE writing code. Use the format in methodology v2.1 §"Plan-of-record artifact format".
- Smoke contracts at `tests/smoke/22-as-org-vault.test.ts`. Must run green in CI before merge.
- Post-deploy verification: capture screenshot of vault list with as_org param working, save to `docs/handoff/screenshots/22-as-org-vault-prod.png`, paste reference into PR comment.
- Mark slice `done` in SLICES.md with outcome line after merge.
- Update Asana card if one exists.

Stop and propose plan in chat first. Don't write code yet.
```

---

## Item 2 — `.gcloudignore` (kickoff prompt for Claude Code)

**Paste below into a fresh Claude Code session.**

```
Slice — add .gcloudignore to filter heavy directories from Cloud Build uploads.

**The bug:**
Every `gcloud builds submit --config cloudbuild.yaml` deploy uploads
~664 MiB to Cloud Build because there's no .gcloudignore file. The bulk
is node_modules, .next, .git, and various build artifacts. Filtered
upload should be ~30 MiB. Saves 1-2 minutes per deploy. Compounds across
all future deploys.

**The fix:**
Create .gcloudignore at repo root with standard ignores for a Next.js
project. Confirm it works by running a deploy and observing the upload
size drop.

**Discovery instructions:**
- Read .gitignore at repo root to see what's already excluded
- Check if .dockerignore exists — if so, similar contents apply
- Confirm the deploy command in the existing workflow (likely
  `gcloud builds submit --config cloudbuild.yaml`)
- DO NOT actually deploy — that's Nathan's call. Just confirm the
  command shape so the .gcloudignore matches the source layout it'll
  actually be applied against.

**Implementation intent:**
Create .gcloudignore with these patterns (adapt to repo's actual
layout if any of these don't exist):
- node_modules/
- .next/
- .git/
- .env*
- *.log
- coverage/
- playwright-report/
- test-results/
- .vscode/
- .idea/
- .DS_Store
- migration-backup-*.json (these get committed to repo separately if needed)
- docs/handoff/screenshots/  (audit screenshots, large)
- Anything else heavy that's already in .gitignore but not needed for build

KEEP these (they're needed for the build):
- src/
- prisma/
- public/
- package.json, package-lock.json
- next.config.ts
- Dockerfile
- cloudbuild.yaml
- tsconfig.json
- tailwind.config.* (if exists)
- All other build-time config

**Constraints:**
- Don't touch cloudbuild.yaml. Just add .gcloudignore.
- Don't change anything in node_modules or .next behavior.
- Pure additive change.

**Smoke contracts (1):**
1. Positive: .gcloudignore exists at repo root and contains at minimum
   `node_modules/`, `.next/`, `.git/`. (Regex pin checks the file's
   text content includes those three patterns.)

**Stop conditions:**
- If you discover the deploy uses a different mechanism (e.g. GitHub
  Actions instead of `gcloud builds submit`), stop and surface — the
  ignore pattern might not apply.

**Verification (post-merge, Nathan):**
- Run `gcloud builds submit --config cloudbuild.yaml` and observe the
  "uploading" line. Should report ~30 MiB instead of ~664 MiB.

**Branch:** chore/gcloudignore off origin/main
**PR title:** chore(deploy): add .gcloudignore to filter heavy directories from Cloud Build
**Updates:** Append outcome to SLICES.md QoL section.

**v2.1 required (do not skip):**
- Append plan-of-record to SLICES.md slice entry BEFORE writing code.
- Smoke contracts at `tests/smoke/gcloudignore.test.ts` — single contract pinning the file's required patterns.
- Post-deploy verification: Nathan runs `gcloud builds submit --config cloudbuild.yaml`, captures the upload-size line, pastes into PR comment.
- Mark slice `done` in SLICES.md.

Stop and propose plan in chat first. Don't write code yet.
```

---

## Item 3 — Phase 5 stub naming cleanup (kickoff prompt for Claude Code)

**Paste below into a fresh Claude Code session.**

```
Slice — normalize Phase 5 stub naming in SLICES.md.

**The bug:**
Phase 5 stubs in SLICES.md have inconsistent ID prefixes. Some use
`19-fix-followup-`, some use `21-fix-followup-`, some have ad-hoc
naming. Future agents picking up these stubs may misidentify the
parent slice or skip them by accident.

**The fix:**
Standardize stub ID format to: `<parent-slice-id>-followup-<short-name>`
where parent-slice-id is the slice that surfaced the deferred work.

Update SLICES.md only. Don't touch any code.

**Discovery instructions:**
- Read SLICES.md, scan for "Phase 5", "stub", "followup", "follow-up",
  "deferred"
- Make a list of every stub and its current ID
- Identify which parent slice each stub came from (usually mentioned in
  the stub's "Background" or surfaced-by text)

**Implementation intent:**
- Each stub gets a normalized ID
- Each stub has a "Background" line citing the parent slice
- Each stub has a "Why deferred" line
- Each stub has a "Required input before slicing" line
- Each stub has an "Affected surfaces" line (best guess)
- If any stub is missing one of those four lines, add it (mark "TBD"
  if unknown)
- Maintain the current section ordering — just rename and clean up

**Known stubs as of 2026-05-02 (from methodology doc):**
- `19-fix-followup-volume-aggregates` — volume KPI definition; blocked
  on Gulino-owner conversation
- `19-fix-followup-cross-page-move` — drag-to-page-tab UX in vault editor
- `19-fix-followup-keyboard-nudge` — arrow-key precision moves on
  selected vault field
- `22-as-org-vault` — being addressed in slice 22 (item 1 of this
  closeout); REMOVE from stub list once merged
- (Confirm by reading SLICES.md — there may be others)

**Constraints:**
- Don't change scope or content of any stub. Just rename + structure.
- Don't add NEW stubs (that's not this slice's job).
- Don't remove stubs unless they're being closed by an in-flight slice
  (i.e. 22-as-org-vault).

**Smoke contracts (none — this is a doc-only change, but commit
includes a brief CHANGELOG-style note in PR body explaining the rename
table.)**

**Stop conditions:**
- If you find a stub that looks malformed (missing context, unclear
  what it refers to), surface in chat with the original text — don't
  guess at intent.
- If you find more than 8 stubs, stop and ask whether to split this
  cleanup or include all of them.

**Branch:** chore/p5-stub-naming-cleanup off origin/main
**PR title:** chore(slices): normalize Phase 5 stub naming in SLICES.md
**Closes:** No slice (this is meta-work).

**v2.1 required (do not skip):**
- Append plan-of-record to SLICES.md (yes, the doc you're editing — append above the stubs section).
- No code-side smoke contracts (this is doc-only). Instead, PR body must include a before/after table of stub IDs.
- No deploy verification needed.
- Use the canonical Phase 5 stub format from methodology v2.1 §"Phase 5 stubs".

Stop and propose plan in chat first. Don't write code yet.
```

---

## Item 4 — Manual end-to-end Gulino onboarding test (Nathan)

**Time estimate:** 30-60 minutes.
**Tools:** Real browser (not Chrome MCP — needs to be your actual usage).

This is the highest-signal validation that everything we shipped works together. All the pieces are fixed individually but no one has run the full lifecycle against migrated Gulino data.

**Setup:**
- Use your super_admin credentials.
- If slice 22-as-org-vault has merged + deployed, use `?as_org=<Gulino orgId>` to operate as Gulino. Otherwise log directly into Gulino's account.
- Use a real or test client email + phone you can receive at.

**Checklist:**

1. **Create onboarding** — `/brokerage/client-onboarding/new`
   - [ ] Select a client from the dropdown (or create one)
   - [ ] Confirm the migrated TRA template (Gulino's templateId `cmoiwqbtp0001e8cl9cqrfb3c`) is selectable
   - [ ] Add Tenant Representation Agreement + DOS-1736 + DOS-2156 to the package
   - [ ] Choose delivery: email + SMS
   - [ ] Submit

2. **Confirm invite delivered**
   - [ ] Email received at client address (subject, body, link)
   - [ ] SMS received at client phone (link works)

3. **Open signing page** — `/sign/<token>`
   - [ ] Welcome screen renders with Gulino branding (logo, brokerage name)
   - [ ] Click through to first document

4. **Walk each document**
   - [ ] **TRA Page 1:** prefilled fields show real values (agent name, brokerage, client name) in green/read-only — NOT dashes
   - [ ] **TRA Page 1:** signature pad opens for client signature — no click-block where the printed-name field used to be eaten by the signature box
   - [ ] **TRA Page 2:** all 6 fields present (3 client + 3 agent block); positions look right against the underlying PDF
   - [ ] **DOS-1736:** auto-checked checkboxes for tenant representation appear correctly (Tenant as a, Tenant's Agent, Tenant(s))
   - [ ] **DOS-2156:** all 5 fields prefilled correctly

5. **Complete signing**
   - [ ] Each document accepts signature, advances to next
   - [ ] Final completion screen renders
   - [ ] Audit log records each signature (verify via prisma if needed)

6. **Manager view (back to your account)**
   - [ ] Navigate to `/brokerage/client-onboarding`
   - [ ] Onboarding shows status `completed`
   - [ ] Open detail — all documents marked signed
   - [ ] Generated PDFs viewable / downloadable
   - [ ] All form values rendered correctly in the final signed PDF

7. **Generate invoice**
   - [ ] Click "Generate invoice" on the completed onboarding
   - [ ] Confirm DealSubmission created
   - [ ] Confirm Transaction created with correct values
   - [ ] Confirm Invoice created with right amount + agent split

8. **Capture results**
   - [ ] Note any bugs in `docs/handoff/bms-closeout-2026-05-02-test-results.md`
   - [ ] Screenshot anything that looks wrong
   - [ ] If P0 bug found → file as new slice in SLICES.md
   - [ ] If P1/P2 bug → file as Phase 5 stub

If any step fails, STOP and capture detail. Don't push past it. The full lifecycle test is the integration check; failures here matter.

---

## Item 5 — Sale transaction "Value" visibility check (Nathan)

**Time estimate:** 5 minutes.

Slice 21 hid the "Value" row on rental BMS surfaces. Smoke contracts pin the conditional but visual confirmation that sales STILL show Value is worth doing.

**Checklist:**
- [ ] Open a sale-type transaction detail page in prod
- [ ] Confirm "Value" row renders (with dollar amount, not "—")
- [ ] Open the transactions list page
- [ ] Find a sale row — confirm Value column populated
- [ ] Find a rental row — confirm Value column shows "—"
- [ ] Open the agent detail page for any agent with both sales + rentals
- [ ] Confirm sale Value shown, rental Value hidden

If sale Value is also hidden → P0 regression, file slice immediately.
If rental Value still showing → P0 regression, file slice immediately.

---

## Item 6 — iPad real-finger smoke test (Nathan, needs hardware)

**Time estimate:** 20 minutes.
**Required:** physical iPad with Safari.

Slices 19-B2B and 20-fixes-A through D shipped touch-aware code. All structurally verified via JS console + smoke contracts. Real-finger validation needs an actual iPad.

**Test points:**

1. **Vault editor (manager flow)** — open `/brokerage/client-onboarding/vault/<templateId>`
   - [ ] Tap a field → 4 corner handles appear
   - [ ] Drag with finger → field moves smoothly, no native scroll/pinch interference
   - [ ] Drag a corner handle → resize works, anchor opposite corner stays put
   - [ ] Pinch-zoom on the canvas (between fields) → still works because touchAction: none is field-only
   - [ ] Switch between page tabs → currentPage updates, fields swap

2. **Signing flow (client-side)** — open a `/sign/<token>` link on iPad
   - [ ] Tap a text field → keyboard opens, can type
   - [ ] Tap signature field → signature pad opens (signature tap target is 24px per WCAG AA carve-out)
   - [ ] Draw signature with finger → endStroke auto-emits, no Confirm button to find
   - [ ] Aria-live announcement of signature captured (use VoiceOver to verify if comfortable)
   - [ ] Field hit areas are 44px for non-signature interactive
   - [ ] Rotate iPad — orientation snapshot/rehydrate works for signature pad

If any step fails, capture (video if possible) and file as P0 slice.

---

## Item 7 — Audit closeout (Nathan)

After items 1-6 are done:

- [ ] Mark all closeout items `done` in SLICES.md
- [ ] Move `docs/handoff/bms-audit-2026-04-28.md` to `docs/handoff/archive/bms-audit-2026-04-28.md` (or just leave in place — historical record)
- [ ] Move this closeout doc to `docs/handoff/archive/bms-closeout-2026-05-02.md` after items done
- [ ] Update Asana: archive BMS Overhaul project, close all cards
- [ ] Write retrospective in `docs/handoff/bms-overhaul-retrospective-2026-05-02.md` capturing:
  - What worked: the 30+ slice cadence, plan-of-record pattern, smoke contracts, migration safety
  - What didn't: long-lived integration branch experiment, status-snapshot-in-methodology mixing
  - What to change for next audit: applied in methodology v2 (`docs/methodology/slice-based-audit.md`)

---

## Deferred items (filed as Phase 5 stubs in SLICES.md)

These are intentionally NOT part of this closeout. They're captured so they don't get lost.

### `19-fix-followup-volume-aggregates`
**Status:** blocked on stakeholder conversation.
**Background:** aggregate `totalVolume` computations in `agents/actions.ts`, `earnings/actions.ts`, `reports/actions.ts`, `reports/revenue/actions.ts` still sum `transactionValue` across all transaction types, mixing annual rent into rental rows.
**Why deferred:** `agents/[id]/page.tsx:514-517` uses `stats.totalVolume` to calculate commission tier for `volume_based` plans, so excluding rentals would silently shift agent tiers. Paycheck-impacting change.
**Required input before slicing:** Decision from Gulino owner on whether to redefine `totalVolume` (exclude rentals from sale volume) or add a parallel `saleVolume` / `commissionEarned` stat. Asana card needed for this conversation.
**Affected surfaces:** agent detail, earnings, reports, revenue reports.

### `19-fix-followup-cross-page-move`
**Status:** Phase 5 backlog.
**Background:** Vault editor managers currently can't drag a field from Page 1 to Page 2 — they have to delete and recreate. Captured during slice 19-B2A scoping.
**Why deferred:** Not blocking signing flow. UX nice-to-have.
**Required input before slicing:** None.
**Affected surfaces:** `/brokerage/client-onboarding/vault/[id]` editor.

### `19-fix-followup-keyboard-nudge`
**Status:** Phase 5 backlog.
**Background:** Arrow-key precision moves on the selected vault field would help managers position fields exactly. Captured as the trade for the 290-line overage on slice 19-B2B.
**Why deferred:** Accessibility nice-to-have, not blocking any flow.
**Required input before slicing:** None.
**Affected surfaces:** `/brokerage/client-onboarding/vault/[id]` editor.

### iPad real-finger validation (item 6 above)
**Status:** awaiting hardware-based test.
**Background:** Touch code shipped without on-device validation.
**Why deferred:** Requires physical iPad; structural verification is in place via smoke contracts.
**Required input before slicing:** Test results from item 6.
**Affected surfaces:** vault editor, signing flow.

---

## Done definition

The BMS Overhaul audit is "done" when:
- [ ] All 3 Claude Code items merged + deployed (slice 22, .gcloudignore, stub naming cleanup)
- [ ] All 3 manual verifications complete (Gulino e2e, sale Value visibility, iPad)
- [ ] All Phase 5 stubs filed correctly in SLICES.md
- [ ] Asana board for BMS Overhaul archived
- [ ] Retrospective written
- [ ] Methodology v2 (`docs/methodology/slice-based-audit.md`) committed and reviewed

After "done," pivot to site-wide speed audit per `docs/handoff/site-wide-speed-audit-2026-05-02.md`.

---

## Final Outcome (2026-05-02)

| # | Item | Disposition |
|---|------|-------------|
| 1 | Slice 22-as-org-vault | **DONE** — PR #44 merged 2026-05-02, build 9c9eb72d, prod-verified via Chrome MCP. |
| 2 | `.gcloudignore` | **DONE** — PR #45 merged 2026-05-02, build 55d8db5e. Tarball reduced 269.08 MiB → 132.88 MiB (50.6%, ~136 MiB/deploy saved). Further-reduction stub filed (`gcloudignore-followup-further-reduction`). |
| 3 | Phase 5 stub naming cleanup | **DONE** — PR #46 merged 2026-05-03. 11 stubs renamed to methodology format; gcloudignore outcome closed; new stub filed. |
| 4 | Manual end-to-end Gulino onboarding test | **INCONCLUSIVE** — surfaced super_admin cross-tenant write bug on `createOnboarding` (B-019 re-found). Filed as `22-followup-as-org-onboarding-create` (HIGH PRIORITY). The history is the most valuable retrospective finding: B-019 was claimed "verified-fixed" by slice 0c2 because only the *read* surface was tested; the write surface was intentionally exempted in `override-scoping.test.ts:77-84` and the exemption was never re-checked. Drives methodology v2.2 tightening. |
| 5 | Sale transaction "Value" visibility check | **VERIFIED GREEN** — Chrome MCP. Sales show Value, rentals hidden. No P0 regression. |
| 6 | iPad real-finger smoke test | **DEFERRED** — requires hardware session. Tracked in Phase 5 stub `iPad real-finger validation`. |
| 7 | Audit closeout — archive + retrospective | **DONE** (this doc, via slice `bms-audit-closeout` PR TBD). Archive moves + retrospective + methodology v2.1.1 → v2.2 inline. |

**Audit officially closed:** 2026-05-02. Next audit: site-wide speed audit (`docs/handoff/site-wide-speed-audit-2026-05-02.md`).
