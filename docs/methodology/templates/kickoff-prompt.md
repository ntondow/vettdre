# Slice Kickoff Prompt — Template

Paste this into a fresh Claude Code session, fill in the bracketed sections, and tell the agent to "stop and propose plan in chat first." Do NOT let it write code on the first turn.

---

```
Slice [SLICE_ID] — [one-line goal].

**The bug:**
[Explain the user-visible symptom + what makes it wrong.
Reference a screenshot path or specific surface URL.
If reproducible, include exact reproduction steps.]

**The fix:**
[High-level approach. If multiple options exist, list them and indicate
your preference with rationale. The agent will refine in plan-of-record.]

**Discovery instructions (read-only — no code yet):**
- Read [file 1] — find [specific thing]
- Read [file 2] — confirm [specific thing]
- Grep for [pattern] across [scope]
- [Any other read-only investigation: schema check, prod query, etc.]

**Implementation intent (for agent — describes WHAT, not HOW):**
- [What the code should do, e.g. "vault list query honors as_org param"]
- [Constraints: must not touch X, must follow pattern Y, must preserve Z]

**Smoke contracts ([N] contracts — at minimum 1, target 2-4):**
1. [Pin description: positive structural pin OR negative pin against
   pre-fix shape OR cardinality assertion]
2. [Pin description]
...

Smoke contracts go in `tests/smoke/[SLICE_ID].test.ts` and
must run green in CI before merge.

**Stop conditions:**
- If [specific scenario], stop and propose options.
- If [security boundary touched: auth, RBAC, RLS, CSP], stop and surface.
- If [data layer change required: migration, schema, team-context], stop
  and propose plan before any code.
- If line count exceeds 280, stop and propose split.
- If implementation requires modifying another slice's smoke contracts,
  stop and surface — contract relaxation across slices needs explicit
  PR-body acknowledgment.

**Verification (post-merge, REQUIRED):**
- [Specific UI smoke step — what URL, what to click, what to confirm]
- [Specific Sentry/log check — what trace, what error to NOT see]
- [If data changed: prisma query to confirm migration applied correctly]

Save verification evidence to:
- Screenshot: `docs/handoff/screenshots/[SLICE_ID]-prod.png`
- Or paste assertions/query output into PR comment

**Plan-of-record requirements:**
Before writing ANY code, append a "Plan of record" section to this
slice's entry in SLICES.md (or SLICES-[audit].md). The section must
include:
- Files to be created/modified (full paths)
- Smoke contract regex pins (the actual regex strings)
- Estimated line count
- Stop conditions you've internalized
- Open questions if any

Wait for Nathan's "approved" reply in chat before proceeding to code.

**Branch:** [PHASE]/[SLICE_ID]-[short-name] off origin/main
   (e.g. feat/p4-22-as-org-vault, chore/speed-z1-bundle-analyzer)
**PR title:** [conventional commit format: type(scope): description]
**Closes:** [SLICES.md slice ID, audit doc bug IDs if any]
**Phase 5 stubs:** if you surface deferred work during implementation,
file each as a stub in SLICES.md before opening the PR. Use
`docs/methodology/templates/stub.md` for the format.

Stop and propose plan in chat first. Don't write code yet.
```

---

## Quality bar

A good kickoff prompt is **specific enough that the agent's discovery phase confirms or refutes a hypothesis**, not so specific that the agent rubber-stamps your assumptions.

Common mistakes:

- **Too vague**: "fix the vault page" — agent has to do too much investigation, often misses the actual bug.
- **Too prescriptive**: "edit line 142 of vault/page.tsx to change X to Y" — agent skips its own analysis and ships your bad assumption.
- **Missing stop conditions**: agent ships a 600-line slice or modifies auth code without surfacing.
- **Missing verification spec**: post-merge "looks fine" hand-waving, no recorded evidence.
- **No smoke contracts**: regression-prone fix that someone reverts a month later with no test failure.

Hit the middle: state the bug, propose the approach, list discovery, define smoke contracts and verification — then let the agent's plan-of-record refine the implementation details.
