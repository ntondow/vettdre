# VettdRE Terminal — Claude Code Handoff Prompts

## Overview
12 sequential prompts that build the VettdRE Terminal. Prompts 1-6 are the Phase 1 MVP. Prompts 7-12 are the polish pass that takes it from MVP to a polished v1. Each prompt is one Claude Code session. Execute in order — each depends on the previous.

## Execution Order

### Phase 1: MVP (Prompts 1-6)

| # | File | What it builds | Estimated time |
|---|------|----------------|----------------|
| 1 | `01-prisma-schema.md` | 7 Prisma models, 3 enums, migration, seed data | 15-20 min |
| 2 | `02-ingestion-infrastructure.md` | SODA API polling engine, dataset registry, cron endpoint | 30-45 min |
| 3 | `03-enrichment-pipeline.md` | BBL-keyed data assembly, reuses data-fusion-engine | 30-40 min |
| 4 | `04-ai-brief-generation.md` | Bloomberg-voice system prompt, Anthropic API calls | 25-35 min |
| 5 | `05-terminal-ui.md` | Dark theme feed UI, filters, toggles, responsive layout | 45-60 min |
| 6 | `06-app-shell-integration.md` | Sidebar/mobile nav, feature gates, paywall, wiring | 15-20 min |

### Phase 2: Polish (Prompts 7-12)

| # | File | What it builds | Estimated time |
|---|------|----------------|----------------|
| 7 | `07-cloud-scheduler-backfill.md` | Cloud Scheduler setup, historical data backfill endpoint | 20-30 min |
| 8 | `08-right-panel-building-profile.md` | Full BuildingProfile component in right panel (replaces JSON dump) | 20-30 min |
| 9 | `09-claudemd-ingestion-health.md` | CLAUDE.md Terminal docs + admin ingestion health dashboard | 30-40 min |
| 10 | `10-watchlists-notifications.md` | Watchlist CRUD, alert matching engine, notification bell | 40-50 min |
| 11 | `11-supabase-realtime.md` | Live event streaming via Supabase Realtime (first in codebase) | 30-40 min |
| 12 | `12-search.md` | Full-text search across briefs, addresses, owners, BBLs | 30-40 min |

## How to use
1. Open Claude Code in the VettdRE repo
2. Paste the contents of the prompt file
3. Let Claude Code discover files, propose a plan, then implement
4. Verify the output before moving to the next prompt
5. Commit after each prompt passes
6. Start a new Claude Code session between prompts (fresh context)

## Dependencies between prompts
- **7** is independent (infra/scripts) — can run anytime after 1-6
- **8** requires 5 (needs terminal-feed.tsx right panel)
- **9** requires 1-6 (documents all MVP code) + creates admin page
- **10** requires 1-6 (uses TerminalWatchlist schema from Prompt 1, modifies terminal-feed.tsx)
- **11** requires 5 + 10 (modifies terminal-feed.tsx after watchlists are wired)
- **12** requires 5 + 11 (modifies terminal-feed.tsx after Realtime is wired, uses same event card)

## Source spec
`VettdRE-Terminal-Product-Spec-v1.1.docx` — corrected spec with all codebase alignment fixes.
