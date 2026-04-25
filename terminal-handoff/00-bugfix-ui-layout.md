# Terminal Hotfix: UI Layout + Cursor Bug

## Goal
Fix the Terminal page layout issues causing clipped text, spacing errors, and a JavaScript reference error. The page loads but the UI is broken: left sidebar category labels are clipped (missing first letters), the negative margin hack doesn't work with the parent layout, and the component doesn't fill the viewport height properly.

## Project
Repo: VettdRE (this repo)
File to modify: `src/app/(dashboard)/terminal/components/terminal-feed.tsx`

## Discovery Instructions
Before making changes, read these files:

1. `src/app/(dashboard)/dashboard-shell.tsx` — The parent component. Note: it has NO padding on the children area. It's a `<main>` with `min-h-dvh flex flex-col pb-16 md:pb-0` and a sidebar offset via `md:pl-60` or `md:pl-[60px]`. Children are rendered bare — no `p-4` or `p-6` wrapper.

2. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — The Terminal component. Note three bugs:
   - **Line 162:** `className="h-full flex flex-col bg-[#0D1117] text-[#E6EDF3] overflow-hidden -m-4 md:-m-6"` — The `-m-4 md:-m-6` negative margins are wrong because the parent (`DashboardShell`) doesn't apply `p-4` or `p-6` padding. These negative margins eat into the content, clipping the left sidebar text.
   - **Line 162:** `h-full` doesn't work because the parent uses `min-h-dvh flex flex-col`, not a fixed height. The Terminal needs `flex-1` to fill available space.
   - **Line 78:** `if (cursor)` references an undefined variable. Should be `if (cursorId)`.

3. Check if any other dashboard pages use a similar negative-margin breakout pattern to understand the convention. Look at `src/app/(dashboard)/market-intel/` or `src/app/(dashboard)/pipeline/` for comparison.

**Propose your plan before writing any code.**

## Implementation Intent

### Fix 1: Remove negative margins, use flex-1 for height

Replace the root div className on line 162:

**Before:**
```
className="h-full flex flex-col bg-[#0D1117] text-[#E6EDF3] overflow-hidden -m-4 md:-m-6"
```

**After:**
```
className="flex-1 flex flex-col bg-[#0D1117] text-[#E6EDF3] overflow-hidden"
```

This removes the negative margins that were clipping content, and uses `flex-1` to fill the available space in the flex-col parent (`DashboardShell`).

### Fix 2: Fix undefined variable reference

On line 78, change:
```
if (cursor) {
```
to:
```
if (cursorId) {
```

The parameter is named `cursorId`, not `cursor`. This bug causes a ReferenceError when infinite scroll pagination triggers.

### Fix 3: Add error boundary

Create `src/app/(dashboard)/terminal/error.tsx`:
```tsx
"use client";

import { useEffect } from "react";

export default function TerminalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Terminal] Error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0D1117] text-[#E6EDF3]">
      <div className="text-center space-y-3">
        <p className="text-sm font-mono text-[#8B949E]">Terminal encountered an error</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#0A84FF] text-white text-sm font-semibold rounded hover:bg-[#0A84FF]/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

### Verification
After applying fixes:
1. Run `npx tsc --noEmit` to verify no TypeScript errors
2. The Terminal page should fill the full viewport height below the top nav
3. The left sidebar category labels should be fully visible (not clipped)
4. The borough toggles should be properly spaced in the top bar
5. Scrolling down in the feed should not crash (the cursor fix)

## Constraints
- Only modify `terminal-feed.tsx` (2 changes) and create `terminal/error.tsx` (1 new file)
- Do NOT change the DashboardShell or any parent layout
- Do NOT change the dark theme colors or any other styling
- Keep the fix minimal — this is a hotfix, not a redesign
