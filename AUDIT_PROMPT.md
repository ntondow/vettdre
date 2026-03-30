# Claude Code Audit Prompt

Paste this entire block into Claude Code:

---

Audit the following recent changes to the VettdRE BMS (Brokerage Management System) deal submission system. Your job is to find bugs, type mismatches, missing edge cases, and optimization opportunities — then fix them directly. Do NOT ask for permission, just make the fixes.

## What Changed

### 1. Deal Submission Form Restructure (`src/app/(dashboard)/brokerage/my-deals/submit/submit-deal-form.tsx`)
- Form now has 3 deal type options: **Rental**, **Sale**, **Lease** (was 2: Lease, Sale)
- "Personal Exclusive" renamed to "Agent Exclusive" throughout
- Exclusive Type step only shows AFTER deal type is selected
- New `isLeaseType` boolean: `dealType === "rental" || dealType === "lease"` — used for conditional fields
- Processing fee math added: gross commission → minus processing fee → net commission → split

### 2. Processing Fee System (new feature)
- `Organization.processingFeePct` — new Decimal column (schema already pushed to DB)
- `DealSubmission.processingFeePct` + `DealSubmission.processingFeeAmt` — snapshot columns
- Fee is % deducted from gross commission BEFORE agent/house split
- Example: $3,500 gross × 2% fee = $70 → $3,430 net → split 70/30

### 3. Brokerage Settings Page (`src/app/(dashboard)/brokerage/settings/page.tsx`)
- New "Commission Splits & Fees" section added before Invoice Defaults
- Fields: Brokerage Exclusive agent split %, Agent Exclusive agent split %, Processing Fee %
- Live example calculation shown when fee > 0

### 4. Settings Actions (`src/app/(dashboard)/brokerage/settings/actions.ts`)
- `getBrokerageSettings()` now returns `processingFeePct`, `defaultHouseExclusiveSplitPct`, `defaultPersonalExclusiveSplitPct`
- `updateBrokerageSettings()` now accepts and saves those 3 new fields

### 5. Types (`src/lib/bms-types.ts`)
- `DealSubmissionInput` has `processingFeePct?` and `processingFeeAmt?`
- `BrokerageSettings` has `processingFeePct`, `defaultHouseExclusiveSplitPct`, `defaultPersonalExclusiveSplitPct`
- `EXCLUSIVE_TYPE_LABELS.personal` changed from "Personal Exclusive" to "Agent Exclusive"

### 6. Submit Page (`src/app/(dashboard)/brokerage/my-deals/submit/page.tsx`)
- Now fetches `processingFeePct` from org and passes to form component

### 7. Deal Submissions Actions (`src/app/(dashboard)/brokerage/deal-submissions/actions.ts`)
- `submitDeal()` now stores `processingFeePct` and `processingFeeAmt` on the DealSubmission record

## Files to Audit

Read ALL of these files carefully:

1. `src/app/(dashboard)/brokerage/my-deals/submit/submit-deal-form.tsx` — the main form component (~1060 lines)
2. `src/app/(dashboard)/brokerage/my-deals/submit/page.tsx` — server component that passes props
3. `src/app/(dashboard)/brokerage/deal-submissions/actions.ts` — server actions (submitDeal, approveSubmission, etc.)
4. `src/app/(dashboard)/brokerage/settings/page.tsx` — settings page (search for "Commission Splits & Fees" section and the handleSaveSettings function)
5. `src/app/(dashboard)/brokerage/settings/actions.ts` — settings get/save actions
6. `src/lib/bms-types.ts` — shared types (DealSubmissionInput, BrokerageSettings, ExclusiveType, labels)
7. `prisma/schema.prisma` — check Organization and DealSubmission models for the new columns

## What to Check

### Type Safety
- Are all new fields properly typed in both the Prisma schema and TypeScript interfaces?
- Does the `dealType` state type `"rental" | "sale" | "lease" | ""` match everywhere it's used?
- Is `DealSubmissionInput.dealType` type wide enough for "rental"?
- Are there any `as` type assertions that could silently fail?

### Commission Math
- Is the processing fee correctly deducted BEFORE the split? (gross → fee → net → split)
- Are `agentPayout` and `housePayout` calculated on `netCommission`, not `totalCommission`?
- What happens when `processingFeePct` is 0 or undefined? Does it gracefully become no-op?
- Is `totalCommission` stored as the GROSS amount on the DealSubmission? (it should be — the fee is separate)
- Edge case: what if processingFeePct > 100? Should we clamp it?

### Form UX
- Does the exclusive type section properly hide until deal type is selected?
- When switching between deal types, do the lease/sale fields properly show/hide?
- Does `isLeaseType` correctly gate ALL lease-specific fields and validation?
- Are there any stale references to `dealType === "lease"` that should be `isLeaseType`?
- Is the 3-column grid for deal type cards responsive on mobile? (might need `grid-cols-1 sm:grid-cols-3`)

### Data Flow
- Does the settings page properly load AND save all 3 new fields?
- Does the `setField` helper on the settings page work with the new field names?
- Are the default values consistent? (50 for brokerage exclusive, 70 for agent exclusive, 0 for processing fee)
- When approveSubmission() is called with overrides, does it account for processing fee in recalculation?

### Naming Consistency
- Is "Agent Exclusive" used consistently everywhere "Personal Exclusive" was? Check labels, descriptions, tooltips
- The underlying data value is still `"personal"` — is that clearly documented and not confusing?

### Missing Pieces
- Does the deal-submissions LIST page (where managers see submissions) display the processing fee?
- Does the revenue dashboard account for processing fees in its totals?
- Does the invoice PDF include the processing fee line item?
- Are there any other places that reference `totalCommission` that should now use net commission?
- Search the entire codebase for "Personal Exclusive" string literals that need updating

### Settings Page
- Does the admin-only role check still work for the new section?
- Is the `hasChanges` detection working for the new fields?
- Are the number inputs properly bounded (min/max/step)?

## Instructions

1. Read all 7 files listed above
2. Search the codebase for any references to "Personal Exclusive", `dealType === "lease"` (without rental), and `totalCommission` that might need updating
3. List every issue you find
4. Fix each issue directly in the code
5. After all fixes, do a final grep to confirm no stale references remain

Be thorough. This is going to production.
