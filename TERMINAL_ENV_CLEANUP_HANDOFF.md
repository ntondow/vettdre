# Terminal Step 0: NYC Open Data Token Consolidation — Handoff Doc

## Goal
The codebase uses two different env var names for the same NYC Open Data Socrata App Token. This causes some features (Market Intel, comps, cap rates) to make unauthenticated requests that get throttled at 1,000 req/hr, while Terminal uses the correct token and gets 50,000 req/hr. Consolidate to one env var everywhere.

## Project
**Repo/folder:** `src/` (6 files across lib/ and app/)

## The Problem
- `NYC_OPEN_DATA_APP_TOKEN` — used by Terminal (ingestion, backfill) and a couple Market Intel actions. **This is the one with a live secret in GCP Secret Manager.**
- `NYC_OPEN_DATA_TOKEN` — used by Market Intel core, comps engine, cap rate actions, FHFA. **This one may not be set, meaning those API calls are unauthenticated and rate-limited.**

## Discovery Instructions
Read these files before making changes:

1. `src/lib/terminal-ingestion.ts` (line 22) — correct usage, reference pattern
2. `src/lib/terminal-backfill.ts` (line 21) — correct usage
3. `src/lib/nyc-opendata.ts` — main NYC Open Data wrapper, check if it references either var
4. `src/lib/comps-engine.ts` (lines 176, 328, 332) — uses wrong var name
5. `src/lib/fhfa.ts` (line 151) — uses wrong var name
6. `src/app/(dashboard)/market-intel/new-development-actions.ts` (line 101) — uses wrong var name
7. `src/app/(dashboard)/market-intel/comps-actions.ts` (lines 41, 69) — uses wrong var name
8. `src/app/(dashboard)/deals/caprate-actions.ts` (line 33) — uses wrong var name
9. `src/app/(dashboard)/market-intel/str-actions.ts` (lines 21-22) — correct usage
10. `src/app/(dashboard)/market-intel/renovation-actions.ts` (lines 21-22) — correct usage

## Implementation Intent

### Replace all `NYC_OPEN_DATA_TOKEN` references with `NYC_OPEN_DATA_APP_TOKEN`

**Files to change (5 files, ~8 lines total):**

| File | Line(s) | Current | Change to |
|------|---------|---------|-----------|
| `src/lib/comps-engine.ts` | 176, 328, 332 | `process.env.NYC_OPEN_DATA_TOKEN` | `process.env.NYC_OPEN_DATA_APP_TOKEN` |
| `src/lib/fhfa.ts` | 151 | `process.env.NYC_OPEN_DATA_TOKEN` | `process.env.NYC_OPEN_DATA_APP_TOKEN` |
| `src/app/(dashboard)/market-intel/new-development-actions.ts` | 101 | `process.env.NYC_OPEN_DATA_TOKEN` | `process.env.NYC_OPEN_DATA_APP_TOKEN` |
| `src/app/(dashboard)/market-intel/comps-actions.ts` | 41, 69 | `process.env.NYC_OPEN_DATA_TOKEN` | `process.env.NYC_OPEN_DATA_APP_TOKEN` |
| `src/app/(dashboard)/deals/caprate-actions.ts` | 33 | `process.env.NYC_OPEN_DATA_TOKEN` | `process.env.NYC_OPEN_DATA_APP_TOKEN` |

**No files need to change (already correct):**
- `src/lib/terminal-ingestion.ts`
- `src/lib/terminal-backfill.ts`
- `src/app/(dashboard)/market-intel/str-actions.ts`
- `src/app/(dashboard)/market-intel/renovation-actions.ts`

### Also: remove `NYC_OPEN_DATA_TOKEN` from any .env / .env.example / .env.local files if it exists, so there's no confusion going forward.

### Also: check `CLAUDE.md` env var docs — update to remove `NYC_OPEN_DATA_TOKEN` if listed, keep only `NYC_OPEN_DATA_APP_TOKEN`.

## Constraints
- Pure find-and-replace — no logic changes
- The header approach (`"X-App-Token": process.env.NYC_OPEN_DATA_APP_TOKEN`) and the query param approach (`$$app_token=${token}`) are both valid Socrata auth methods. Don't change the method, just the env var name.
- Don't touch any other env vars
- Run `grep -r "NYC_OPEN_DATA_TOKEN" src/` after changes to confirm zero remaining references to the old name

## Verification
After making changes, run:
```bash
grep -r "NYC_OPEN_DATA_TOKEN" src/
```
Expected: only `NYC_OPEN_DATA_APP_TOKEN` matches, zero `NYC_OPEN_DATA_TOKEN` (without `_APP_`) matches.
