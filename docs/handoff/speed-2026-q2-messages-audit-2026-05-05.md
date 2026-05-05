# Foundation Audit — Phase 0 walk #6: Messages (broker persona lens)

**Date:** 2026-05-05 (mid-day, after walks 4-5 chore commits)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3` (createClient hot-fix); main HEAD `691da6e` (post PR #64)
**Mode:** vertical-slice + **persona lens** (option C, first walk applying it)
**Persona:** Broker / Agent (Dan Tomback at Gulino is canonical)
**JTBD:** *"I have a contact who emailed me 5 days ago about a unit. Haven't heard back. I want to send a thoughtful follow-up — and ideally set up a cadence so I don't have to remember manually."*
**Scope:** `/messages` (inbox three-pane layout, Email tab, Leads filter, thread reading pane, CRM sidebar, quick-reply templates, reply box). Out of scope: SMS tab, Sent/Starred/Drafts/Trash folders, Compose modal, Sync flow, snooze workflow, bulk actions, keyboard shortcuts (j/k/c).

---

## Summary

Messages is a **mature inbox surface** with strong AI assistance baked in (per-thread AI summary, urgent flagging, lead-source sub-categorization, contact CRM sidebar). 9 defect findings (1 P2, 5 P3, 3 positive). 5 enhancement opportunities surfaced by the persona lens — most of them never would have shown up in a pure UX walk.

The defect headlines: AI Leads classification is over-eager (Chu's Meat Market and American Express AutoPay newsletters both classified as "Leads" — would burn broker time hunting for real leads in the noise), and Gmail sync appears stale (most recent emails dated Feb 22, 2.5+ months old).

The enhancement headlines are bigger:
- **No "Stale lead" filter or smart-inbox view.** Brokers can't easily find the threads that need follow-up. Filters are All / Leads / Personal / News / Snoozed / Pinned — none are "Needs follow-up."
- **Quick-reply templates are static (6 fixed leasing-flow templates).** Don't adapt to thread content. For Elizabeth Rodriguez's billing dispute, none of the 6 templates fit. AI-drafted contextual reply would save the broker 5 minutes of writing.
- **No inline cadence affordance.** To set up "follow up if no response in 3 days," broker has to navigate to `/settings/automations`, configure an automation, link it back. Multi-surface coordination = friction = brokers do it manually = drops balls.
- **CRM sidebar always shows "Create Lead/Contact" CTAs even for ongoing conversations.** Should detect existing entities (e.g., "this thread is about 49 Murdock Court 4G — view that building / view that deal").

These are the kinds of findings the methodology v2.3 enhancement lens is designed to surface. They're not bugs — the tool works. They're *gap-between-current-and-broker-flow-could-be*.

---

## Method

Vertical-slice + persona Phase 0 walk:
1. Cold-load `/messages`, observe three-pane layout + filter affordances + sync indicator
2. Frame the JTBD: "find a stale lead, send a thoughtful follow-up, set up a cadence"
3. Ask: can I find the right thread fast? (Click Leads filter → observe sub-categorization)
4. Ask: does the system tell me which threads are stale? (Inbox dates → manual eyeballing required)
5. Ask: can I take action without leaving Messages? (Click Elizabeth Rodriguez thread → observe reading pane + quick templates + CRM sidebar)
6. Ask: can I set up a follow-up cadence inline? (Inspect reply box + sidebar + thread header — answer: no)
7. Catalog defects observed alongside enhancement gaps

No code, no fixes.

---

## Findings (defects)

### P2 — medium impact

**M-4 — Leads filter classification is over-eager**
*Severity: P2 · Category: AI quality / Discoverability*

Repro: click "Leads" filter chip in inbox. Returned threads include:
- Elizabeth Rodriguez (real lead — billing dispute on existing deal)
- Zillow "Take the next step on 21 Sandra Cir" (Zillow nudge — possibly lead-relevant)
- Zillow "10 Rentals We Think You'll Love" (newsletter, NOT a lead)
- American Express "Enroll in AutoPay" (NOT a lead)
- Chu's Meat Market "Stock that Freezer" (NOT a lead, food vendor)

3-of-5 visible "Leads" are misclassified. Either the AI parser is over-tagging or the filter is "all non-Personal/News/Snoozed/Pinned" by default. For the broker JTBD ("find stale lead"), this means scrolling through ~70% noise. Productivity tax.

Defer-friendly fix paths: (a) tighten AI lead classifier — explicitly score sender (not domain like zillow.com / amexnews.com / chumeat.com) against "broker-relevant lead inbound" criteria; (b) add a "Confidence: lead" field and require >70% to show in Leads filter; (c) auto-route domain-blacklist senders (newsletters from known vendors) into News, never Leads.

---

### P3 — low impact, defer or batch

**M-1 — Inbox shows Feb 22 as most recent (today is May 5).** Gmail sync is ~2.5 months stale. Either the sync job is paused or no new emails are arriving for this account (Cowork session uses nathan@ntrec.co — could simply be no new mail). Worth verifying whether sync is healthy in admin; if mail IS arriving but inbox isn't refreshing, that's a real bug.

**M-3 — Filter chip count display is inconsistent.** "News (64)", "Personal (2)" show counts; "Leads", "Snoozed", "Pinned" don't. Inconsistent visual language. Counts also shifted mid-walk ("Personal (2)" → "Personal (4)", "News (64)" → "News (110)") — possibly because counts are computed against active filter scope.

**M-5 — Folder tabs truncated visually.** "Sent / Starred / Drafts / Trash / S..." — last tab cut off. Layout doesn't account for the additional "Spam" or "All Mail" tab.

**M-8 — Mark-as-read behavior unclear.** Opening Elizabeth's thread didn't show an explicit "Mark as read" toggle. Probably auto-marks on open; a clear visual indicator would help.

**M-9 — AI-extracted building reference ("49 Murdock Court 4G") in urgent banner is not clickable.** Should link to Market Intel BuildingProfile lookup. Cross-area opportunity.

---

### Positive observations

**M-2 — AI urgent flagging works.** Elizabeth Rodriguez's thread has a red Urgent badge auto-applied. Good signal-routing.

**M-6 — AI thread summary at top of thread is excellent.** "Elizabeth Rodriguez is requesting removal of her name from an account associated with 49 Murdock Court 4G due to erroneous billing charges and negative credit reporting." Saves the broker 30+ seconds of reading. This pattern should generalize to every long thread.

**M-7 — Sync indicator shows "Synced 25s ago".** Explicit recency. Good.

**Three-pane layout works well, keyboard shortcuts hinted in empty state, CRM sidebar surfaces "Not in your contacts" + Create CTAs.** Standard inbox UX done right.

**Lead source sub-filters appear when Leads filter is active** (StreetEasy / Zillow / Realtor / Referral). Good progressive disclosure.

---

## Enhancement opportunities (persona: Broker · JTBD: "follow up on a stale lead automatically")

### E-1 — "Stale leads" smart-inbox view (P1 enhancement)

**Gap:** The broker's most common workflow is "find threads that need my attention." The current filters (All / Leads / Personal / News / Snoozed / Pinned) require the broker to manually triage by eyeballing dates. There's no algorithmic surface for "you haven't responded to these contacts in N days and they're warm."

**Enhancement:** A new smart-inbox view called "Needs Follow-Up" that surfaces threads where:
- `last_inbound_email_at > last_outbound_email_at` (they emailed last)
- `now - last_inbound_email_at > 3 days` (stale, configurable)
- `contact.status NOT IN ("closed_lost", "closed_won")` (still actionable)
- Optionally weighted by lead score, deal value, or last_inbound_temperature (AI-detected)

UI: replace the empty reading pane on first load with this view. Default `/messages` lands here, not on the linear date-sorted inbox.

**Impact:** Turns Messages from a 361-unread overwhelm-firehose into a 5-item action list. Direct broker JTBD.

---

### E-2 — AI-drafted contextual reply button (P1 enhancement)

**Gap:** Quick-reply templates are 6 fixed leasing-flow strings ("Thanks for reaching out", "Schedule showing", "Follow up", "New listing alert", "Check in"). For Elizabeth's billing dispute, *none* of them fit. The broker has to write a custom reply from scratch — exactly the friction AI is supposed to eliminate.

**Enhancement:** Add a "**✨ AI draft**" button alongside the 6 templates. On click, AI reads the thread (it already generates a summary at the top — same model could draft) and produces a context-aware reply, e.g. "Hi Elizabeth, I'll reach out to mariaL@revonaproperties.com today and confirm the charges are reversed within 48 hours. I'll keep you posted." Draft populates the reply box; broker reviews + sends.

**Impact:** Saves 3-5 minutes per reply for any thread that doesn't fit a template. For brokers handling 50+ replies/day, that's 2.5-4 hours saved/week.

---

### E-3 — Inline follow-up cadence affordance (P1 enhancement)

**Gap:** To set up "follow up if no response in 3 days," broker has to:
1. Leave Messages
2. Navigate to `/settings/automations`
3. Create a new automation
4. Configure trigger (no_activity for this contact)
5. Configure action (send_email with template)
6. Link back to this conversation

Six steps across two surfaces. Real brokers won't do this — they'll either set a manual reminder somewhere else or drop the ball.

**Enhancement:** Inline cadence button below the reply box: "🔁 Set follow-up cadence". On click, modal asks: "Follow up if no response in [3 days] with [template]. Stop after [3 attempts] or once they reply." Saves the cadence to Automations under the hood; broker stays in the inbox.

**Impact:** Eliminates the multi-surface coordination tax. Drops dropped balls. Direct broker JTBD.

---

### E-4 — CRM sidebar should detect existing entities (P2 enhancement)

**Gap:** Right sidebar shows "Create Lead" + "Create Contact" CTAs even for ongoing conversations. For Elizabeth's thread (clearly an existing deal — Nathan and team already replied, building reference 49 Murdock Court 4G already extracted), the more useful CTAs would be:
- "Open building profile for 49 Murdock Court" (deep-link to Market Intel)
- "View existing deal" (if the building has an active deal/listing)
- "Pull transaction/lease record" (if BMS has a record)

**Enhancement:** AI-powered entity detection in the sidebar. If thread mentions a known building (extracted via AI summary, already done), show "View 49 Murdock Court" instead of (or alongside) "Create Lead". Promote to "Create Lead" only when no entity matches. Detection runs server-side, cached per thread.

**Impact:** Turns Messages from a sender-centric inbox into a deal-aware workspace. Aligns with the audit-doc cross-area finding from walk #5 (CRM-vs-BMS architecture is unifying — Messages should reflect that).

---

### E-5 — Triage stacks instead of linear inbox (P3 enhancement, ambitious)

**Gap:** "361 unread" is overwhelming and not actionable. Brokers don't need to read 361 emails. They need to triage to the 5-10 that matter.

**Enhancement:** Replace the linear date-sorted inbox with **AI-curated semantic stacks**:
- 🔥 **Hot leads** (3) — high lead-score, recent, hand-raised
- 🤝 **Awaiting your reply** (5) — they emailed last, you haven't responded, > 24h
- 📅 **Showings to confirm** (2) — calendar invites or showing-scheduled threads
- 💰 **Vendor / billing** (4) — bills, vendor responses, ops noise
- 📰 **Newsletters** (collapsed by default, ~50)

Within each stack, threads sorted by urgency (lead-score × staleness × deal-value). Linear date view available behind a toggle for power users.

**Impact:** Big paradigm shift but high payoff. Turns Messages from "another inbox to drown in" into "today's action list."

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-messages-leads-classifier-tightening` (P2)
- **Status:** Phase 5 backlog
- **Background:** "Leads" filter on `/messages` returns ~70% false positives (newsletters from Zillow / American Express / Chu's Meat Market all classified as Leads). Surfaced 2026-05-05 during Phase 0 walk #6 with broker persona lens — broker JTBD ("find stale lead") wastes time scrolling through misclassified noise.
- **Discovery instructions:** Read `lib/email-categorizer.ts` to understand how categorization assigns the `lead` label. Check whether the classifier uses (a) sender domain + heuristics or (b) AI prompt-based classification or (c) both. Sample DB: query `EmailMessage` rows where `category = 'lead'` and inspect senders — quantify the false-positive rate. Cross-reference `lib/email-parser.ts` for any AI-driven classification logic.
- **Hypotheses to confirm/refute:** (a) classifier defaults to "lead" when no other category matches, catching newsletters as fallback; (b) classifier checks for keywords like "rental" / "showing" / "available" but doesn't filter sender against newsletter domains; (c) classifier is AI-driven but the prompt over-includes.
- **Why deferred:** Phase 0 finding (P2) — Phase 1 work. Fix is tightening classification logic + possibly adding domain blacklist for known newsletter senders.
- **Required input before slicing:** Sample DB query results to confirm false-positive rate. Decide: blacklist-based filter (fast, brittle) vs. retrain AI classifier (slow, robust) vs. confidence-threshold filter (medium, simple).
- **Affected surfaces:** `lib/email-categorizer.ts`, possibly `lib/email-parser.ts`, possibly a new domain-blacklist table or config in Settings.
- **Out of scope:** Sentiment scoring, urgency tagging — those work fine.
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #6 (`docs/handoff/speed-2026-q2-messages-audit-2026-05-05.md`, finding M-4).
```

(E-1 through E-5 are enhancement opportunities, not defect stubs. They warrant a different ledger pattern — likely a new "Phase 1 enhancement candidates" section in `SLICES-speed.md` or a separate ledger for forward-product-work. Methodology v2.3 should formalize. For now, captured in this audit doc only.)

---

## Out of scope (deferred)

- SMS tab (separate channel walk)
- Compose modal
- Sent / Starred / Drafts / Trash folders
- Snooze workflow
- Bulk actions (read/star/pin/label/snooze/archive/delete)
- Custom labels CRUD
- Keyboard shortcuts in-depth
- Email signatures
- Templates library admin (in Settings)
- Mobile responsive
- RBAC walks for `agent` role

---

## Methodology v2.3 retro candidates (additions from this walk)

1. **The persona lens produces a different category of finding than pure UX walking does.** This walk surfaced 5 enhancement opportunities (E-1 through E-5) that would have been invisible to a defect-finding walk. Specifically: lacking smart-inbox views, lacking AI-drafted replies, lacking inline cadence affordances, lacking entity-aware CRM sidebar, lacking semantic triage stacks. Each is actionable as a Phase 1 product slice. **Recommendation:** every remaining Phase 0 walk should pick one persona + one JTBD and write an `## Enhancement opportunities` section. Methodology v2.3 should canonicalize this in `phase-0-swarm-prompt.md`.

2. **Enhancement opportunities need a different ledger than defect stubs.** The canonical `### \`phase-0-followup-...\`` stub format is built around fixing a known bug. E-1/E-2/E-3 are not bugs — they're missing capabilities. Filing them as `phase-0-followup-messages-stale-inbox-view` would create category confusion. Methodology v2.3 should add a parallel ledger: `Phase 1 enhancement candidates` or similar, with its own field schema (Persona / JTBD / Current friction / Proposed enhancement / Impact estimate / Effort estimate).

3. **Cross-area enhancements emerge when persona crosses surface boundaries.** E-3 (inline cadence) requires Messages + Templates + Automations to stitch. E-4 (entity-aware sidebar) requires Messages + Market Intel + BMS Listings/Transactions to integrate. Single-area walks miss these — the persona is what joins surfaces. **Recommendation:** dedicated Phase 0.5 persona walks (option C from session-start convo) will surface even more of these.

4. **AI thread summary is the canonical "AI assists the broker" pattern in this product.** Generalizes well — every long-form data surface (deal docs, contact dossiers, building profiles) could have AI summary at top. Worth a cross-area "AI summary coverage audit" to see which surfaces have it and which should.
