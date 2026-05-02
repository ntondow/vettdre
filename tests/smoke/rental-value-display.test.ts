// Slice 21 smoke — rental "Value" display fix.
//
// On rental/lease transactions, displaying transactionValue (= annual rent)
// as the deal headline misled brokerages: the actual revenue impact is the
// gross commission ($4,500), not the lease total ($54,000). Sale Value =
// sale price, which is correctly meaningful, so sales are unaffected.
//
// This slice fixes 4 per-row display surfaces (transactions detail page,
// transactions list mobile + desktop, agent detail recent-deals + deals
// table, and my-deals Deal Overview). Aggregate computations like
// `totalVolume` are intentionally left untouched — touching them would
// silently shift commission tier calculations for agents on volume-based
// plans (filed as Phase 5 stub `21-fix-followup-volume-aggregates`).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isRentalTransaction,
  isRentalDealType,
} from "@/lib/bms-types";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 21 — rental Value display fix", () => {
  // ── C1: helper behavior ────────────────────────────────────

  it("isRentalTransaction + isRentalDealType return correct values for each enum", () => {
    // Two helpers because two enums are involved with different breadth:
    // Transaction.type is the 2-value `rental | sale`; DealSubmission /
    // my-deals carries the 7-value BmsDealType where `lease` and
    // `commercial_lease` are also rentals semantically. Conflating them
    // would lose granularity.

    expect(isRentalTransaction({ type: "rental" })).toBe(true);
    expect(isRentalTransaction({ type: "sale" })).toBe(false);

    expect(isRentalDealType({ dealType: "rental" })).toBe(true);
    expect(isRentalDealType({ dealType: "lease" })).toBe(true);
    expect(isRentalDealType({ dealType: "commercial_lease" })).toBe(true);
    expect(isRentalDealType({ dealType: "sale" })).toBe(false);
    expect(isRentalDealType({ dealType: "commercial_sale" })).toBe(false);
    expect(isRentalDealType({ dealType: "land" })).toBe(false);
    expect(isRentalDealType({ dealType: "new_construction" })).toBe(false);
    // Tolerates null/undefined/unknown strings (DB rows may have stale data).
    expect(isRentalDealType({ dealType: null })).toBe(false);
    expect(isRentalDealType({ dealType: undefined })).toBe(false);
    expect(isRentalDealType({ dealType: "" })).toBe(false);
  });

  // ── C2: detail page Deal Info "Value" row gating ───────────

  it("transactions detail page hides the 'Value' row for rentals", () => {
    const src = readSource("src/app/(dashboard)/brokerage/transactions/[id]/page.tsx");

    // Helper imported.
    expect(
      src,
      "must import isRentalTransaction from bms-types",
    ).toMatch(/import\s*\{[\s\S]*?isRentalTransaction[\s\S]*?\}\s*from\s*["']@\/lib\/bms-types["']/);

    // The Deal Info "Value" row literal is gated on !isRentalTransaction(tx).
    // The pre-fix shape was an unconditional <div ...>Value</div>; the regex
    // pins both the gate AND the "Value" label inside it so a future revert
    // that drops the gate but keeps the row will trip the contract.
    expect(
      src,
      "Deal Info 'Value' row must be gated on !isRentalTransaction(tx)",
    ).toMatch(
      /\{\s*!isRentalTransaction\(tx\)\s*&&\s*\([\s\S]{0,400}>\s*Value\s*</,
    );
  });

  // ── C3: transactions list value cell gating (mobile + desktop) ─

  it("transactions list value cell shows '—' for rentals on both mobile and desktop", () => {
    const src = readSource("src/app/(dashboard)/brokerage/transactions/page.tsx");

    // Helper imported.
    expect(
      src,
      "must import isRentalTransaction from bms-types",
    ).toMatch(/import\s*\{\s*isRentalTransaction\s*\}\s*from\s*["']@\/lib\/bms-types["']/);

    // Both list rows (mobile compact + desktop right-aligned column) use
    // the same gate shape: `isRentalTransaction(tx) ? "—" : (tx.transactionValue ? fmt(...) : "—")`.
    // Repo mixes literal em-dash glyphs and `—` JS escapes — match
    // either via alternation. The contract requires AT LEAST 2 occurrences
    // (one per render path) so dropping either trips it.
    const DASH = "(?:—|\\\\u2014)";
    const matches = src.match(
      new RegExp(
        `isRentalTransaction\\(tx\\)\\s*\\?\\s*["']${DASH}["']\\s*:\\s*\\(tx\\.transactionValue\\s*\\?\\s*fmt\\(tx\\.transactionValue\\)\\s*:\\s*["']${DASH}["']\\)`,
        "g",
      ),
    );
    expect(
      matches,
      "must use isRentalTransaction(tx) ? '—' : (tx.transactionValue ? fmt(...) : '—') in both list rows",
    ).not.toBeNull();
    expect(
      matches!.length,
      "expected at least 2 occurrences (mobile + desktop list rows)",
    ).toBeGreaterThanOrEqual(2);
  });

  // ── C4: agent detail page value cells gating ───────────────

  it("agent detail page hides value for rental deals (recent-deals list + deals table)", () => {
    const src = readSource("src/app/(dashboard)/brokerage/agents/[id]/page.tsx");

    // Helper imported. Agent detail uses the wider BmsDealType enum because
    // its data source is DealSubmission, not Transaction.
    expect(
      src,
      "must import isRentalDealType from bms-types",
    ).toMatch(/import\s*\{[\s\S]*?isRentalDealType[\s\S]*?\}\s*from\s*["']@\/lib\/bms-types["']/);

    // Both per-row displays gate on `isRentalDealType(d) ? "—" : fmt(...)`.
    // Repo mixes literal em-dash and `—` escape — match either.
    const DASH = "(?:—|\\\\u2014)";
    const matches = src.match(
      new RegExp(
        `isRentalDealType\\(d\\)\\s*\\?\\s*["']${DASH}["']\\s*:\\s*fmt\\(Number\\(d\\.transactionValue\\)\\)`,
        "g",
      ),
    );
    expect(
      matches,
      "must use isRentalDealType(d) ? '—' : fmt(Number(d.transactionValue)) in both per-row displays",
    ).not.toBeNull();
    expect(
      matches!.length,
      "expected at least 2 occurrences (recent-deals list + deals table)",
    ).toBeGreaterThanOrEqual(2);
  });

  // ── C5: my-deals Deal Overview row gating ──────────────────

  it("my-deals Deal Overview hides 'Transaction Value' row for rental deal types", () => {
    const src = readSource("src/app/(dashboard)/brokerage/my-deals/my-deals-view.tsx");

    // Helper imported. my-deals uses BmsDealType (lease / commercial_lease
    // are rentals semantically) so isRentalDealType is the correct helper.
    expect(
      src,
      "must import isRentalDealType from bms-types",
    ).toMatch(/import\s*\{[\s\S]*?isRentalDealType[\s\S]*?\}\s*from\s*["']@\/lib\/bms-types["']/);

    // The InfoRow with label "Transaction Value" is gated on !isRentalDealType(data).
    expect(
      src,
      "'Transaction Value' InfoRow must be gated on !isRentalDealType(data)",
    ).toMatch(
      /\{\s*!isRentalDealType\(data\)\s*&&\s*\([\s\S]{0,400}label="Transaction Value"/,
    );
  });
});
