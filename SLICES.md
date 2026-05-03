# VettdRE Audit Ledger Index

This is the top-level audit ledger index. Per-audit slice ledgers live in
`SLICES-<audit>.md` files alongside this one. Methodology and split
convention: `docs/methodology/slice-based-audit.md` v2.2 §"Tier 2:
SLICES.md" + §"Split convention".

## Active and recent audits

| Audit | Status | Ledger | Kickoff doc | Notes |
|-------|--------|--------|-------------|-------|
| BMS Overhaul | **Closed 2026-05-02** | [`SLICES-bms.md`](./SLICES-bms.md) | `docs/handoff/archive/bms-audit-2026-04-28.md` | 5-day sprint, 119 commits, ~30+ slices. Retrospective at `docs/handoff/bms-overhaul-retrospective-2026-05-02.md`. |
| Foundation / Speed Audit (Q2 2026) | **Active** | [`SLICES-speed.md`](./SLICES-speed.md) | `docs/handoff/site-wide-speed-audit-2026-05-02.md` + `docs/handoff/audit-sprint-plan-2026-05-02.md` | Site-wide performance audit. Phase Z setup in progress. Master backlog: `docs/handoff/audit-roadmap-2026-q2-q4.md`. |

## Convention

- New audits get a dedicated `SLICES-<audit>.md` ledger. Add a row to the
  table above when an audit kicks off.
- This index file (`SLICES.md`) carries no slice content — only audit
  metadata + pointers. Slice content (entries, plan-of-record, Phase 5
  stubs, gate headers) lives in the per-audit ledger.
- Ledger split is triggered pre-emptively per methodology v2.2
  §"Split convention" — any time a single SLICES file would exceed
  1000 lines OR an audit's scope is clearly multi-month.
- Closed audits keep their ledger in place after closeout. Per
  methodology v2.2 §"End-of-audit gate", the ledger may be archived to
  `docs/methodology/archive/SLICES-<audit>-<date>.md` at next-audit
  Phase Z time; until then it stays at the original path so cross-refs
  in retrospectives, post-mortems, and follow-up stub bodies don't rot.

## Where to find slice work in progress

If you're a Claude Code agent picking up the next slice:
1. Find the active audit in the table above (the row with status
   "Active").
2. Open its ledger file. Find the next `pending` slice in the current
   phase.
3. Read the kickoff doc referenced for that audit before proposing a
   plan. Methodology v2.2 §"Per-audit setup checklist" is the canonical
   loop.
