# Building Intelligence Overhaul — Documentation

This directory contains the comprehensive build prompt suite and supporting research for the VettdRE building intelligence engine overhaul.

## Files

| File | Purpose |
|------|---------|
| `building-intel-overhaul-prompt.md` | The full 10-phase comprehensive build prompt suite. Each phase is self-contained for sequential Claude Code sessions. |
| `phase-0-paste.md` | Just the Phase 0 chunk (orientation + non-negotiables + critical conventions + Phase 0). Paste this into Claude Code first. |
| `condo-ownership-v1-spec.md` | Original v1 spec (Manus AI handoff). Read for historical context only — superseded by the build prompt. |
| `condo-ownership-deep-dive.md` | Deep Dive #1: architecture and data-source survey. |
| `condo-ownership-data-sources-deep-dive-2.md` | Deep Dive #2: exhaustive free-data sources + 10 cross-reference plays. |
| `building-intel-deep-dive-3.md` | Deep Dive #3: debt structure, distress signals, capital markets, operator networks + 3 additional plays. |

## Phase progress (filled in as we go)

- [ ] Phase 0 — Discovery + Architecture Confirmation
- [ ] Phase 1 — Schema Spine
- [ ] Phase 2 — Ingest Infrastructure + Core ACRIS Sources
- [ ] Phase 3 — Auxiliary Free-Data Sources
- [ ] Phase 4 — Entity Resolution + Beneficial-Owner Unmasking
- [ ] Phase 5 — data-fusion-engine Extensions
- [ ] Phase 6 — Cross-Reference Plays as Composable Signals
- [ ] Phase 7 — Apartment-Level UI Lenses
- [ ] Phase 8 — Market Intel UI Upgrades
- [ ] Phase 9 — Deploy Artifacts + Verification + Monitoring

## How to use

1. Create a feature branch: `git checkout -b feat/building-intel-overhaul`.
2. Paste the contents of `phase-0-paste.md` into Claude Code as your initial prompt.
3. Wait for the discovery report (Phase 0 is read-only — no code changes).
4. Review the report with Nathan.
5. Paste each subsequent phase from `building-intel-overhaul-prompt.md`, one at a time, with checkpoints between.

